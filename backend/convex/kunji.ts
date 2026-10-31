import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { findKunjiUser, type KunjiTool } from "./lib/kunji";
import { MAX_TAGS_PER_NOTE } from "./lib/limits";
import { firstLine, preview } from "./lib/preview";
import { appendToNote, insertNote } from "./notes";

// Note Shote's tools for kunji (kunji SPEC.md → App contract). Each runs as the
// user kunji named and only ever sees that user's notes. Writes: create_note
// and append_to_note; nothing deletes, archives or rewrites existing text.

// The app's ConvexErrors are UI codes; kunji shows the message to a model.
const MESSAGES: Record<string, string> = {
  titleTooLong: "The title is too long (200 characters at most).",
  bodyTooLong: "The note would be over the 100 KB limit.",
  tooManyTags: `A note can have at most ${MAX_TAGS_PER_NOTE} tags.`,
  noteInTrash: "That note is in the trash; restore it in the app first.",
};

/** Runs fn, turning the app's error codes into sentences. */
async function inEnglish<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConvexError && typeof err.data === "string" && MESSAGES[err.data]) {
      throw new ConvexError(MESSAGES[err.data]);
    }
    throw err;
  }
}

const SEARCH_LIMIT = 10;
const SEARCH_MAX = 25;

export const access = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => await findKunjiUser(ctx, email),
});

async function ownedNote(ctx: QueryCtx, userId: Id<"users">, id: string): Promise<Doc<"notes">> {
  const noteId = ctx.db.normalizeId("notes", id.trim());
  const note = noteId === null ? null : await ctx.db.get("notes", noteId);
  if (note === null || note.userId !== userId) {
    throw new ConvexError("No such note. Use search_notes to find its id.");
  }
  return note;
}

function where(note: Doc<"notes">): "notes" | "archive" | "trash" {
  return note.deletedAt !== undefined ? "trash" : note.archived ? "archive" : "notes";
}

async function tagNames(ctx: QueryCtx, note: Doc<"notes">): Promise<string[]> {
  const names: string[] = [];
  for (const id of note.tagIds) {
    const tag = await ctx.db.get("tags", id);
    if (tag !== null) names.push(tag.name);
  }
  return names;
}

/** What search returns per note: small, and readable by a model. */
async function summary(ctx: QueryCtx, note: Doc<"notes">) {
  return {
    id: note._id,
    title: note.title || firstLine(note.body) || "Untitled",
    preview: preview(note.body),
    tags: await tagNames(ctx, note),
    where: where(note),
    pinned: note.pinned,
    updatedAt: new Date(note.updatedAt).toISOString(),
  };
}

export const searchNotes = internalQuery({
  args: { userId: v.id("users"), query: v.string(), limit: v.number(), includeTrash: v.boolean() },
  handler: async (ctx, { userId, query, limit, includeTrash }) => {
    const text = query.trim();
    if (!text) throw new ConvexError("The query can't be empty.");
    const found = await ctx.db
      .query("notes")
      .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("userId", userId))
      .take(includeTrash ? limit : SEARCH_MAX * 2);
    const notes = found.filter((n) => includeTrash || n.deletedAt === undefined).slice(0, limit);
    return await Promise.all(notes.map((n) => summary(ctx, n)));
  },
});

export const getNote = internalQuery({
  args: { userId: v.id("users"), id: v.string() },
  handler: async (ctx, { userId, id }) => {
    const note = await ownedNote(ctx, userId, id);
    return { ...(await summary(ctx, note)), title: note.title, body: note.body, preview: undefined };
  },
});

/** "home, Work" → the user's existing tag ids, matched ignoring case. */
async function tagIdsByName(ctx: QueryCtx, userId: Id<"users">, names: string): Promise<Id<"tags">[]> {
  const wanted = names.split(",").map((n) => n.trim()).filter(Boolean);
  if (wanted.length === 0) return [];
  const tags = await ctx.db
    .query("tags")
    .withIndex("by_user_name", (q) => q.eq("userId", userId))
    .collect();
  return wanted.map((name) => {
    const tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      const known = tags.map((t) => t.name).join(", ") || "none yet";
      throw new ConvexError(`No tag named "${name}". The user's tags: ${known}. Tags are created in the app.`);
    }
    return tag._id;
  });
}

export const createNote = internalMutation({
  args: { userId: v.id("users"), title: v.string(), body: v.string(), tags: v.string() },
  handler: async (ctx, { userId, title, body, tags }) =>
    await inEnglish(async () => {
      if (!title.trim() && !body.trim()) throw new ConvexError("A note needs a title or a body.");
      const tagIds = await tagIdsByName(ctx, userId, tags);
      const id = await insertNote(ctx, userId, { title: title.trim(), body, tagIds });
      return await summary(ctx, (await ctx.db.get("notes", id))!);
    }),
});

export const appendNote = internalMutation({
  args: { userId: v.id("users"), id: v.string(), text: v.string() },
  handler: async (ctx, { userId, id, text }) =>
    await inEnglish(async () => {
      if (!text.trim()) throw new ConvexError("The text can't be empty.");
      const note = await appendToNote(ctx, await ownedNote(ctx, userId, id), text);
      return await summary(ctx, note);
    }),
});

export const tools: KunjiTool[] = [
  {
    name: "search_notes",
    description:
      "Search the user's notes by words in the title or body (whole words and word starts), best match first. " +
      "Returns each note's id, title, a short preview, tags and where it is (notes, archive or trash). " +
      "Use get_note to read a note in full.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. \"shopping list\"." },
        limit: { type: "integer", description: `How many notes to return, 1–${SEARCH_MAX} (default ${SEARCH_LIMIT}).` },
        include_trash: { type: "boolean", description: "Also search notes in the trash (default false)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (ctx, userId, input) => {
      const limit = (input.limit as number | undefined) ?? SEARCH_LIMIT;
      if (limit < 1 || limit > SEARCH_MAX) throw new ConvexError(`"limit" must be from 1 to ${SEARCH_MAX}.`);
      return await ctx.runQuery(internal.kunji.searchNotes, {
        userId,
        query: input.query as string,
        limit,
        includeTrash: input.include_trash === true,
      });
    },
  },
  {
    name: "get_note",
    description:
      "Read one of the user's notes in full: title, Markdown body, tags and where it is. The id comes from search_notes.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The note's id from search_notes." } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (ctx, userId, input) =>
      await ctx.runQuery(internal.kunji.getNote, { userId, id: input.id as string }),
  },
  {
    name: "create_note",
    description:
      "Create a new note for the user in Notes. The body is Markdown. Tags must already exist in the app " +
      "(an unknown name is refused with the list of the user's tags). Returns the new note's id and summary.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Optional title, one line, at most 200 characters." },
        body: { type: "string", description: "The note's Markdown text." },
        tags: { type: "string", description: "Optional comma-separated names of existing tags, e.g. \"home, ideas\"." },
      },
      required: ["body"],
      additionalProperties: false,
    },
    handler: async (ctx, userId, input) =>
      await ctx.runMutation(internal.kunji.createNote, {
        userId,
        title: (input.title as string | undefined) ?? "",
        body: input.body as string,
        tags: (input.tags as string | undefined) ?? "",
      }),
  },
  {
    name: "append_to_note",
    description:
      "Add text at the end of one of the user's notes, on a new line (e.g. a new item on a list). " +
      "Existing text is never changed. Notes in the trash are refused. The id comes from search_notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The note's id from search_notes." },
        text: { type: "string", description: "Markdown to add, e.g. \"- oat milk\"." },
      },
      required: ["id", "text"],
      additionalProperties: false,
    },
    handler: async (ctx, userId, input) =>
      await ctx.runMutation(internal.kunji.appendNote, { userId, id: input.id as string, text: input.text as string }),
  },
];

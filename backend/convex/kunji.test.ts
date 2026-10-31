/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { checkInput, secretMatches } from "./lib/kunji";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "kjs_test-secret";
const ME = "me@example.com";
const NOW = Date.UTC(2026, 9, 31, 9, 0);

beforeEach(() => {
  vi.stubEnv("KUNJI_SECRET", SECRET);
  vi.stubEnv("ALLOWED_EMAILS", `${ME},stranger@example.com`);
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: ME, emailVerificationTime: 1 });
    // An unverified sign-up with someone else's email must never count.
    await ctx.db.insert("users", { email: "other@example.com" });
    const strangerId = await ctx.db.insert("users", { email: "stranger@example.com", emailVerificationTime: 1 });
    const tag = await ctx.db.insert("tags", { userId, name: "home", noteCount: 1 });
    const note = (userId: typeof strangerId, title: string, body: string, extra: object = {}) =>
      ctx.db.insert("notes", {
        userId,
        title,
        body,
        searchText: `${title}\n${body}`,
        tagIds: [],
        pinned: false,
        archived: false,
        version: 1,
        updatedAt: NOW,
        ...extra,
      });
    const shopping = await note(userId, "Shopping list", "- milk\n- eggs", { tagIds: [tag], pinned: true });
    await ctx.db.insert("noteTags", { userId, noteId: shopping, tagId: tag });
    await note(userId, "", "Old shopping ideas\nsocks", { archived: true });
    await note(userId, "Trashed shopping", "bread", { deletedAt: NOW });
    const foreign = await note(strangerId, "Their shopping", "secret");
    return { shopping, foreign };
  });
  return { t, ...ids };
}

const post = (body: unknown, secret = SECRET) => ({
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

type T = Awaited<ReturnType<typeof setup>>["t"];
async function call(t: T, tool: string, input: unknown = {}, userEmail = ME) {
  const res = await t.fetch("/kunji/call", post({ tool, input, userEmail }));
  expect(res.status).toBe(200);
  return await res.json();
}

const titles = (result: { title: string }[]) => result.map((r) => r.title).sort();

describe("secret check", () => {
  it("compares exactly", async () => {
    expect(await secretMatches(SECRET, SECRET)).toBe(true);
    expect(await secretMatches(SECRET + "x", SECRET)).toBe(false);
    expect(await secretMatches("", "")).toBe(false);
  });

  it.each([
    ["GET", "/kunji/tools"],
    ["POST", "/kunji/access"],
    ["POST", "/kunji/call"],
  ])("%s %s refuses a wrong or missing secret", async (method, path) => {
    const { t } = await setup();
    const body = method === "POST" ? JSON.stringify({ userEmail: ME, tool: "search_notes" }) : undefined;
    expect((await t.fetch(path, { method, headers: { Authorization: "Bearer nope" }, body })).status).toBe(401);
    expect((await t.fetch(path, { method, body })).status).toBe(401);
  });

  it("refuses everything when KUNJI_SECRET is unset", async () => {
    vi.stubEnv("KUNJI_SECRET", "");
    const { t } = await setup();
    expect((await t.fetch("/kunji/tools", { headers: { Authorization: "Bearer " } })).status).toBe(401);
  });
});

describe("checkInput", () => {
  it("checks required keys, types and unknown fields", () => {
    const schema = {
      type: "object" as const,
      properties: { q: { type: "string" as const }, n: { type: "integer" as const } },
      required: ["q"],
      additionalProperties: false as const,
    };
    expect(checkInput(schema, { q: "x", n: 2 })).toBeNull();
    expect(checkInput(schema, {})).toBe('Missing "q".');
    expect(checkInput(schema, { q: "x", n: 1.5 })).toBe('"n" must be an integer.');
    expect(checkInput(schema, { q: "x", z: 1 })).toBe('Unknown field "z".');
    expect(checkInput(schema, [])).toBe("Input must be a JSON object.");
  });
});

describe("GET /kunji/tools", () => {
  it("lists the tools with their schemas", async () => {
    const { t } = await setup();
    const res = await t.fetch("/kunji/tools", { headers: { Authorization: `Bearer ${SECRET}` } });
    const tools = (await res.json()) as { name: string; inputSchema: { type: string } }[];
    expect(tools.map((x) => x.name)).toEqual(["search_notes", "get_note", "create_note", "append_to_note"]);
    expect(tools.every((x) => x.inputSchema.type === "object" && /^[a-z][a-z0-9_]{0,63}$/.test(x.name))).toBe(true);
  });
});

describe("POST /kunji/access", () => {
  it.each([
    [ME, "ok"],
    ["ME@Example.com ", "ok"],
    ["nobody@example.com", "no_account"],
    ["other@example.com", "no_account"], // unverified
  ])("%s → %s", async (userEmail, status) => {
    const { t } = await setup();
    const res = await t.fetch("/kunji/access", post({ userEmail }));
    expect(await res.json()).toEqual({ status });
  });

  it("is not_allowed once the email leaves ALLOWED_EMAILS", async () => {
    const { t } = await setup();
    vi.stubEnv("ALLOWED_EMAILS", "someone@else.com");
    expect(await (await t.fetch("/kunji/access", post({ userEmail: ME }))).json()).toEqual({ status: "not_allowed" });
  });

  it("is no_account when two verified rows share the email", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => void (await ctx.db.insert("users", { email: ME, emailVerificationTime: 1 })));
    expect(await (await t.fetch("/kunji/access", post({ userEmail: ME }))).json()).toEqual({ status: "no_account" });
  });

  it("needs userEmail", async () => {
    const { t } = await setup();
    expect((await t.fetch("/kunji/access", post({}))).status).toBe(400);
  });
});

describe("POST /kunji/call", () => {
  it("refuses no_account, not_allowed, unknown tools and bad input", async () => {
    const { t } = await setup();
    expect(await call(t, "search_notes", { query: "x" }, "nobody@example.com")).toMatchObject({ ok: false, error: { code: "no_account" } });
    expect(await call(t, "delete_everything")).toMatchObject({ ok: false, error: { code: "unknown_tool" } });
    expect(await call(t, "search_notes", {})).toMatchObject({ ok: false, error: { code: "bad_input", message: 'Missing "query".' } });
    expect(await call(t, "search_notes", { query: "x", limit: 99 })).toMatchObject({ ok: false, error: { code: "tool_error" } });
    vi.stubEnv("ALLOWED_EMAILS", "someone@else.com");
    expect(await call(t, "search_notes", { query: "x" })).toMatchObject({ ok: false, error: { code: "not_allowed" } });
  });

  it("search_notes finds only the user's notes, trash on request", async () => {
    const { t } = await setup();
    const { ok, result } = await call(t, "search_notes", { query: "shopping" });
    expect(ok).toBe(true);
    expect(titles(result)).toEqual(["Old shopping ideas", "Shopping list"]);
    expect(result.find((n: { title: string }) => n.title === "Shopping list")).toMatchObject({
      tags: ["home"],
      where: "notes",
      pinned: true,
      updatedAt: new Date(NOW).toISOString(),
    });
    expect(result.find((n: { title: string }) => n.title === "Old shopping ideas").where).toBe("archive");
    const all = (await call(t, "search_notes", { query: "shopping", include_trash: true })).result;
    expect(titles(all)).toEqual(["Old shopping ideas", "Shopping list", "Trashed shopping"]);
    expect((await call(t, "search_notes", { query: "shopping", limit: 1 })).result).toHaveLength(1);
    expect(await call(t, "search_notes", { query: "  " })).toMatchObject({ ok: false, error: { code: "tool_error" } });
  });

  it("get_note reads a note in full, never someone else's", async () => {
    const { t, shopping, foreign } = await setup();
    const { result } = await call(t, "get_note", { id: shopping });
    expect(result).toMatchObject({ id: shopping, title: "Shopping list", body: "- milk\n- eggs", tags: ["home"], where: "notes" });
    expect(result).not.toHaveProperty("preview");
    for (const id of [foreign, "nonsense"]) {
      expect(await call(t, "get_note", { id })).toMatchObject({
        ok: false,
        error: { code: "tool_error", message: "No such note. Use search_notes to find its id." },
      });
    }
  });

  it("create_note creates a note with existing tags, matched ignoring case", async () => {
    const { t } = await setup();
    const { ok, result } = await call(t, "create_note", { title: " Packing ", body: "- passport", tags: "HOME" });
    expect(ok).toBe(true);
    expect(result).toMatchObject({ title: "Packing", tags: ["home"], where: "notes", pinned: false });
    const row = await t.run((ctx) => ctx.db.get("notes", result.id));
    expect(row).toMatchObject({ body: "- passport", searchText: "Packing\n- passport", version: 1 });
    const tag = await t.run((ctx) => ctx.db.query("tags").first());
    expect(tag?.noteCount).toBe(2);
    expect((await call(t, "search_notes", { query: "passport" })).result).toHaveLength(1);
  });

  it("create_note refuses unknown tags, empty notes and app limits", async () => {
    const { t } = await setup();
    expect(await call(t, "create_note", { body: "x", tags: "work" })).toMatchObject({
      ok: false,
      error: { code: "tool_error", message: 'No tag named "work". The user\'s tags: home. Tags are created in the app.' },
    });
    expect(await call(t, "create_note", { body: "  " })).toMatchObject({ ok: false, error: { message: "A note needs a title or a body." } });
    expect(await call(t, "create_note", { title: "x".repeat(201), body: "y" })).toMatchObject({
      ok: false,
      error: { message: "The title is too long (200 characters at most)." },
    });
  });

  it("append_to_note adds a line at the end and bumps the version", async () => {
    const { t, shopping } = await setup();
    const { ok, result } = await call(t, "append_to_note", { id: shopping, text: "- oat milk" });
    expect(ok).toBe(true);
    expect(result).toMatchObject({ id: shopping, title: "Shopping list" });
    const row = await t.run((ctx) => ctx.db.get("notes", shopping));
    expect(row).toMatchObject({ body: "- milk\n- eggs\n- oat milk", searchText: "Shopping list\n- milk\n- eggs\n- oat milk", version: 2 });
  });

  it("append_to_note refuses trash, other users' notes, empty text and the size limit", async () => {
    const { t, shopping, foreign } = await setup();
    const trashed = (await call(t, "search_notes", { query: "trashed", include_trash: true })).result[0].id;
    expect(await call(t, "append_to_note", { id: trashed, text: "x" })).toMatchObject({
      ok: false,
      error: { message: "That note is in the trash; restore it in the app first." },
    });
    expect(await call(t, "append_to_note", { id: foreign, text: "x" })).toMatchObject({
      ok: false,
      error: { message: "No such note. Use search_notes to find its id." },
    });
    expect(await call(t, "append_to_note", { id: shopping, text: " " })).toMatchObject({ ok: false, error: { message: "The text can't be empty." } });
    expect(await call(t, "append_to_note", { id: shopping, text: "x".repeat(100 * 1024) })).toMatchObject({
      ok: false,
      error: { message: "The note would be over the 100 KB limit." },
    });
    expect(await t.run((ctx) => ctx.db.get("notes", foreign))).toMatchObject({ body: "secret", version: 1 });
  });
});

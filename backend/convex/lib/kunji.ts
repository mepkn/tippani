import type { FunctionReference, HttpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { httpAction, type ActionCtx, type QueryCtx } from "../_generated/server";
import { isAllowedEmail } from "./allowlist";
import { env } from "./env";

// ---------------------------------------------------------------------------
// App contract (kunji SPEC.md → App contract): kunji calls the app's
// GET /kunji/tools, POST /kunji/access and POST /kunji/call with the same
// KUNJI_SECRET. Everything below is generic; copy it as is into the next app.
// ---------------------------------------------------------------------------

/** A JSON Schema object for a tool's input; only the parts checkInput reads are typed. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: "string" | "number" | "integer" | "boolean"; description?: string; enum?: readonly string[] }>;
  required?: readonly string[];
  additionalProperties?: false;
};

export type KunjiTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Runs as the user kunji named; throw ConvexError for a message the user may see. */
  handler: (ctx: ActionCtx, userId: Id<"users">, input: Record<string, unknown>) => Promise<unknown>;
};

export type KunjiAccess = { status: "ok"; userId: Id<"users"> } | { status: "no_account" | "not_allowed" };

export type KunjiCallErrorCode = "no_account" | "not_allowed" | "unknown_tool" | "bad_input" | "tool_error";

/**
 * The user kunji means by this email. Only a single verified users row counts:
 * an unverified sign-up leaves a second row with the same email (Convex Auth's
 * own linking rule, and kunji's gateway rule). Run it inside an internalQuery.
 */
export async function findKunjiUser(ctx: QueryCtx, email: string): Promise<KunjiAccess> {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
    .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
    .take(2);
  if (users.length !== 1) return { status: "no_account" };
  return isAllowedEmail(users[0].email) ? { status: "ok", userId: users[0]._id } : { status: "not_allowed" };
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Constant-time: compares fixed-length digests, so neither length nor content leaks through timing. */
export async function secretMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && expected.length > 0;
}

async function authorized(req: Request): Promise<boolean> {
  const expected = env().KUNJI_SECRET;
  const given = /^Bearer\s+(\S+)$/.exec(req.headers.get("Authorization") ?? "")?.[1];
  return !!expected && !!given && (await secretMatches(given, expected));
}

/** Checks input against the tool's schema: an object, required keys, primitive types, enums. */
export function checkInput(schema: JsonSchema, input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "Input must be a JSON object.";
  const obj = input as Record<string, unknown>;
  for (const key of schema.required ?? []) if (obj[key] === undefined) return `Missing "${key}".`;
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      if (schema.additionalProperties === false) return `Unknown field "${key}".`;
      continue;
    }
    const ok =
      prop.type === "integer" ? Number.isInteger(value) : prop.type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === prop.type;
    if (!ok) return `"${key}" must be ${prop.type === "integer" ? "an" : "a"} ${prop.type}.`;
    if (prop.enum && !prop.enum.includes(value as string)) return `"${key}" must be one of: ${prop.enum.join(", ")}.`;
  }
  return null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function callError(code: KunjiCallErrorCode, message: string): Response {
  return json(200, { ok: false, error: { code, message } });
}

const ACCESS_MESSAGES = {
  no_account: "No account with this email, or it isn't verified yet.",
  not_allowed: "This email is not on the app's allowlist.",
} as const;

/**
 * Adds the three contract routes. `access` is the app's internalQuery that
 * wraps findKunjiUser (a lib file can't define Convex functions itself).
 */
export function addKunjiRoutes(
  http: HttpRouter,
  { tools, access }: { tools: KunjiTool[]; access: FunctionReference<"query", "internal", { email: string }, KunjiAccess> },
) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const emailOf = (body: unknown) => {
    const email = (body as { userEmail?: unknown } | null)?.userEmail;
    return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
  };

  http.route({
    path: "/kunji/tools",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      if (!(await authorized(req))) return json(401, { error: "unauthorized" });
      return json(
        200,
        tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      );
    }),
  });

  http.route({
    path: "/kunji/access",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!(await authorized(req))) return json(401, { error: "unauthorized" });
      const email = emailOf(await req.json().catch(() => null));
      if (email === null) return json(400, { error: "userEmail is required." });
      const { status } = await ctx.runQuery(access, { email });
      return json(200, { status });
    }),
  });

  http.route({
    path: "/kunji/call",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!(await authorized(req))) return json(401, { error: "unauthorized" });
      const body = (await req.json().catch(() => null)) as { tool?: unknown; input?: unknown } | null;
      const email = emailOf(body);
      if (email === null || typeof body?.tool !== "string") return json(400, { error: "tool and userEmail are required." });
      const tool = byName.get(body.tool);
      if (!tool) return callError("unknown_tool", `No tool named "${body.tool}".`);
      const user = await ctx.runQuery(access, { email });
      if (user.status !== "ok") return callError(user.status, ACCESS_MESSAGES[user.status]);
      const input = body.input ?? {};
      const bad = checkInput(tool.inputSchema, input);
      if (bad) return callError("bad_input", bad);
      try {
        return json(200, { ok: true, result: await tool.handler(ctx, user.userId, input as Record<string, unknown>) });
      } catch (err) {
        if (err instanceof ConvexError && typeof err.data === "string") return callError("tool_error", err.data);
        console.error(`kunji tool ${tool.name} failed`, err instanceof Error ? err.message : err);
        return callError("tool_error", "The tool failed.");
      }
    }),
  });
}

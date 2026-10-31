/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as kunji from "../kunji.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_allowlist from "../lib/allowlist.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_kunji from "../lib/kunji.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_preview from "../lib/preview.js";
import type * as lib_tagLinks from "../lib/tagLinks.js";
import type * as notes from "../notes.js";
import type * as otp from "../otp.js";
import type * as tags from "../tags.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  kunji: typeof kunji;
  "lib/access": typeof lib_access;
  "lib/allowlist": typeof lib_allowlist;
  "lib/env": typeof lib_env;
  "lib/kunji": typeof lib_kunji;
  "lib/limits": typeof lib_limits;
  "lib/preview": typeof lib_preview;
  "lib/tagLinks": typeof lib_tagLinks;
  notes: typeof notes;
  otp: typeof otp;
  tags: typeof tags;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

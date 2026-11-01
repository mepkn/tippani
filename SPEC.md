# tippani — Build Spec

A private Markdown notes app for my Android phone and the web at `https://tippani.pknspace.com`.
Many notes, each with a title, a Markdown body and tags. Notes sync live. Not public. Only
allowlisted emails can sign in.

Sister project of `../yaad-dila`, `../scratch` and `../alp` (Expo + Convex). **Copy their structure,
scripts and conventions** wherever this spec doesn't say otherwise. Before starting, read:
- yaad-dila: README, `convex/auth.ts`, `convex/lib/allowlist.ts`, `convex/lib/access.ts`,
  `convex/tags.ts` (the tags and join-table pattern), `scripts/`, `src/components/cmp/`
- `../scratch/SPEC.md` (live sync rules)

## Product

- **Note list** (home):
  - Pinned notes first, then the rest by `updatedAt`, newest first.
  - Each row shows the title (or the first line of the body if there's no title), a short plain-text
    preview, tags and the relative edit time.
  - Views: **Notes**, **Archive** and **Trash**. Tags and search live in their own tabs.
- **Tabs:** Notes, Tags, Search. A labelled left sidebar from 768px wide; settings is a header gear.
- **Search tab:** server-side, over every note including Archive and Trash, paginated.
- **Tag screen:** from the Tags tab; every note with the tag, in any view, paginated.
  - A "New note" button.
- **A note:**
  - The title is a single-line plain input. The body is Markdown.
  - The note **opens in view mode**, rendered with `EnrichedMarkdownText`. Tap Edit (or the body
    on Android) to edit. This is required, not cosmetic; see "Editor limits" below.
  - Autosave about 500 ms after typing stops. Show a small Saving… / Saved / Offline label.
  - Actions:
    - pin / unpin
    - archive / unarchive
    - edit tags
    - copy the Markdown
    - move to trash
- **Trash:** restore, or delete forever (with a confirm dialog). Notes in the trash for more than
  30 days are deleted by a daily cron. "Empty trash" (with confirm).
- **Tags:** per user, created inline from the note's tag picker. Rename and delete them in
  Settings → Tags. Deleting a tag removes it from its notes and leaves the notes alone.
- **Size cap:** 100 KB per note body and 200 chars per title, enforced on the server. At most 20 tags
  per note, 50 chars per tag name.
- **Live sync, last write wins**, same as scratch:
  - Each note has a `version`. A save based on an older version still wins and doesn't error.
  - Remote changes come through the Convex subscription.
  - **Apply a remote change only when the note isn't focused or has no unsaved local edits.** Never
    push a remote value into a focused editor.
- **Not in v1:**
  - sharing or public links
  - checklists / task-list editing
  - images and attachments
  - offline edits (Convex has no offline writes)
  - version history
  - folders
  - math, video
  - iOS builds

## Editor: react-native-enriched-markdown

Use `react-native-enriched-markdown` (Software Mansion, MIT). Read its README and `docs/INPUT.md`,
`docs/TEXT.md` and `docs/WEB.md` for the installed version; don't trust memory.

- **Viewing (Android and web):** `EnrichedMarkdownText`, with GFM enabled.
- **Editing on Android:** `EnrichedMarkdownTextInput`.
  - It gives rich text and outputs Markdown: bold, italic, underline, strikethrough, links (with
    auto-link), headings, and nested bullet and numbered lists.
  - Enable `markdownShortcuts` (`# `, `- `, `1. `).
  - Add a small format toolbar above the keyboard: B, I, S, H1–H3, bullet list, numbered list,
    link, indent/outdent. Highlight active states from `onChangeState`.
- **Editing on web:** the input is native-only, so web uses a plain monospace multiline `TextInput`
  showing raw Markdown, with an Edit / Preview toggle that previews with `EnrichedMarkdownText`.
  Use platform files (`note-editor.tsx` / `note-editor.web.tsx`) behind one `cmp-` wrapper.
- **Editor limits (why view mode is the default):**
  - The Android editor can't produce blockquotes, code blocks, tables or task lists, and list items
    are single-line. A note written on web with those may be flattened when it's loaded into the
    Android editor and saved.
  - **Before building the editor screen, write a round-trip check:** load a sample note covering
    every GFM feature into the input and serialize it back. Write down what survives in the README.
  - If the body contains anything the Android editor can't round-trip (detect fenced code, tables,
    blockquotes, task lists or multi-paragraph list items), show a notice in edit mode and edit
    that note as raw Markdown (the web editor) on Android too. Don't silently lose content.
- **Native config** in `package.json`, to keep the APK small:
  ```json
  "enriched-markdown": {
    "enableMath": false,
    "enableVideo": false,
    "codeHighlightLanguages": ["typescript", "javascript", "python", "go", "bash", "json"]
  }
  ```
- It needs the New Architecture (the default) and a **development build**, like yaad-dila. It doesn't
  run in Expo Go. Check the library's compatibility table against the Expo SDK's React Native version
  before installing.
- Its `postinstall` downloads native assets, so don't install with `--ignore-scripts`.

## Access control (most important part)

Same as scratch and alp:

- Convex Auth with the **Password** provider (email + password).
- **`ALLOWED_EMAILS`**, a Convex env var: a comma-separated list, case-insensitive, trimmed.
  - Checked in the Password provider's `profile()`, which runs for **both sign-up and sign-in,
    before anything is stored**. A non-allowlisted email never gets a user row.
  - Checked **again on every query and mutation** in `requireUserId`, so removing an email ends
    that user's sessions.
  - **Fails closed:** if it's unset or empty, nobody can sign in.
  - Generic `ConvexError("notAllowed")`, shown as "This account isn't allowed to use this app."
    It must not reveal which emails are on the list.
  - Copy `isAllowedEmail` from `../yaad-dila/convex/lib/allowlist.ts`, unchanged.
- Set it on **every** deployment (local and prod): `npx convex env set ALLOWED_EMAILS <email>`.
  **Ask me which email to use; don't put it in the repo.**
- Every note and tag is owned by a user. Every function gets the user from `getAuthUserId` and checks
  ownership of every id passed in (`getOwnedNote`, `getOwnedTag` in `convex/lib/access.ts`, like
  yaad-dila). Missing and foreign ids give the same error.
- No public queries or HTTP endpoints besides the Convex Auth routes.

## Data model

```ts
notes: defineTable({
  userId: v.id("users"),
  title: v.string(),
  body: v.string(),                       // Markdown
  searchText: v.string(),                 // title + "\n" + body, kept in sync on every write
  tagIds: v.array(v.id("tags")),
  pinned: v.boolean(),
  archived: v.boolean(),
  deletedAt: v.optional(v.number()),      // UTC ms; set = in trash
  version: v.number(),
  updatedAt: v.number(),                  // UTC ms
})
  .index("by_user_state_updated", ["userId", "archived", "deletedAt", "updatedAt"])
  .index("by_deleted", ["deletedAt"])
  .searchIndex("search_text", {
    searchField: "searchText",
    filterFields: ["userId"],
  }),

tags: defineTable({
  userId: v.id("users"),
  name: v.string(),
})
  .index("by_user_name", ["userId", "name"]),

noteTags: defineTable({                   // mirrors notes.tagIds, as in yaad-dila's reminderTags
  userId: v.id("users"),
  noteId: v.id("notes"),
  tagId: v.id("tags"),
})
  .index("by_tag", ["tagId"])
  .index("by_note", ["noteId"]),
```
- Use `_id` and `_creationTime`. Index every query; no table scans and no `.filter()` over big ranges.
- Tag names are unique per user, case-insensitive. Store them trimmed.
- The list query pages over `by_user_state_updated` (`usePaginatedQuery`). Sort pinned notes to the
  top with a separate small query (pinned, not archived, not deleted) rather than a second sort key.
  If that's awkward, add a `pinned` field to the index; pick one and explain it in the README.
- A tag's notes page through `noteTags.by_tag`, then load each note.
- Search uses `search_text`, filtered by user only, relevance-ordered, paginated.
- Purging the trash: `crons.ts` runs daily. It reads `by_deleted` for `deletedAt < now - 30 days` in
  batches and deletes the notes and their `noteTags` rows, rescheduling itself while there are more.

## Convex API

- `notes.list({ view: "notes" | "archive" | "trash", paginationOpts })` query (pinned first in Notes)
- `notes.byTag({ tagId, paginationOpts })` query
- `notes.search({ query, paginationOpts })` query
- `notes.get({ id })` query
- `notes.create({ title?, body?, tagIds? })` mutation → `{ _id }`
- `notes.save({ id, title, body, baseVersion })` mutation → `{ version }`. Last write wins.
- `notes.setTags({ id, tagIds })`, `notes.setPinned({ id, pinned })`,
  `notes.setArchived({ id, archived })` mutations
- `notes.trash({ id })`, `notes.restore({ id })`, `notes.deleteForever({ id })` (only from the trash),
  `notes.emptyTrash()` mutations
- `tags.list()` → `{ _id, name, count }[]`, `tags.create({ name })`, `tags.rename({ id, name })`,
  `tags.remove({ id })`
- `users.me()` query → `{ email }`
- Internal: `notes.purgeTrash` internalMutation (for the cron)
- Error codes are plain-string `ConvexError`s: `notAuthenticated`, `notAllowed`, `noteNotFound`,
  `tagNotFound`, `titleTooLong`, `bodyTooLong`, `tooManyTags`, `tagNameInvalid`, `tagNameTaken`,
  `notInTrash`. The client translates them like yaad-dila's `src/lib/errors.ts`.
- **Read `convex/_generated/ai/guidelines.md` before writing Convex code.**

## Screens (Expo Router)

- `(auth)/sign-in`, `(auth)/sign-up`: the same form component as yaad-dila.
- `(app)/index`: the note list, with search, the tag filter, view tabs (Notes / Archive / Trash) and
  the "New note" button.
- `(app)/note`: one note, **chosen by query parameter: `/note?id=<id>`**. Use a fixed route, not
  `note/[id]`, so the static web export has a real `note.html` and the Caddy block needs no extra
  rule. `/note` without an id creates a note on first save.
- `(app)/settings`:
  - signed-in email
  - Tags: rename and delete
  - theme: light / dark / system
  - log out
- English only. Keep strings in `src/lib/strings.ts`.
- Android: **share text into tippani** (Android share target) creates a new note with the shared
  text as the body. It's optional, so build it last.

## Stack and conventions (match the other repos)

- Expo (latest SDK; read the versioned docs, don't trust memory), Expo Router, TypeScript strict.
  - One codebase for Android and web. Web uses `"output": "static"`.
- NativeWind (Tailwind v3) + React Native Reusables.
  - RNR primitives go in `src/components/ui/`.
  - Screens only use wrappers in `src/components/cmp/cmp-*.tsx`.
- Keyboard: `react-native-keyboard-controller`, with `KeyboardProvider` at the root.
  - Form screens use `CmpKeyboardAwareScrollView`, which scrolls the focused field above the keyboard.
  - A full-height editor with a bottom bar uses `CmpKeyboardPadding`.
  - Dialogs rise by half the keyboard height (in `components/ui/dialog.tsx`).
  - Lists with a search box at the top, and screens without inputs, need nothing.
  - No fixed offsets such as `mb-[40vh]`, no RN `KeyboardAvoidingView`, no bottom sheets.
- `@/` → `src/`, `@convex/` → `convex/`. Node 22.18+ (`.nvmrc` = 22).
- Scripts (copy from yaad-dila):
  - `typecheck`, `lint`, `test`, and `check` (all three)
  - `deploy:backend` (reads `CONVEX_DEPLOY_KEY` from `.env.prod.local` with the shared literal read loop)
  - `deploy:web` and `deploy:web:dry`
  - android build scripts
- **Tests (convex-test):**
  - non-allowlisted sign-in rejected
  - removed email loses access
  - user A can't read, search, edit, tag, trash or delete user B's notes, or use B's tags
  - size caps and the tag limit
  - version bumps, and a stale `baseVersion` still saves
  - `searchText` stays in sync with title and body
  - trash, restore, and delete-forever only from the trash
  - the purge deletes notes older than 30 days in the trash, and their `noteTags`, and nothing else
  - deleting a tag removes it from notes and the join table
  - tag name uniqueness (case-insensitive)
  - Stub `ALLOWED_EMAILS` with `vi.stubEnv` in the test helper.
- Repo files:
  - README (same layout as yaad-dila, plus the editor round-trip findings)
  - `.env.example` (lists `ALLOWED_EMAILS` under the Convex-side vars, and the deploy vars as placeholders)
  - AGENTS.md, CLAUDE.md, LICENSE
  - `.gitignore` covering `.env*.local` and `.eas-token`
- App id `com.pknspace.tippani`, scheme `tippani`, display name "tippani".
- Git remote: `https://github.com/mepkn/tippani`.

## Deployment

- **Backend:** a new Convex project `tippani`.
  - Set `JWT_PRIVATE_KEY` and `JWKS` (`npx @convex-dev/auth`), `SITE_URL=tippani://`, and
    `ALLOWED_EMAILS` on prod.
- **Web:** deploy the same way as scratch:
  - `npx expo export -p web` produces `dist/`.
  - `scripts/deploy-web.sh` runs check, the export, and `rsync -avz --delete dist/` over SSH to
    `DEPLOY_DIR`.
  - `DEPLOY_HOST`, `DEPLOY_PORT` and `DEPLOY_DIR` live in `.env.prod.local`. Never write the VPS host,
    IP or port into tracked files.
  - `EXPO_PUBLIC_CONVEX_URL` for the web export comes from `.env.prod.local` too.
  - One-time VPS setup (done; no sudo needed). `DEPLOY_DIR=/var/www/tippani`, owned by the
    deploy user. Block in `/etc/caddy/sites/tippani.caddy`:
    ```caddy
    http://tippani.pknspace.com:8080 {
          root * /var/www/tippani
          try_files {path} {path}.html /index.html
          encode gzip
          file_server
    }
    ```
    - Add a cloudflared Public Hostname `tippani.pknspace.com` → `http://localhost:8080`.
    - Don't try to run sudo; give me the exact one-line command to run.
- **Android:** EAS under my personal Expo account. Run `source .eas-token` (git-ignored).
  **Never log out or replace the global eas login.** Prefer local builds into `dist/`.

## Rules for the agent

- No AI attribution or Co-Authored-By lines in commits or PRs.
- Never print secrets: deploy keys, tokens, `.env.prod.local` values, VPS details.
- Commit, push or deploy only when I ask.

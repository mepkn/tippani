# note-shote

A private Markdown notes app: many notes, each with a title, a Markdown body and tags, synced
live between an Android phone and the web at <https://note-shote.pknspace.com>. Only
allowlisted emails can sign in.

Platforms: web (a separate Vite app in `web/`, on the VPS) and Android (Expo in `mobile/`, sideloaded APK).
The Convex backend in `backend/` serves both. There is no root `package.json`: `cd` into a part to run its scripts.

## Features

- Note list: pinned notes first, then newest edit first. Title (or the body's first line),
  a plain-text preview, tags and the relative edit time.
- Tabs: Notes (Notes / Archive / Trash views), Tags and Search. Bottom tabs on phones; from 768px
  wide a labelled sidebar on the left. The settings gear is in the Notes header.
- Search tab: server-side search over every note (Archive and Trash included), paginated.
- Tags tab: tap a tag to see all its notes in every view, paginated.
- Notes open in view mode (rendered GFM). Tap Edit (or the body, on Android) to edit.
  - Android: rich editor with Markdown shortcuts (`# `, `- `, `1. `) and a format toolbar.
  - Web: three panes (sidebar with views and tags, note list, open note) from 768px wide;
    phones show the list or the note. Raw Markdown in a monospace box; Preview switches back to
    the rendered view. The open note's id is in the URL hash.
- Autosave about 500 ms after typing stops, with a Saving… / Saved / Offline label.
- Pin, archive, tags, copy Markdown, move to trash. Trash: restore, delete forever, empty trash.
  Notes in the trash for more than 30 days are deleted by a daily cron.
- Tags are created from a note's tag picker; rename and delete them in Settings.
- Limits (server-enforced): 100 KB body (UTF-8 bytes), 200-char title, 20 tags per note,
  50-char tag names.
- Light, dark or system theme.
- Update check (Android): on launch (and Settings → Check for updates) the app compares its build with the latest GitHub release, downloads the new APK, opens Android's installer, and deletes the downloaded APK on the next launch.

## Stack

Expo (SDK 57) · Expo Router · TypeScript · NativeWind + React Native Reusables ·
Convex (database, auth, search, cron) · Convex Auth (password) ·
`react-native-enriched-markdown` 1.1 (rendering and the Android editor).
Web: React 19 · Vite · Tailwind CSS v4 · shadcn/ui (Base UI) · react-markdown + remark-gfm.

## Development

Requires Node 22.18+ (`.nvmrc` pins 22).

### 1. Install and run Convex locally

```sh
(cd mobile && npm install)   # each part has its own node_modules; don't use --ignore-scripts: enriched-markdown's postinstall fetches native assets
(cd web && npm install)
cd backend && npm install    # backend: convex and its tests
printf 'EXPO_PUBLIC_CONVEX_URL=\nEXPO_PUBLIC_CONVEX_SITE_URL=\n' > .env.local   # first time only
npm run dev                  # first run: choose a local deployment (no account needed)
```

This writes `EXPO_PUBLIC_CONVEX_URL` to `backend/.env.local` (the empty line tells it the name;
there's no Expo in `backend/`, so it would otherwise write `CONVEX_URL`). Both apps read this one
file. Keep it running; it redeploys whenever `backend/convex/` changes. The other env files are
described in `backend/.env.example` and `web/.env.example`.

> **Phone vs. local backend:** `127.0.0.1` on a phone is the phone itself.
> - **Android emulator:** set `EXPO_PUBLIC_CONVEX_URL=http://10.0.2.2:<port>`.
> - **USB device:** `adb reverse tcp:<port> tcp:<port>` for the cloud and site ports in `backend/.env.local`.
> - **Device on the same Wi-Fi:** use your computer's LAN IP.
>
> Restart Metro after changing `backend/.env.local`.

### 2. Configure Convex Auth (once per deployment)

```sh
cd backend
npx @convex-dev/auth      # interactive: generates JWT_PRIVATE_KEY + JWKS
npx convex env set SITE_URL http://localhost:5173
npx convex env set ALLOWED_EMAILS you@example.com   # comma-separated; nobody else can sign up or sign in
```

`ALLOWED_EMAILS` fails closed: if it's unset, every sign-up, sign-in and API call is refused.

### 3. Run the app

The Android editor is a native module, so Android needs a **development build** (not Expo Go).

```sh
cd web && npm run dev            # web app on http://localhost:5173
cd mobile && npm run android     # build and install a development build on a USB phone
cd mobile && npm start           # Metro for the development build
```

## Scripts

| Command | What it does |
|---|---|
| `backend/`: `npm run dev` | Local Convex backend with hot reload |
| `backend/`: `npm run typecheck` | `convex/` typecheck |
| `backend/`: `npm run lint` | ESLint for `convex/` |
| `backend/`: `npm test` | convex-test (allowlist, ownership, limits, versions, search, trash, purge, tags) |
| `backend/`: `npm run check` | Typecheck, lint and tests |
| `mobile/`: `npm start` | Metro for the development build, with `backend/.env.local` |
| `mobile/`: `npm run android` | Build and install the development build on a USB phone |
| `mobile/`: `npm run icons` | Regenerate the app icon and splash images in `mobile/assets/images` |
| `web/`: `npm run dev` | Vite dev server for the web app (reads `EXPO_PUBLIC_CONVEX_URL` from `backend/.env.local`) |
| `scripts/check.sh` | `npm run check` in `backend/`, `mobile/` (incl. the editor-compat detector tests) and `web/` |
| `scripts/deploy-backend.sh` | Checks, then deploys `backend/convex/` to production (`DRY_RUN=1` previews) |
| `scripts/deploy-web.sh` | Checks, builds `web/` with the production URL, rsyncs `web/dist/` to the VPS |
| `DRY_RUN=1 scripts/deploy-web.sh` | The same, but rsync only shows what would change |
| `scripts/build-android.sh preview cloud` | Installable APK, built on EAS cloud |
| `scripts/build-android.sh preview local` | The same APK, built on this Mac into `mobile/dist/` |
| `scripts/build-android.sh production cloud` | Play Store AAB on EAS cloud |
| `scripts/build-android.sh production local` | The same AAB, built locally into `mobile/dist/` |
| `scripts/eas.sh <args>` | Any other `eas` command as the personal account |

## Deployment

Three parts: the Convex production deployment `decisive-mockingbird-534`
(`https://decisive-mockingbird-534.convex.cloud`, project `note-shote`), the static web app on
the VPS, and the Android app built with EAS under the personal Expo account.

### One-time setup (done, except the VPS and EAS)

- `backend/.env.prod.local` (git-ignored) holds `CONVEX_DEPLOY_KEY`; `web/.env.prod.local` holds
  the production `VITE_CONVEX_URL` and `DEPLOY_HOST` / `DEPLOY_PORT` / `DEPLOY_DIR`. See the
  `.env.example` next to each. The scripts read them line by line as literal `KEY=VALUE`; they
  are never sourced. Deploy key, run in `backend/`:
  `npx convex deployment token create note-shote-deploy --deployment praveen-nirmalkar:note-shote:production --save-env .env.prod.local`.
- `mobile/.eas-token` (git-ignored) holds `export EXPO_TOKEN=...` for the personal Expo account. The scripts read it, so the global `eas` login is never used or changed.
- On the production Convex deployment: `JWT_PRIVATE_KEY`, `JWKS` (`npx @convex-dev/auth --prod`),
  `SITE_URL=noteshote://auth` (a bare `noteshote://` breaks code emails: Convex Auth strips the trailing `/`), `ALLOWED_EMAILS`, `RESEND_API_KEY`, and `KUNJI_SECRET` / `KUNJI_URL` for kunji.
- `npx eas-cli init` (via `scripts/eas.sh init`) links the EAS project and writes `extra.eas.projectId`;
  the EAS environments `preview` and `production` need `EXPO_PUBLIC_CONVEX_URL` set to the production URL.
- VPS: `DEPLOY_DIR=/var/www/note-shote`, owned by the deploy user. System Caddy block:

  ```caddy
  http://note-shote.pknspace.com:8080 {
        root * /var/www/note-shote
        try_files {path} /index.html
        encode gzip
        file_server
  }
  ```

  A cloudflared Public Hostname maps `note-shote.pknspace.com` → `http://localhost:8080`.

### Backend

```sh
scripts/deploy-backend.sh    # checks, then npx convex deploy to production
```

### Web

```sh
DRY_RUN=1 scripts/deploy-web.sh   # see what would change
scripts/deploy-web.sh             # checks, build, rsync --delete; Caddy serves it immediately
```

### Android

```sh
scripts/build-android.sh preview local
adb install -r mobile/dist/note-shote-preview-*.apk
```

## How it works

- **The web app** (`web/`) is its own Vite SPA: `NotesPage` (layout and URL hash), `Sidebar` / `SourceMenu`, `NoteList` (paginated views, tag lists and search), `NoteEditor` (same autosave and sync rules as the app), tag dialogs. It imports the backend through the `@convex` alias to `../backend/convex`; strings are in `web/src/lib/strings.ts`.
- **The Android app** (`mobile/`, own `package.json`) uses Expo Router, NativeWind and React Native Reusables. The RNR primitives live in `mobile/src/components/ui/`, and screens only use the app's own wrappers in `mobile/src/components/cmp/cmp-*.tsx` (plus composites built from them: `note-row`, `tag-picker`, `auth-form`). All strings are in `mobile/src/lib/strings.ts`. It imports the backend through the `@convex` alias; `mobile/metro.config.js` watches `../backend/convex` and resolves its packages from `mobile/node_modules`, so EAS builds need only the `mobile/` install. Its scripts load `backend/.env.local` with `node --env-file-if-exists`.
- **Convex** (`backend/convex/`) is the entire backend.
  - `schema.ts`: `notes`, `tags`, `noteTags` (the join table mirroring `notes.tagIds`), plus the Convex Auth tables.
  - `auth.ts`: Convex Auth with the Password provider. `profile()` runs for sign-up, sign-in and reset before anything is stored and refuses emails not in `ALLOWED_EMAILS` with a generic `notAllowed`. `lib/access.ts` `requireUserId` re-checks the list on every call, so removing an email also ends that user's sessions. Sign-up and password reset need a 6-digit code by email (`otp.ts`, sent through Resend from `Note Shote <noreply@send.pknspace.com>`; without `RESEND_API_KEY` the code is only logged in the `convex dev` output). `getOwnedNote` / `getOwnedTag` give the same error for missing and foreign ids.
  - `kunji.ts` + `lib/kunji.ts`: the kunji app contract (`GET /kunji/tools`, `POST /kunji/access`, `POST /kunji/call`, Bearer `KUNJI_SECRET`). Tools `search_notes`, `get_note`, `create_note`, `append_to_note` run as the single verified user with kunji's email; writes share `insertNote` / `appendToNote` with `notes.ts`, and nothing deletes or rewrites text.
- **Updates** (`mobile/src/lib/update.ts`): the Release workflow builds with `EXPO_PUBLIC_COMMIT` set to the short SHA, the same as the release tag. On launch the app asks GitHub for the latest release; a different tag offers the update. The APK is downloaded to the app's cache (`update/`) and opened with `INSTALL_PACKAGE` (needs `REQUEST_INSTALL_PACKAGES`). Every launch deletes that folder. Builds without a SHA (dev) skip the check.
  - `notes.ts`: list, byTag, search, get, create, save (last write wins; `version` bumps, a stale `baseVersion` still saves), setTags, setPinned, setArchived, trash, restore, deleteForever, emptyTrash, and the internal `purgeTrash` run daily by `crons.ts`. `searchText` (`title + "\n" + body`) is rewritten on every save.
  - `tags.ts`: list (with note counts), create, rename, remove. Names are trimmed and unique per user ignoring case. Counts are `tags.noteCount`, kept in step by `lib/tagLinks.ts` (every `noteTags` insert and delete goes through it), so listing tags never counts join rows. Removing a tag deletes it at once and clears its join rows and note `tagIds` in batches of 100.
  - `users.ts`: `me`, for the email in Settings.
- **Sync** (`mobile/src/lib/use-note.ts`). Edits are saved 500 ms after typing stops, and immediately when a field loses focus. A subscription result is applied only while neither the title nor the body is focused and there are no unsaved or in-flight edits, so a remote value never lands in a focused editor; results older than the last saved version are ignored. `/note` without an id creates the note on the first save.
- **Auth tokens** are kept in `expo-secure-store` on Android and `localStorage` on web.

### Index design: pinned in the index

The spec allowed either a separate pinned query over the spec'd index or adding `pinned` to it.
A pinned query over `["userId","archived","deletedAt","updatedAt"]` would scan every live note
to find the pinned ones, so the index is `by_user_state_pinned_updated`:
`["userId", "archived", "deletedAt", "pinned", "updatedAt"]`. With two invariants every view is a
single paginated index range; in Notes, descending order puts pinned notes first:

- a pinned note is never archived (archiving unpins, pinning unarchives);
- a trashed note is neither pinned nor archived (restoring it brings it back to Notes).

| Query | Range |
|---|---|
| Notes | `userId, archived=false, deletedAt=unset`, desc (pinned, then newest edit) |
| Archive | `userId, archived=true, deletedAt=unset`, desc |
| Trash | `userId, archived=false, deletedAt ≥ 0`, desc (most recently trashed first) |
| `byTag` | `noteTags.by_tag` desc, paginated, then each note; every view, most recently tagged first |
| Search | `search_text` filtered by user only, paginated, best match first; every view |
| Purge | `by_deleted`, `0 ≤ deletedAt < now − 30 days`, 100 per batch, reschedules while full |

### Editor round-trip

`EnrichedMarkdownTextInput` (Android) only models paragraphs, H1–H6, single-line nested
bullet/numbered lists, and bold / italic / underline / strikethrough / links (plus spoilers).
Loading Markdown into it parses with md4c and keeps only those; `getMarkdown()` serializes them back.

`mobile/src/lib/roundtrip-sample.ts` covers every GFM feature, and the dev-only `/roundtrip` screen loads
it into the input, serializes it and shows each line before → after.

| Feature | Survives? |
|---|---|
| `#`–`######` headings, paragraphs | Yes (a blank line is added between adjacent headings) |
| `**bold**`, `*italic*`, `~~strike~~`, `***both***`, `[text](url)` | Yes |
| `_x_` | Read as **underline** and written back as `_x_`. The viewer uses md4c's underline flag too, so `_x_` means underline everywhere in this app. |
| Bullet / numbered lists, nested | Yes (3-space indent; a blank line is added between a bullet list and a following numbered list) |
| Soft line breaks inside a paragraph | Kept |
| Multi-paragraph ("loose") list items | **No, and lossy**: the continuation is glued onto the item with no space (`- loose itemcontinuation paragraph`) |
| Blockquotes | No: `>` lost, text becomes a paragraph |
| Fenced code | No: fences lost, code becomes a paragraph |
| Inline code | No: backticks lost |
| Backslash escapes | No: `\*star\*` comes back as `*star*` (which then renders as italic) |
| Tables | **No, and lossy**: cell text is concatenated (`ab12`) |
| Task lists | No: `[ ]` / `[x]` lost, items stay as bullets |
| Thematic breaks | Dropped |
| Images | Replaced by their alt text |

**What the app does about it** (`mobile/src/lib/markdown-compat.ts`): when you start editing on Android,
a body containing fenced or indented code, tables, blockquotes, task lists, multi-paragraph list
items, thematic breaks, images, inline code, HTML, backslash escapes or setext headings is edited
as raw Markdown (the web editor), with a notice. The rich editor also only reports changes while
it's focused, so merely opening a note never rewrites it.

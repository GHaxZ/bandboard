# BandBoard V3 — Implementation Plan

A from-scratch rebuild of the band rehearsal / practice manager prototyped in
`prototype/`. Same tech stack, same feature set, but with the architectural
debt called out in `prototype/CONTINUE.md` fixed at the foundation rather than
patched around. **This document is the single source of truth for
implementation — every decision below is final and should not be re-litigated
during the build.**

---

## 1. Goal & Scope

Reimagine BandBoard as a clean, responsive, dark-aesthetic web app that lets a
band:

1. Maintain a **Song Library** auto-enriched from public sources (Songsterr
   tabs/tunings, iTunes album art, Genius lyrics link, YouTube backing tracks
   + tab/lesson videos).
2. Schedule **Rehearsals**, each with an ordered **Setlist** drawn from the
   library.
3. Track per-member **learning progress** (Not Learned → Learning → Ready to
   Play → Mastered) on a drag-and-drop **Kanban board** and on each song.
4. Practice a single song in **Practice Mode** — two synced YouTube players
   (backing track + tab/lesson), volume/speed, private start-offsets, up to 9
   practice markers, keyboard shortcuts.
5. Run a hands-free **Rehearsal Autoplay Mode** that plays the setlist
   back-to-back with a countdown between songs.
6. Sync each member's private state (instrument preference, progress, markers,
   offsets, autoplay config) to an **anonymous device UUID**, with export /
   import / cross-device sync.
7. Gate the whole deployment behind an optional **shared secret**.

Out of scope: multi-user accounts, real-time collaboration, mobile native apps,
audio waveform editing, OAuth.

---

## 2. Tech Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | `force-dynamic` on DB-backed pages |
| Runtime | **React 19** | |
| Language | **TypeScript 5** (strict) | |
| Styling | **Tailwind CSS v4** | `@import "tailwindcss"` in `globals.css` |
| Components | **shadcn/ui** (`base-nova` style, `neutral` base) | `components.json` identical to prototype |
| Icons | **lucide-react** | |
| Toasts | **sonner** | |
| DB | **SQLite** via **better-sqlite3** | single file `sqlite.db` |
| ORM | **Drizzle ORM** + **drizzle-kit** | migrations committed under `drizzle/` |
| Drag & drop | **@hello-pangea/dnd** | Kanban only |
| State (client) | **Zustand** (player store) + React state elsewhere | replaces the prototype's `useRef`-maze |
| Class utils | **clsx** + **tailwind-merge** | `cn()` helper |
| Fonts | **Inter** via `next/font/google` | |

**Dropped vs prototype:** `next-themes` (app is dark-only; hardcode `dark` on
`<html>` — one less dependency, no theme flash to manage). `@base-ui/react` is
kept because shadcn `base-nova` primitives depend on it.

**Added vs prototype:** `zustand` — the single deliberate new dependency, used
*only* to hold live YouTube player state and break the stale-closure chain that
the prototype fought with dozens of `useRef` mirrors.

---

## 3. Quirks Fixed at the Foundation

The `CONTINUE.md` handover lists four debts. Here is exactly how V3 prevents
each — these are not runtime workarounds, they are structural.

### 3.1 Stale closures in YouTube callbacks
**Root cause:** `onStateChange` / `onReady` callbacks close over state captured
at player-construction time. The prototype mirrors every piece of state
(`currentSongIndex`, `autoplayEnabled`, `progressMap`, …) into a parallel set
of `useRef`s and manually syncs them with `useEffect`.

**V3 fix:** a single Zustand store (`usePlayerStore`) holds *all* mutable
player-affecting state (current index, isPlaying, volume, speed, active video,
autoplay flag, transition timeout, markers, offsets, progress map). YT event
callbacks read `usePlayerStore.getState()` — always fresh, never stale, no ref
mirroring. The store is the only source of truth; components subscribe to
slices. Players themselves still live in `useRef` (they're imperative DOM
objects), but every *decision* inside a callback reads the store.

### 3.2 localStorage abuse
**Root cause:** settings (`bandboard_instrument`, `bandboard_autoplay_*`) were
duplicated between `localStorage` and the DB, with ad-hoc migration code.

**V3 fix (rule, enforced):** `localStorage` holds **exactly two keys** and
nothing else:
- `bandboard_uid` — the anonymous device UUID (mirror of the cookie, used as a
  fallback / for the sync-another-device flow).
- `bandboard_secret` — the shared secret (client-side gate cache).

Every other preference lives in the `userSettings` / `userSongProgress` tables,
keyed by the UUID read from the cookie server-side. No migration code, no
fallback reads, no `localStorage.getItem("bandboard_instrument")` anywhere
outside settings.

### 3.3 IFrame focus stealing
**Root cause:** clicking inside the YouTube iframe moves focus to the iframe,
after which `window` keydown listeners (Space to pause, arrows to seek, numbers
for markers) stop firing.

**V3 fix:** keep the focus-guard behavior — it is genuinely required by the YT
iframe — but implement it cleanly as one hook `useIframeFocusGuard` that:
- on `window` `blur`, detects whether `document.activeElement` is an `IFRAME`
  and records the active player's time/state;
- on `document` `focusin` originating from an iframe, blurs the iframe and
  re-focuses `window`;
- **preserves** the prototype's "clicking the iframe toggles backing/tab" UX by
  dispatching a synthetic `Tab` keydown after restoring focus (this is the
  documented, intended shortcut for toggling feeds);
- exposes a small interval that, while the iframe holds focus, tracks playback
  drift so a click that was actually a user seek can be distinguished from
  natural playback.

The hook takes a `getPlayer: () => YT.Player | null` selector so it works for
both single-song (two players, active one selected) and autoplay (one player).

### 3.4 CSS layout hacks (`pb-24`, `min-h-screen` flex breakage)
**Root cause:** full-screen practice modes were shoved inside the dashboard
shell, forcing bottom-padding to clear the mobile nav, and `min-h-screen` on
inner flex children broke header width.

**V3 fix (route layout):**
- Practice Mode and Rehearsal Autoplay live **outside** the `(dashboard)` route
  group, at `/songs/[id]/practice` and `/rehearsals/[id]/practice`. They render
  their own full-bleed layout: a `fixed inset-0 z-50` flex column
  (`h-dvh overflow-hidden`) with header / body / optional sidebar — **no**
  dashboard chrome, **no** mobile bottom nav, **no** `pb-24`.
- The `(dashboard)` group uses a single `min-h-dvh flex flex-col` shell with a
  sticky header and a mobile bottom nav that is `fixed bottom-0` only on
  `md:hidden`. Main content is `flex-1`; no arbitrary padding fixes.
- Use `dvh` units (not `vh`) so mobile browser chrome doesn't cause overflow.
- Every "full-screen" surface uses `fixed inset-0` + `h-dvh`, never
  `min-h-screen` inside a flex parent.

### 3.5 Additional debts found while reading the prototype (also fixed)

| # | Prototype problem | V3 fix |
|---|---|---|
| a | `roleGroups.backingStartOffset` / `tabStartOffset` columns marked "Deprecated" | **Dropped.** Offsets are per-user in `userSongProgress` only. |
| b | `tracks.role` duplicates `roleGroups.role` | **Dropped.** Derive from parent. One source of truth. |
| c | `getSongProgress` and `getAllSongProgress` **auto-insert** rows on read (write-on-read side effect) | Reads never write. Missing progress = defaults applied in the app layer. `userSongProgress` rows are created lazily on first *save*. |
| d | `getAllSongProgress` bulk-inserts missing songs then re-queries | One `LEFT JOIN` query returns songs + their progress (if any); defaults filled in TS. |
| e | `reorderRehearsalSongs` issues N sequential `UPDATE`s | Single `db.transaction` (better-sqlite3 is sync) rewriting all `sortOrder`s. |
| f | `removeSongFromRehearsalSetlist` does delete + separate update to shift sort orders | Same transaction: delete, then `UPDATE … SET sortOrder = sortOrder - 1 WHERE sortOrder > removed`. |
| g | `AnonymousUserProvider` mints a UUID client-side then `window.location.reload()`s so the server can see the cookie | **Middleware** (`src/middleware.ts`) mints the `bandboard_uid` cookie server-side if absent. No client reload, no provider needed for ID minting. |
| h | `AccessGuard` does a client-side round-trip to check the secret on every load | Middleware checks the secret cookie too; unauthenticated requests redirect to `/unlock`. The `/unlock` page is the only client-side secret form. |
| i | Three different role enum string sets (`Piano/Keyboard` vs `Keys`, `Other` casing) | One `INSTRUMENT_ROLES` constant array + `Role` union type. UI labels (`"Keys"` for `Piano/Keyboard`) live in one map. |
| j | Status colors duplicated across `KanbanBoard`, `PracticeLogCard`, `LibraryDashboard`, `SetlistManager` | One `PROGRESS_STATUSES` constant (id, label, color classes). **Emerald/Purple swapped per the user's request:** Ready to Play = Emerald, Mastered = Purple. |
| k | `getYouTubeQuery` + `determineRole` + `parseTuning` live inside the songs server action | Extracted into `src/lib/songsterr.ts` (pure functions, unit-checkable). |
| l | YouTube scrape + API live in `lib/youtube.ts` mixed with `getYouTubeId` | Keep one file but split: `searchYouTube` (API-or-scrape) and `getYouTubeId` (pure). Scrape parser hardened. |
| m | `SongDashboard` pre-resolves Genius lyrics in a `useEffect` fire-and-forget | Move lyric-link resolution into `ingestSongData` (already does it) — remove the client-side re-resolve. If a song predates the field, a "Refresh metadata" server action backfills it on demand. |
| n | Practice Mode lazy-loads missing YT media via a 5-`useRef` guard knot | One `useEnsureMedia(roleGroupId)` hook backed by an in-memory `Set` of attempted IDs (module-scoped, cleared on route change). Calls `lazyLoadTrackMedia` once per roleGroup per session. |
| o | `useYoutubeApi` polls every 100ms and overwrites `window.onYouTubeIframeAPIReady` | Promise-based singleton: one `loadYoutubeApi()` returns a cached promise; chains existing `onYouTubeIframeAPIReady` handlers instead of clobbering. |
| p | `theme` column in `userSettings` with no theme support | **Dropped.** Dark-only. |
| q | Rehearsal Autoplay "no video found" path waits 4s then advances via a ref | Store-driven: a `skipReason` state (`'no_video' | 'ended' | 'manual'`) drives the countdown/advance logic; no `setTimeout` + ref. |
| r | `@hello-pangea/dnd` hydration guarded by an `isMounted` flag to avoid SSR mismatch | Render the board inside a `dynamic(() => import(...), { ssr: false })` boundary instead. |

---

## 4. Data Model (Drizzle schema — final)

File: `src/db/schema.ts`. All timestamps are `integer` Unix-ms. IDs are
`text` UUIDs (generated server-side with `crypto.randomUUID()`). Boolean
columns use `integer({ mode: 'boolean' })`.

### 4.1 `songs`
```
id            text PK
title         text NOT NULL
artist        text NOT NULL
songsterrId   integer          (nullable; Songsterr songId)
albumArt      text             (nullable; iTunes 300x300 URL)
lyricsUrl     text             (nullable; Genius song URL)
createdAt     integer NOT NULL
```
Relations: many `roleGroups`, many `rehearsalSongs`, many `userSongProgress`.

### 4.2 `roleGroups`
A role group = one instrument role within a song, owning its backing-track and
tab-video YouTube links.
```
id                text PK
songId            text NOT NULL  -> songs.id  ON DELETE CASCADE
role              text NOT NULL   (Role union: 'Guitar'|'Bass'|'Drums'|'Vocals'|'Piano/Keyboard'|'Other')
backingTrackLink  text            (nullable; YouTube URL, or the literal 'none' if a search returned nothing)
tabVideoLink      text            (nullable; same convention)
```
Relations: one `song`, many `tracks`. **No offset columns** (offsets are
per-user). Index on `songId`.

### 4.3 `tracks`
A sub-track within a role group (one Songsterr instrument line, e.g. "Rhythm
Guitar" vs "Lead Guitar" inside the Guitar role group). Owns the deep-link to
the interactive tab + tuning.
```
id              text PK
roleGroupId     text NOT NULL  -> roleGroups.id  ON DELETE CASCADE
instrumentName  text NOT NULL   (e.g. "Lead Guitar", "Vocals")
details         text            (nullable; free-text from Songsterr track.name)
tuning          text NOT NULL    (e.g. "E-A-D-G-B-E", "Standard", "Drop D")
tabLink         text NOT NULL     (Songsterr deep-link, or https://www.songsterr.com)
```
**No `role` column** — derive from the parent roleGroup. Index on `roleGroupId`.

### 4.4 `rehearsals`
```
id      text PK
title   text NOT NULL
date    integer NOT NULL   (Unix-ms)
notes   text               (nullable)
```
Relations: many `rehearsalSongs`.

### 4.5 `rehearsalSongs` (junction, ordered)
```
rehearsalId  text NOT NULL -> rehearsals.id  ON DELETE CASCADE
songId       text NOT NULL -> songs.id       ON DELETE CASCADE
sortOrder    integer NOT NULL
PRIMARY KEY (rehearsalId, songId)
INDEX (rehearsalId), INDEX (songId)
```
Relations: one `rehearsal`, one `song`.

### 4.6 `userSettings` (one row per device UUID)
```
userUuid           text PK
preferredInstrument text NOT NULL DEFAULT 'Guitar'   (Role)
autoplayEnabled    integer(boolean) NOT NULL DEFAULT true
autoplayTimeout    integer NOT NULL DEFAULT 5         (seconds, 1..60)
updatedAt          integer NOT NULL
```
**No `theme` column.** `updatedAt` for debug only.

### 4.7 `userSongProgress` (one row per user × song, lazy-created on first save)
```
id                  text PK
userUuid            text NOT NULL
songId              text NOT NULL -> songs.id  ON DELETE CASCADE
status              text NOT NULL DEFAULT 'not_started'   (ProgressStatus union)
speed               integer NOT NULL DEFAULT 100           (practice speed %, 50..200)
notes               text                                   (nullable; private practice log)
practiceMarkers     text                                   (nullable; JSON string of number[], max 9)
backingStartOffset  real                                   (nullable; seconds)
tabStartOffset      real                                   (nullable; seconds)
updatedAt           integer NOT NULL
UNIQUE INDEX (userUuid, songId)
INDEX (userUuid)
```
**No auto-insert on read.** A missing row means "defaults" (status
`not_started`, speed 100, no markers, no offsets, no notes).

### 4.8 Relations
Drizzle `relations()` wired exactly as in the prototype (songs ↔ roleGroups ↔
tracks; rehearsals ↔ rehearsalSongs ↔ songs; userSongProgress ↔ songs).
`userSettings` has no relations.

### 4.9 DB connection (`src/db/index.ts`)
Singleton on `globalThis` (same pattern as prototype) so Next dev HMR doesn't
open dozens of handles. `better-sqlite3` is **synchronous**, so all queries are
sync — wrap in `db.transaction(...)` for atomic multi-writes. Export `db` and
`DbType`.

### 4.10 Migrations
`drizzle.config.ts` points at `./src/db/schema.ts`, output `./drizzle`, dialect
`sqlite`, url `sqlite.db`. Run `drizzle-kit generate` on schema change;
committed SQL files are the source of truth. A `db:migrate` npm script runs
`drizzle-kit migrate` on boot (dev) / deploy.

---

## 5. Authentication & Device Identity (middleware-first)

### 5.1 Two independent gates
1. **Shared secret** (optional, env `BAND_SECRET`). If set, every request needs
   a `bandboard_secret` cookie (or `?secret=…` query param, stripped + cookie
   set on first hit) matching the env value. Absent → redirect to `/unlock`.
2. **Device UUID** (always on). Every request needs a `bandboard_uid` cookie
   (UUIDv4). Absent → middleware mints one and sets it
   (`Path=/; Max-Age=10y; SameSite=Lax`). No client-side minting, no reload.

### 5.2 `src/middleware.ts`
Runs on every matched path **except** `/unlock`, `/_next`, `/favicon.ico`,
static assets. Logic, in order:
1. Read `bandboard_uid`. If missing, generate `crypto.randomUUID()`, set cookie.
2. If `process.env.BAND_SECRET` is set:
   - read `bandboard_secret` cookie (or `?secret=` param; if param present,
     set cookie + strip param via `NextResponse.redirect` to the clean URL);
   - if it doesn't match (or absent) and the path isn't `/unlock`, redirect to
     `/unlock?next=<encoded path>`.
3. Forward the request with the cookies guaranteed present.

### 5.3 `/unlock` route
A minimal client page (`src/app/unlock/page.tsx`) with the secret form. On
submit, calls `checkSecret` server action; on success sets the
`bandboard_secret` cookie via `cookies().set(...)` (server-side, HttpOnly) and
`router.replace(next ?? '/')`. No `localStorage` for the secret anymore — the
cookie is the store. (This also kills the prototype's
`localStorage.removeItem("bandboard_secret")` logout button — logout becomes
"delete the cookie via a `logout` server action".)

### 5.4 `getUserUuid()` helper
`src/lib/auth.ts` exports `getUserUuid(): Promise<string>` — reads the
`bandboard_uid` cookie via `next/headers` `cookies()`. Because middleware
guarantees the cookie exists, this never returns `"anonymous"`. All
settings/progress server actions key off this.

### 5.5 Device sync / export-import (Settings page)
- The UUID is shown read-only (copy button).
- "Sync another device": paste a UUID → a `syncDeviceId` server action sets the
  `bandboard_uid` cookie to the pasted value (validated as UUIDv4) and refreshes.
  (Replaces the prototype's client `document.cookie = …` + reload.)
- Export: `exportUserData` returns `{ userUuid, settings, progress[] }` as JSON.
- Import: `importUserData(payload)` upserts settings + progress under the
  payload's UUID, then sets the cookie to that UUID.

---

End of Part 1. Part 2 covers the route tree, server actions, and the
client-state / YouTube-player architecture.

---

## 6. Route Tree (App Router)

```
src/app/
├── layout.tsx                      Root: <html class="dark">, Inter font, globals.css.
│                                   Wraps children in <Toaster/>. No providers
│                                   here — device UID is middleware-minted, no
│                                   client provider needed.
├── page.tsx                        redirect('/') -> /rehearsals
├── globals.css                     Tailwind v4 + shadcn tokens (dark only)
├── unlock/
│   └── page.tsx                    Secret-entry form (client) — see §5.3
│
├── (dashboard)/                    Shell with sticky header + mobile bottom nav
│   ├── layout.tsx                  "use client" — nav highlight by pathname
│   ├── rehearsals/
│   │   ├── page.tsx                Server: getRehearsals() -> RehearsalsDashboard
│   │   └── RehearsalsDashboard.tsx
│   ├── rehearsals/[id]/
│   │   ├── page.tsx                Server: getRehearsalDetails + getSongs +
│   │   │                           getUserSettings + getProgressMap -> client
│   │   ├── RehearsalDetailClient.tsx
│   │   └── kanban/
│   │       ├── page.tsx            Server: same data -> client
│   │       └── RehearsalKanbanClient.tsx
│   ├── library/
│   │   ├── page.tsx                Server: getSongs + settings + progressMap
│   │   └── LibraryDashboard.tsx
│   ├── songs/[id]/
│   │   ├── page.tsx                Server: getSongDetails + settings
│   │   └── SongDetailClient.tsx
│   └── settings/
│       ├── page.tsx                Server: getUserSettings + getUserUuid
│       └── SettingsClient.tsx
│
├── songs/[id]/practice/            OUTSIDE (dashboard) — full-bleed
│   ├── page.tsx                    Server: getSongDetails + settings + progressMap
│   └── PracticeModeClient.tsx      "use client"; renders <PracticeMode/>
│
└── rehearsals/[id]/practice/       OUTSIDE (dashboard) — full-bleed
    ├── page.tsx                    Server: getRehearsalDetails + settings + progressMap
    └── RehearsalAutoplayClient.tsx "use client"; renders <RehearsalAutoplay/>
```

### 6.1 Server-component data loading pattern
Every server `page.tsx` follows the same shape:
1. `await params` (Next 16 — `params` is a Promise).
2. Fire the needed `db.query.*` calls (server actions re-used as plain async
   functions — they're already `"use server"`).
3. Build the `ProgressMap` once (see §7.4) via a single `getProgressMap()`
   helper that does the `LEFT JOIN` and applies defaults in TS.
4. If the primary entity is missing, `redirect()` to the list.
5. `export const dynamic = "force-dynamic"` on every DB-backed page (SQLite is
   not edge-cacheable).

Server components pass **plain serializable props** to their `*Client`
wrappers (Drizzle row shapes are already plain objects). No `Date` objects —
timestamps stay as `number` until the UI formats them.

### 6.2 The `(dashboard)` shell
`layout.tsx` (client, because it reads `usePathname`):
- `min-h-dvh flex flex-col bg-background text-foreground`
- sticky header: brand mark + desktop nav (Rehearsals / Library / Settings).
- `<main class="flex-1 px-4 md:px-8 py-6">`.
- mobile bottom nav: `md:hidden fixed bottom-0 inset-x-0` — three icon links.
  Because practice routes are outside this group, the nav never overlaps the
  full-screen player (kills the `pb-24` hack).
- No `pb-20`/`pb-24` arbitrary padding anywhere. Mobile bottom-nav clearance is
  handled by `pb-16 md:pb-0` on `<main>` only.

---

## 7. Server Actions (`src/app/actions/`)

Grouped by domain. Every file starts with `"use server"`. Every action returns
`{ success: boolean; error?: string; ...payload }`. Errors are caught and
stringified — never thrown across the RSC boundary.

### 7.1 `auth.ts`
- `checkSecret(provided: string): Promise<{ isValid: boolean; isRequired: boolean }>`
  — reads `process.env.BAND_SECRET`; if unset, `{ isValid: true, isRequired: false }`.
- `logout(): Promise<void>` — deletes the `bandboard_secret` cookie.
- `syncDeviceId(uuid: string): Promise<{ success: boolean; error?: string }>`
  — validates UUIDv4, sets `bandboard_uid` cookie (HttpOnly=false so the
  Settings page can read it for display... actually keep it non-HttpOnly so
  client can copy it; it's not a credential).

### 7.2 `songs.ts`
Pure DB + external-fetch logic. The Songsterr / iTunes / Genius / YouTube
fetching is extracted into `src/lib/` (see §8) so the actions stay thin.

- `ingestSongData(title, artist)` — duplicate check (case-insensitive),
  Songsterr lookup (3s timeout), iTunes art (3s), Genius lyrics URL (3s),
  insert song + roleGroups + tracks in **one `db.transaction`** (sync). Returns
  `{ success, songId? }` or `{ success: false, error: "duplicate" | … }`.
- `getSongs()` — `db.query.songs.findMany({ orderBy: asc(title), with: { roleGroups: { with: tracks } } })`.
- `getSongDetails(songId)` — same with `findFirst`.
- `deleteSong(songId)` — cascade handles children.
- `updateRoleGroupVideo(roleGroupId, type: 'backing'|'tab', url: string|null)`
  — sets the link. `null` clears; the literal `'none'` is *not* written by
  user edits (only by `lazyLoadTrackMedia`).
- `searchYouTubeVideosAction(query)` — `searchYouTube(query).slice(0, 10)`.
- `lazyLoadTrackMedia(roleGroupId)` — if either link is `null` and role ≠
  `Other`, build queries via `getYouTubeQuery`, search, persist results (or
  `'none'` sentinel). Idempotent: no-op if both links are non-null.
- `refreshSongMetadata(songId)` — re-runs iTunes + Genius for a song missing
  `albumArt`/`lyricsUrl` (backfills legacy rows). Called from SongDashboard on
  demand, not automatically.

### 7.3 `rehearsals.ts`
- `createRehearsal(title, date, notes?)`
- `updateRehearsal(id, title, date, notes?)`
- `deleteRehearsal(id)` — cascade.
- `getRehearsals()` — with `rehearsalSongs.song.roleGroups.tracks`.
- `getRehearsalDetails(id)` — `rehearsalSongs` ordered by `sortOrder`.
- `addSongToRehearsalSetlist(rehearsalId, songId)` — duplicate check, then
  `sortOrder = max(existing) + 1` via a single `SELECT MAX` subquery inside a
  transaction.
- `removeSongFromRehearsalSetlist(rehearsalId, songId)` — **transaction**:
  delete row, then `UPDATE SET sortOrder = sortOrder - 1 WHERE rehearsalId = ?
  AND sortOrder > removed`.
- `reorderRehearsalSongs(rehearsalId, songIdsInOrder: string[])` — **single
  transaction**: loop `songIdsInOrder`, `UPDATE … SET sortOrder = i WHERE
  rehearsalId = ? AND songId = ?`. better-sqlite3 sync, so this is one atomic
  block. Returns `{ success: true }`.

### 7.4 `user.ts`
- `getUserSettings()` — `SELECT` by UUID; if missing, return defaults object
  (does **not** insert). Defaults: `preferredInstrument: 'Guitar'`,
  `autoplayEnabled: true`, `autoplayTimeout: 5`.
- `saveUserSettings(partial)` — `INSERT … ON CONFLICT(userUuid) DO UPDATE SET
  <only provided fields>, updatedAt = now`. Only fields present in the partial
  are written.
- `getProgressMap(): Promise<ProgressMap>` — the **single** progress query.
  `SELECT s.id AS songId, p.* FROM songs s LEFT JOIN userSongProgress p ON
  p.songId = s.id AND p.userUuid = ?`. In TS, map each row: if `p.id` is null,
  use defaults; else use stored values. Returns `Record<songId, UserProgress>`.
  Used by every server page that renders progress badges.
- `getSongProgress(songId)` — returns `UserProgress | null` for one song (for
  the PracticeLogCard initial state). Does **not** insert.
- `saveSongProgress(songId, { status?, speed?, notes? })` — `INSERT … ON
  CONFLICT(userUuid, songId) DO UPDATE` of only provided fields. Creates the
  row on first save (lazy).
- `savePracticeMarkers(songId, markers: number[])` — same upsert pattern,
  writes `JSON.stringify(markers)`. Rejects > 9 markers server-side too.
- `saveStartOffsets(songId, backingOffset, tabOffset)` — upsert.
- `exportUserData()` / `importUserData(payload)` — as prototype, but
  importUserData runs in a transaction and validates songIds exist before
  upserting each progress row.

### 7.5 Action call discipline (client side)
- Mutations are called from `*Client` components, then a `refresh()` callback
  re-fetches the affected slice. `refresh()` uses `useTransition` + `startTransition`
  so the UI stays responsive and the data swaps in without a full reload.
- Optimistic updates: Kanban drag, setlist reorder, and progress-status changes
  apply the new state to local React state *immediately*, then call the action;
  on failure, toast + revert. (The prototype did this ad-hoc for Kanban; V3
  formalizes it via a small `useOptimisticAction` helper.)

---

## 8. Pure Libs (`src/lib/`)

| File | Exports | Notes |
|---|---|---|
| `utils.ts` | `cn()`, `getAlternativeLinks(tabLink)` (tab/sheet/chords URL derivation), `slugify()` | |
| `youtube.ts` | `searchYouTube(query): Promise<YouTubeVideo[]>` (API key if `YOUTUBE_API_KEY` env set, else scrape `ytInitialData`), `getYouTubeId(url)`, `YouTubeVideo` type | Scrape parser hardened; `parseViews` kept. |
| `songsterr.ts` | `fetchSongsterr(title, artist)` → `{ songsterrId, verifiedTitle, verifiedArtist, rawTracks }`, `determineRole(hash, instrumentId, instrument, trackName)`, `parseTuning(tuningArray)`, `buildTabLink(songsterrId, artistSlug, titleSlug, trackIndex)` | Extracted from the prototype's inline functions. Pure, testable. |
| `metadata.ts` | `fetchAlbumArt(artist, title)`, `fetchGeniusLyricsUrl(artist, title)` | iTunes + Genius, each with 3s `AbortSignal.timeout`. |
| `tunings.ts` | `getSongTunings(song): TuningInfo[]` | Unchanged from prototype. |
| `youtube-query.ts` | `getYouTubeQuery(artist, title, role, type, instrumentName)` | Moved out of `utils.ts` for cohesion. |
| `auth.ts` | `getUserUuid()`, `requireUserUuid()` | `next/headers` cookie read. |
| `constants.ts` | `INSTRUMENT_ROLES`, `Role`, `PROGRESS_STATUSES`, `ProgressStatus`, `PROGRESS_STATUS_ORDER`, color/label maps, `AUTPLAY_TIMEOUT_MIN/MAX`, `MAX_MARKERS = 9`, `YT_SYNC_DRIFT_MS = 150`, `SEEK_STEP_S = 5` | Single source of truth for all magic values. |

### 8.1 `constants.ts` — the status color table (Emerald/Purple swapped)

```ts
export type ProgressStatus = 'not_started' | 'learning' | 'ready_to_play' | 'mastered';

export const PROGRESS_STATUSES = [
  { id: 'not_started',  label: 'Not Learned',   dot: 'bg-red-500',     text: 'text-red-400',     soft: 'bg-red-950/40'   },
  { id: 'learning',     label: 'Learning',      dot: 'bg-sky-500',     text: 'text-sky-400',     soft: 'bg-sky-950/40'   },
  { id: 'ready_to_play',label: 'Ready to Play', dot: 'bg-emerald-500', text: 'text-emerald-400', soft: 'bg-emerald-950/40' },
  { id: 'mastered',     label: 'Mastered',      dot: 'bg-purple-500',  text: 'text-purple-400',  soft: 'bg-purple-950/40' },
] as const;
```

One component (`<ProgressBadge status={...}/>` in `src/components/`) consumes
this; Kanban columns, Library cards, Setlist rows, and PracticeLogCard all use
it. No more copy-pasted badge classes.

### 8.2 `INSTRUMENT_ROLES`
```ts
export const INSTRUMENT_ROLES = ['Guitar','Bass','Drums','Vocals','Piano/Keyboard','Other'] as const;
export type Role = typeof INSTRUMENT_ROLES[number];
export const ROLE_LABEL: Record<Role, string> = { 'Piano/Keyboard': 'Keys', /* else identity */ };
```

---

## 9. Client State & YouTube Player Architecture

This is the heart of the rewrite. The prototype's two giant components
(`PracticeMode.tsx` 1200+ lines, `RehearsalAutoplay.tsx` 1010 lines) become
thin shells over a small set of composable hooks backed by Zustand.

### 9.1 `useYoutubeApi()` — singleton loader
`src/hooks/useYoutubeApi.ts`:
- Module-scoped `let apiPromise: Promise<YT> | null`.
- `loadYoutubeApi()`: if `window.YT?.Player` exists, resolve immediately.
  Otherwise inject `<script id="youtube-iframe-api"
  src="https://www.youtube.com/iframe_api">`, chain any pre-existing
  `window.onYouTubeIframeAPIReady`, then resolve when `YT.Player` is defined
  (poll at 100ms, capped at 10s → reject).
- `useYoutubeApi()` returns `boolean` (loaded). Calls `loadYoutubeApi()` once;
  every component sharing the page gets the same promise.

### 9.2 The player store (`src/stores/player-store.ts`)
A Zustand store. **Only** live player-affecting state lives here — not UI
chrome. Shape:

```ts
interface PlayerStore {
  // shared
  isPlaying: boolean;
  volume: number;            // 0..100
  speed: number;             // 0.5..2.0
  seekTarget: number | null; // debounced seek for keyboard repeat
  // practice mode (dual player)
  activeVideo: 'backing' | 'tab';
  markers: number[];         // sorted
  backingOffset: number;
  tabOffset: number;
  // autoplay mode
  currentIndex: number;
  autoplayEnabled: boolean;
  transitionTimeout: number;
  countdown: number | null;  // null = not counting down
  countdownPaused: boolean;
  sessionStarted: boolean;
  finished: boolean;
  skipReason: 'ended' | 'no_video' | 'manual' | null;

  // actions
  setPlaying, setVolume, setSpeed, setActiveVideo,
  setMarkers, setBackingOffset, setTabOffset,
  setCurrentIndex, next, prev,
  setAutoplayEnabled, setTransitionTimeout,
  startCountdown, tickCountdown, pauseCountdown, skipCountdown,
  startSession, finish, restart,
  reset,                     // full reset on unmount / route change
}
```

Why this kills the stale-closure problem: every YT callback
(`onStateChange`, `onReady`) is defined **once** at player creation and reads
`usePlayerStore.getState()` — always current. No `useEffect` mirror dance, no
`handleSongEndedRef.current = …` reassignment.

### 9.3 `useYouTubePlayer(containerId, opts)` — one player
`src/hooks/useYouTubePlayer.ts`:
- Takes a container div id, a `videoId`, initial offset, and an `onEnded?`
  callback.
- On `videoId` change: if a player exists and `loadVideoById` is available,
  call it (no teardown); else create a `new YT.Player(containerId, {...})`.
- `onReady`: `playVideo()`, apply `volume`/`speed` from store, `seekTo(offset)`
  if offset > 0.
- `onStateChange`: sync `isPlaying` to store; on `ENDED`, call `onEnded`.
- Cleanup on unmount: `destroy()`.
- Returns `{ playerRef, ready }`.

### 9.4 `useDualSyncedPlayers(backingId, tabId, offsets)` — Practice Mode
- Spawns two `useYouTubePlayer` instances.
- A 500ms interval (only while both ready) keeps the inactive player muted and
  re-aligns it if drift > `YT_SYNC_DRIFT_MS` (150ms): expected inactive time =
  `activeTime - activeOffset + inactiveOffset`.
- `toggleVideo()` (Tab key / button / iframe-click): seek inactive to
  `activeTime - activeOffset + inactiveOffset`, mirror play/pause state, swap
  mute, flip `activeVideo` in store.
- Exposes `seekBy(deltaSeconds)` and `seekTo(time)` that drive the active
  player and mirror to the inactive one (the prototype's debounced
  `seekTargetRef` becomes a store field with a short cooldown so rapid
  arrow-presses accumulate).

### 9.5 `useAutoplayPlayer(videoId, offset)` — Rehearsal Autoplay
- One `useYouTubePlayer`.
- `onEnded` → store dispatches `songEnded()`: if last song → `finish()`; else
  if `autoplayEnabled` → `startCountdown()`; else just pause.
- The countdown effect: a `useEffect` on `countdown`/`countdownPaused`; when
  `countdown` hits 0, advance `currentIndex` (or `startSession()` on first
  completion).
- When `currentIndex` changes (and session started), the page-level effect
  calls `player.loadVideoById({ videoId, startSeconds: offset })` and flips
  `isPlaying` true. If `videoId` is null, set `skipReason='no_video'` and start
  a 4s countdown to advance (store-driven, no orphan `setTimeout`).

### 9.6 `usePracticeKeyboard(handlers)` — global shortcuts
Same contract as prototype (`onPlayPause`, `onSeekBackward`, `onSeekForward`,
`onMarkerJump`, `onToggleVideo`), but handlers are stable callbacks reading
from the store. Skips `INPUT`/`TEXTAREA`/`SELECT` active elements. Keys:
`Space` play/pause, `ArrowLeft`/`ArrowRight` ±5s, `1..9` marker jump, `Tab`
toggle video (practice mode only).

### 9.7 `useIframeFocusGuard(getActivePlayer)` — focus recovery
Per §3.3. Restores `window` focus after an iframe click, dispatches a synthetic
`Tab` keydown to trigger `onToggleVideo` (preserving the prototype's UX), and
tracks playback drift to distinguish user seeks from natural playback while
the iframe held focus.

### 9.8 `useEnsureMedia(roleGroupId, songId)` — lazy YT link load
- Module-scoped `attempted = new Set<string>()`.
- When the active role group has `null` backing/tab links and role ≠ `Other`,
  and the id isn't in `attempted`, call `lazyLoadTrackMedia`, add to `attempted`
  regardless of outcome, then call `onRefresh()`.
- `attempted` is cleared on route change (a `useEffect` cleanup at the page
  level calls a `clearAttempted()` export).

---

End of Part 2. Part 3 covers the component inventory, the two player surfaces
in detail, and the UI/design system.

---

## 10. Component Inventory (`src/components/`)

Grouped by concern. Each is a client component unless marked `(server)`.
Reused shadcn primitives (`button`, `card`, `dialog`, `input`, `label`,
`select`, `slider`, `badge`, `tabs`, `sonner`) live in `src/components/ui/`
and are generated by `npx shadcn add …` — not hand-written.

### 10.1 Layout / chrome
- `AppShell` — implicit in `(dashboard)/layout.tsx`; not a separate file.
- `TopNav` — desktop nav links (highlight by `usePathname`).
- `MobileNav` — bottom icon bar.
- `PrivateIndicator` — the "synced only for you" pill (unchanged from
  prototype; tiny, reused everywhere).

### 10.2 Library
- `LibraryDashboard` — grid of `<SongCard/>`, search, "Add Song" button.
  Holds `songsList` + `progressMap` in state, `refresh()` via `useTransition`.
- `SongCard` — album art, title, artist, track count, `<ProgressBadge/>`,
  tuning badges (highlighted = preferred instrument), Practice button.
- `AddSongModal` — title + artist form → `ingestSongData`. Loading state shows
  "Ingesting…". On success, `onRefresh()` + close.

### 10.3 Song detail
- `SongDetailClient` — back link, delete, role-tab sync via URL `?role=`.
- `SongDashboard` — the big per-song panel. Tabs per role group (+ "Other
  Instruments" tab if any). Per role: notation card (expandable sub-tracks with
  Tab/Sheet/Chords links via `getAlternativeLinks`), backing-track iframe card,
  tab-video iframe card, `<VideoSelector/>` trigger, `<PracticeLogCard/>`,
  `<PracticeButton/>`.
  - Role selection: if `activeRole` URL param present, use it; else preferred
    instrument; else first role group. Memoized so it doesn't fight the URL.
  - `useEnsureMedia` fires per active role group to lazy-load missing YT links.
- `VideoSelector` — modal: manual URL input + YouTube search results list.
  `getYouTubeQuery` pre-fills the search box on open. Selecting a result or
  saving a URL calls `updateRoleGroupVideo` → `onRefresh`.
- `PracticeLogCard` — status grid (4 buttons via `PROGRESS_STATUSES`), notes
  textarea, speed (optional — kept as a number input, 50–200), Save button
  with unsaved-changes pulse. Calls `saveSongProgress`.

### 10.4 Rehearsals
- `RehearsalsDashboard` — grid of `<RehearsalCard/>`, "Schedule Prep" button.
- `RehearsalCard` — date, title, notes preview, song count, time.
- `AddRehearsalModal` — title, date (`<input type="date">`), hour/minute
  `<select>` (24h × 5-min grid), notes. → `createRehearsal`.
- `EditRehearsalModal` — same fields pre-filled; unsaved-changes pulse on Save.
  → `updateRehearsal`.
- `RehearsalDetailClient` — header (edit/delete), view-mode switch (Setlist ↔
  Kanban), notes card, grid: `<SetlistManager/>` (4 cols) + `<SongDashboard/>`
  (8 cols) for the active song (`?song=` URL param).
- `SetlistManager` — ordered list of rehearsal songs with up/down/remove +
  per-song Practice button + "Start Autoplay" `<PracticeButton/>` at top.
  "Add Songs" dialog: searchable list of library songs not yet in setlist.
- `RehearsalKanbanClient` — header + `<KanbanBoard/>`.
- `KanbanBoard` (`dynamic({ ssr: false })`) — 4 columns from
  `PROGRESS_STATUSES`, `@hello-pangea/dnd` `DragDropContext`. Cards: art,
  title/artist, tuning badges, left/right chevrons, Practice button. Drag end
  → `saveSongProgress` optimistic.

### 10.5 Settings
- `SettingsClient` — three cards:
  1. **My Role** — 6 instrument buttons (`INSTRUMENT_ROLES`, label via
     `ROLE_LABEL`) → `saveUserSettings({ preferredInstrument })`.
  2. **Authentication** — "Log out" → `logout()` action (clears secret cookie).
  3. **Practice Data & Device Sync** — read-only UUID (copy), "Sync another
     device" (paste UUID → `syncDeviceId`), Export Profile (download JSON),
     Import Profile (file input → `importUserData`).
  - Autoplay settings (enabled / timeout) live **on the Autoplay screen
    itself**, not in Settings — they're contextual to rehearsal practice.

### 10.6 Shared atoms
- `ProgressBadge` — consumes `PROGRESS_STATUSES`, props `{ status, size? }`.
- `TuningBadges` — `{ song, highlightRole? }` → renders `getSongTunings`.
- `SearchInput` — icon + `<Input>`.
- `PracticeButton` — branded play button (unchanged).
- `EmptyState` — `{ icon, title, description, action? }`.
- `Loader` — `Loader2` spinner.

### 10.7 The two player surfaces
See §11 and §12.

---

## 11. Practice Mode (single song) — in detail

Route: `/songs/[id]/practice`. **Outside** `(dashboard)`. Full-bleed.

### 11.1 Layout
`PracticeModeClient` renders `<PracticeMode/>`. The shell:
```
<div class="fixed inset-0 z-50 h-dvh flex flex-col bg-background text-foreground overflow-hidden">
  <header/>           ← Exit button, song title/artist, PrivateIndicator
  <div class="flex-1 grid lg:grid-cols-12 gap-6 overflow-hidden min-h-0">
    <main class="lg:col-span-8 flex flex-col gap-4 overflow-y-auto">…</main>
    <aside class="lg:col-span-4 overflow-y-auto">…</aside>
  </div>
</div>
```
No `pb-24`. `h-dvh` + `overflow-hidden` on the root; inner panels scroll.

### 11.2 Left column
1. **Player surface** — `aspect-video` black box, two stacked `<div id=...>`
   containers (backing + tab). The inactive one is `opacity-0 pointer-events-none
   absolute inset-0 -z-10`; the active one is `opacity-100`. A transparent
   `absolute left-[44px] bottom-0 w-[48px] h-[36px]` overlay blocks YT's native
   volume control (so our slider is authoritative). Skip-overlay center
   `<div class="animate-skip-alert">` for ±5s feedback.
2. **Controls card** — three columns:
   - **Playback settings**: backing/tab toggle (or "Instrumental"/"Vocal ref"
     for Vocals), volume slider, speed slider.
   - **Practice markers**: "Save Current Time" button, list of marker chips
     (1–9 hotkey hint, seek-on-click, delete).
   - **Start Sync Offsets** (private): two number inputs with −/+/Capture
     buttons, Save button (pulses green when dirty).

### 11.3 Right column (aside)
1. **Select Instrument** — `<Tabs>` over `standardRoleGroups`. Switching
   updates `activeRoleGroup` and (if not from URL) the store.
2. **Notation Links** — per track in the active role group: instrument name,
   tuning badge, Tab/Sheet/Chords buttons via `getAlternativeLinks`. For
   Vocals: "Open Lyrics" (→ `song.lyricsUrl` or Genius search fallback).
3. **Practice Log** — `<PracticeLogCard/>` (status, notes, speed, save).

### 11.4 Wiring
- `useYoutubeApi()` → wait for `YT`.
- `useEnsureMedia(activeRoleGroupId)` → lazy-load missing links.
- `useDualSyncedPlayers('backing-player-div', 'tab-player-div', { backingOffset, tabOffset })`.
- `usePracticeKeyboard({ onPlayPause, onSeekBackward, onSeekForward, onMarkerJump, onToggleVideo })`.
- `useIframeFocusGuard(() => activeVideo === 'backing' ? backingPlayer : tabPlayer)`.

### 11.5 Marker handling
- `handleSaveCurrentTimeAsMarker` → reads active player `getCurrentTime()`,
  rounds to ms, appends, sorts, dedupes, caps at `MAX_MARKERS` (9), calls
  `savePracticeMarkers`, toasts.
- `handleDeleteMarker(idx)` → filter, save, toast.
- Clicking a marker chip seeks the active (and mirrors to inactive) player.
- `1..9` keys → jump to marker n.

### 11.6 Offset handling
- Local string state `backingOffset`/`tabOffset` seeded from `progressMap`.
- "Capture" buttons read the relevant player's `getCurrentTime()` and round to
  0.1s. −/+ buttons nudge by 0.1s.
- "Save Sync Offsets" calls `saveStartOffsets`, pulses while saving, toasts.
- Dirty detection: compare parsed numbers against the `progressMap` source.

### 11.7 Track selection memoization
A `useEffect` keyed on `[song.id, preferredInstrument]` sets the initial
`activeRoleGroup` (preferred instrument → first standard → Other). An
`initializedSongIdRef` prevents re-running on unrelated re-renders. URL `?role=`
param, if present, overrides once.

---

## 12. Rehearsal Autoplay Mode — in detail

Route: `/rehearsals/[id]/practice`. **Outside** `(dashboard)`. Full-bleed.

### 12.1 Layout
```
<div class="fixed inset-0 z-50 h-dvh flex flex-col bg-background text-foreground overflow-hidden">
  <header/>           ← Exit, rehearsal title/date, PrivateIndicator
  <div class="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
    <main class="flex-1 lg:flex-[7] overflow-y-auto lg:overflow-hidden flex flex-col justify-center gap-4">
       <PlayerSurface/>
       <NowPlayingFooter/>
    </main>
    <aside class="w-full lg:w-80 lg:border-l overflow-hidden flex flex-col min-h-0">
       <AutoplaySettings/>
       <QueueList/>
    </aside>
  </div>
</div>
```

### 12.2 Player surface
- Single `<div id="autoplay-player-div">` (hidden until `hasStartedSession`).
- Transparent volume-control blocker overlay (same as practice).
- Skip-overlay.
- **HUD overlays** (absolute, `z-30`), driven by store state, only one shown
  at a time:
  - **Countdown** (`countdown !== null`): circular SVG progress (radius 36),
    big number, upcoming song title/artist, "Pause Timer" / "Play Now" buttons.
  - **No video** (`skipReason === 'no_video'` && !countdown): warning card,
    auto-advances after 4s via a store-driven `skipReason` effect.
  - **Finished** (`finished`): "Rehearsal Prep Complete!" with Restart / Exit.

### 12.3 Now-playing footer
- "Now Playing (Song i of N)", title, artist.
- Tuning badges (preferred role highlighted).
- Prev / Play-Pause / Next buttons.

### 12.4 Settings panel (top of aside)
- **Practice Instrument** — `<Tabs>` over `['Guitar','Bass','Vocals','Drums','Keys']`
  (Keys label → `Piano/Keyboard` role). Changing updates the store's
  `instrumentPreference`; the backing-video resolver recomputes.
- **Auto-advance** — On/Off toggle → `saveUserSettings({ autoplayEnabled })`.
- **Transition Timer** −/+ (1..60) → `saveUserSettings({ autoplayTimeout })`.
  Doesn't hot-swap the live countdown (updates next song), matching prototype.
- **Volume** slider, **Speed** slider (bound to store).

### 12.5 Queue list (rest of aside)
- Scrollable list of `queue` entries. Each row: index, album art, title,
  artist, status dot (active = pulsing, completed = check, next = clock),
  tuning badges. Click → `setCurrentIndex(i)`.

### 12.6 Backing-video resolver (`getBackingVideoId(song, preferredRole)`)
Pure function (in `src/lib/youtube.ts`), same priority as prototype:
1. preferred role's `backingTrackLink`
2. any role's `backingTrackLink`
3. preferred role's `tabVideoLink`
4. any role's `tabVideoLink`
5. `null` → triggers the no-video HUD path.

### 12.7 Wiring
- `useYoutubeApi()`.
- `useAutoplayPlayer(currentVideoId, backingOffset)` — on `currentIndex`
  change (and session started), `loadVideoById` or init player; `onEnded`
  dispatches `songEnded()`.
- `usePracticeKeyboard({ onPlayPause, onSeekBackward, onSeekForward })` — no
  `onMarkerJump` / `onToggleVideo` in autoplay.
- `useIframeFocusGuard(() => playerRef.current)`.
- Settings (autoplayEnabled / transitionTimeout) loaded once on mount from
  `getUserSettings()`; changes persist via `saveUserSettings`.

### 12.8 Session lifecycle (state machine)
```
[countdown=timeout, sessionStarted=false]
   │ (countdown reaches 0 OR "Play Now" clicked)
   ▼
[sessionStarted=true, currentIndex=0, player loads video]
   │ (video ENDED)
   ├─ last song ───────► [finished=true]
   ├─ autoplayEnabled ─► [countdown=timeout, skipReason='ended']
   └─ else ────────────► [isPlaying=false] (manual Next to continue)
[countdown=timeout]
   │ reaches 0 ─► currentIndex++, player loads next video
[skipReason='no_video']
   │ 4s timer ─► treat as ENDED (re-enter the ENDED branch)
[finished]
   │ Restart ─► reset to initial countdown, sessionStarted=false
```
All transitions are store actions; no orphan `setTimeout`s outside the single
countdown ticker effect.

---

## 13. Design System & Styling

### 13.1 Theme
Dark-only. `globals.css` keeps the prototype's token set (background `#0c0d0e`,
card `#161719`, border `#27282b`, `btn-bg`/`btn-hover`/`dialog-border`,
accent `#5b80a5`, highlight `#acd1f8`). The `:root` light tokens are kept for
shadcn parity but unused — `<html class="dark">` is hardcoded in
`src/app/layout.tsx`. No `next-themes`.

### 13.2 Custom animations
- `animate-skip-alert` (skip-overlay pop) — keep the keyframe from prototype.
- `animate-pulse` (Tailwind built-in) for dirty-save buttons and active-queue dot.

### 13.3 Radius scale
Keep the prototype's `--radius` ladder (`sm/md/lg/xl/2xl/3xl/4xl`). Default
cards use `rounded-2xl`; modals `rounded-2xl`; pills `rounded-full`.

### 13.4 Responsive breakpoints
- Mobile-first. `lg:` (1024px+) is the desktop split point for all grid layouts
  (12-col practice, setlist+dashboard, autoplay player+sidebar).
- Mobile bottom nav `md:hidden` (≤768px). Desktop nav `hidden md:flex`.
- Kanban columns: horizontal scroll on mobile (`overflow-x-auto snap-x`),
  equal-flex on desktop.

### 13.5 Typography
- Inter, `font-sans` via `next/font/google` `--font-sans` CSS var.
- Headings: `font-black tracking-tight`.
- Mono labels (tunings, timecodes): `font-mono`.

### 13.6 Iconography
All icons from `lucide-react`. No mixed icon sets.

### 13.7 Accessibility baseline
- All interactive elements are `<button>`/`<a>`/`<input>` with `title` or
  `aria-label`.
- Focus rings via `--ring` token (shadcn default).
- Keyboard shortcuts don't trap focus; the iframe-focus-guard restores window
  focus.
- Color is never the only signal (icons + text on badges).

---

End of Part 3. Part 4 covers the external-data ingestion pipeline, the
env/config surface, the file map, the build/test/lint commands, and the
implementation order.

---

## 14. External-Data Ingestion Pipeline

`ingestSongData(title, artist)` is the only entry point. Runs server-side,
**synchronous overall** (better-sqlite3), but the external fetches are async.
Order, each with a 3s `AbortSignal.timeout` so a slow source never blocks
ingestion:

1. **Duplicate check** — `SELECT title, artist FROM songs`; case-insensitive
   compare in TS. Duplicate → `{ success: false, error: 'duplicate' }`.
2. **Songsterr** (`lib/songsterr.ts` `fetchSongsterr`):
   `GET https://www.songsterr.com/api/songs?pattern=<title>+<artist>`. Take
   `data[0]`: `songId`, verified `title`/`artist`, `tracks[]`. On failure /
   empty: `songsterrId = null`, `rawTracks = []`, keep user-entered title.
3. **iTunes album art** (`lib/metadata.ts` `fetchAlbumArt`):
   `GET https://itunes.apple.com/search?term=<artist>+<title>&entity=song&limit=1`.
   Take `results[0].artworkUrl100`, swap `100x100bb.jpg` → `300x300bb.jpg`.
4. **Genius lyrics URL** (`lib/metadata.ts` `fetchGeniusLyricsUrl`):
   `GET https://genius.com/api/search/multi?q=<artist> <title>` with a desktop
   `User-Agent`. Find the `song` section's first hit's `url`.
5. **Insert** — one `db.transaction`: insert `songs` row, then for each role
   group (grouped by `determineRole`), insert `roleGroups` row + batch-insert
   its `tracks` (each with `buildTabLink(...)`). If `rawTracks` is empty,
   insert a single fallback Guitar role group + one generic track so the song
   always has at least one viewable tab.

### 14.1 Role classification (`determineRole`)
Identical logic to prototype (Vocals → Drums → Bass → Piano/Keyboard → Guitar
→ Other, with the non-standard-instrument exclusions for percussion / double
bass / glockenspiel etc.). Lives in `lib/songsterr.ts`, pure, exported so it
can be sanity-checked.

### 14.2 Tuning parse (`parseTuning`)
Songsterr sends `tuning` as an array of MIDI note numbers (low→high). Reverse
to high→low, map each `% 12` to `['C','C#',...,'B']`, join with `-`. Empty →
`'Standard'`.

### 14.3 Tab deep-link (`buildTabLink`)
`https://www.songsterr.com/a/wsa/<artistSlug>-<titleSlug>-tab-s<songId>t<trackIndex>`.
Slugs via `slugify`. If no `songsterrId`, fall back to `https://www.songsterr.com`.

### 14.4 Alternative links (`getAlternativeLinks`)
From a `-tab-s` deep-link, derive:
- `tab` = the link itself.
- `sheet` = replace `-tab-s` with `-sheet-s`.
- `chords` = replace `-tab-s<songId>t<idx>` with `-chords-s<songId>`.
Non-Songsterr links → all three equal the input.

### 14.5 Lazy YouTube loading (`lazyLoadTrackMedia`)
Only role groups with `role !== 'Other'` and a `null` link are eligible.
`'none'` sentinel means "searched, found nothing" — not re-searched. Queries
via `getYouTubeQuery`; first result's `.url` is stored, else `'none'`.

### 14.6 YouTube search (`searchYouTube`)
- If `YOUTUBE_API_KEY` env set: official Data API v3 `search` + `videos` for
  view counts. On API error, fall back to scrape.
- Else: scrape `https://www.youtube.com/results?search_query=…` with a desktop
  `User-Agent`, parse `ytInitialData` JSON by brace-matching, walk
  `twoColumnSearchResultsRenderer → itemSectionRenderer → videoRenderer`.
- Returns `YouTubeVideo[]` (`videoId, title, channelName, viewsText, viewCount,
  thumbnail, url`), capped to 10 by the caller.

### 14.7 Failure modes
Every external call is individually try/caught with a 3s timeout. A failure
leaves the corresponding field `null` and the song still ingests. Toasts on
the client report only the top-level success/failure; per-source failures are
`console.error`'d server-side (debug aid, not user-facing).

---

## 15. Environment & Configuration

`.env` (gitignored) / `.env.example` (committed):
```
# Optional: gate the app behind a shared secret. Leave unset for open access.
BAND_SECRET=

# Optional: use the YouTube Data API instead of HTML scraping.
YOUTUBE_API_KEY=
```

No other env vars. The DB path (`sqlite.db`) is hardcoded in `drizzle.config.ts`
and `src/db/index.ts` (single-user deployment assumption; ponytail: not
configurable until there's a second deployment shape).

`next.config.ts`: minimal (the prototype's is 151 bytes — keep it that way;
no custom webpack, no image domains because album art is loaded via `<img>`).

---

## 16. File Map (final)

```
bandboardV3/
├── PLAN.md                         ← this document
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── components.json                 ← shadcn config (base-nova, neutral)
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── drizzle/                        ← generated migrations (committed)
│   └── <timestamp>_init/migration.sql
├── public/
│   └── favicon.ico
└── src/
    ├── middleware.ts               ← device UID mint + secret gate (§5)
    ├── db/
    │   ├── index.ts                ← singleton better-sqlite3 + drizzle
    │   └── schema.ts               ← §4
    ├── lib/
    │   ├── utils.ts                ← cn, slugify, getAlternativeLinks
    │   ├── constants.ts            ← §8.1, §8.2 (roles, statuses, magic numbers)
    │   ├── auth.ts                 ← getUserUuid
    │   ├── youtube.ts              ← searchYouTube, getYouTubeId, getBackingVideoId, YouTubeVideo type
    │   ├── youtube-query.ts        ← getYouTubeQuery
    │   ├── songsterr.ts            ← fetchSongsterr, determineRole, parseTuning, buildTabLink
    │   ├── metadata.ts             ← fetchAlbumArt, fetchGeniusLyricsUrl
    │   └── tunings.ts              ← getSongTunings
    ├── types/
    │   └── models.ts               ← Song, RoleGroup, Track, Rehearsal, RehearsalSong, UserProgress, ProgressMap (plain serializable shapes matching Drizzle rows)
    ├── stores/
    │   └── player-store.ts         ← Zustand (§9.2)
    ├── hooks/
    │   ├── useYoutubeApi.ts        ← §9.1
    │   ├── useYouTubePlayer.ts     ← §9.3
    │   ├── useDualSyncedPlayers.ts ← §9.4
    │   ├── useAutoplayPlayer.ts    ← §9.5
    │   ├── usePracticeKeyboard.ts  ← §9.6
    │   ├── useIframeFocusGuard.ts  ← §9.7
    │   └── useEnsureMedia.ts       ← §9.8
    ├── components/
    │   ├── ui/                     ← shadcn primitives (generated)
    │   ├── PrivateIndicator.tsx
    │   ├── ProgressBadge.tsx
    │   ├── TuningBadges.tsx
    │   ├── SearchInput.tsx
    │   ├── PracticeButton.tsx
    │   ├── EmptyState.tsx
    │   ├── AddSongModal.tsx
    │   ├── AddRehearsalModal.tsx
    │   ├── EditRehearsalModal.tsx
    │   ├── SongCard.tsx
    │   ├── SongDashboard.tsx
    │   ├── VideoSelector.tsx
    │   ├── PracticeLogCard.tsx
    │   ├── SetlistManager.tsx
    │   ├── KanbanBoard.tsx
    │   ├── PracticeMode.tsx        ← §11
    │   └── RehearsalAutoplay.tsx   ← §12
    └── app/
        ├── layout.tsx
        ├── page.tsx                ← redirect to /rehearsals
        ├── globals.css
        ├── unlock/page.tsx         ← §5.3
        ├── (dashboard)/
        │   ├── layout.tsx
        │   ├── rehearsals/
        │   │   ├── page.tsx
        │   │   └── RehearsalsDashboard.tsx
        │   ├── rehearsals/[id]/
        │   │   ├── page.tsx
        │   │   ├── RehearsalDetailClient.tsx
        │   │   └── kanban/{page.tsx,RehearsalKanbanClient.tsx}
        │   ├── library/{page.tsx,LibraryDashboard.tsx}
        │   ├── songs/[id]/{page.tsx,SongDetailClient.tsx}
        │   └── settings/{page.tsx,SettingsClient.tsx}
        ├── songs/[id]/practice/{page.tsx,PracticeModeClient.tsx}
        └── rehearsals/[id]/practice/{page.tsx,RehearsalAutoplayClient.tsx}
```

### 16.1 `package.json` scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 16.2 Dependencies (locked list)
```
next@16  react@19  react-dom@19
drizzle-orm  better-sqlite3
@base-ui/react  shadcn  class-variance-authority  clsx  tailwind-merge
lucide-react  sonner  @hello-pangea/dnd  zustand  tw-animate-css
```
devDeps: `@tailwindcss/postcss  tailwindcss@4  drizzle-kit  typescript  eslint
eslint-config-next  @types/better-sqlite3  @types/node @types/react @types/react-dom`.

---

## 17. Implementation Order

A strict build sequence. Each step is independently verifiable. Do not skip
ahead — later steps depend on earlier ones being live.

### Phase A — Skeleton (no DB, no UI)
1. `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
   `eslint.config.mjs`, `components.json`, `.gitignore`, `.env.example`.
2. `src/app/globals.css` (copy prototype's token set).
3. `src/app/layout.tsx` (Inter font, `<html class="dark">`, `<Toaster/>`).
4. `src/app/page.tsx` (redirect to `/rehearsals`).
5. `src/lib/utils.ts` (`cn`, `slugify`, `getAlternativeLinks`).
6. `npx shadcn init` + `npx shadcn add button card dialog input label select
   slider badge tabs sonner` → `src/components/ui/`.
7. `npm run dev` boots; `/` redirects; blank page renders.

### Phase B — Data layer
8. `src/db/schema.ts` (§4), `src/db/index.ts` (singleton).
9. `drizzle.config.ts`; `npm run db:generate` → first migration; `npm run
   db:migrate` creates `sqlite.db`.
10. `src/lib/constants.ts` (roles, statuses, magic numbers).
11. `src/lib/auth.ts` (`getUserUuid`).
12. `src/types/models.ts`.

### Phase C — Middleware + auth
13. `src/middleware.ts` (UID mint + secret gate).
14. `src/app/unlock/page.tsx` + `src/app/actions/auth.ts`.
15. Verify: hit `/` with no cookies → UID cookie set; with `BAND_SECRET` set
    and no secret cookie → redirected to `/unlock`; unlock → cookie set →
    through.

### Phase D — Server actions (no UI)
16. `src/lib/songsterr.ts`, `src/lib/metadata.ts`, `src/lib/youtube.ts`,
    `src/lib/youtube-query.ts`, `src/lib/tunings.ts`.
17. `src/app/actions/songs.ts` (ingest, gets, delete, video update, lazy-load,
    search, refresh-metadata).
18. `src/app/actions/rehearsals.ts` (CRUD, setlist ops, transactional reorder).
19. `src/app/actions/user.ts` (settings, progressMap via LEFT JOIN, saves,
    export/import).
20. Smoke-test each by calling from a temporary server component.

### Phase E — Dashboard shell + Library
21. `src/app/(dashboard)/layout.tsx` (TopNav + MobileNav).
22. Shared atoms: `PrivateIndicator`, `ProgressBadge`, `TuningBadges`,
    `SearchInput`, `PracticeButton`, `EmptyState`.
23. `AddSongModal`, `SongCard`, `LibraryDashboard`, `library/page.tsx`.
24. Verify: add a song → ingestion runs → card appears with art/tunings.

### Phase F — Song detail
25. `VideoSelector`, `PracticeLogCard`, `SongDashboard`, `SongDetailClient`,
    `songs/[id]/page.tsx`.
26. Verify: role tabs, notation links, lazy YT load, video change, progress
    save.

### Phase G — Rehearsals (no autoplay)
27. `AddRehearsalModal`, `EditRehearsalModal`, `RehearsalsDashboard`,
    `rehearsals/page.tsx`.
28. `SetlistManager`, `RehearsalDetailClient`, `rehearsals/[id]/page.tsx`.
29. `KanbanBoard` (dynamic ssr:false), `RehearsalKanbanClient`, `kanban/page.tsx`.
30. Verify: create/edit/delete rehearsal, add/remove/reorder songs, drag
    kanban, progress persists.

### Phase H — Player infrastructure
31. `src/stores/player-store.ts`.
32. `useYoutubeApi`, `useYouTubePlayer`, `useDualSyncedPlayers`,
    `useAutoplayPlayer`, `usePracticeKeyboard`, `useIframeFocusGuard`,
    `useEnsureMedia`.

### Phase I — Practice Mode
33. `PracticeMode.tsx`, `PracticeModeClient.tsx`, `songs/[id]/practice/page.tsx`.
34. Verify: dual players sync, toggle (Tab/button/iframe-click), volume/speed,
    markers (save/jump/delete, 1–9 keys), offsets (capture/save), keyboard
    shortcuts (Space/arrows), focus recovery after iframe click, exit.

### Phase J — Rehearsal Autoplay
35. `RehearsalAutoplay.tsx`, `RehearsalAutoplayClient.tsx`,
    `rehearsals/[id]/practice/page.tsx`.
36. Verify: countdown → first song → ENDED → countdown → next; no-video skip;
    finished screen + restart; instrument switch re-resolves video; autoplay
    on/off; transition timer; volume/speed; keyboard; queue click jumps.

### Phase K — Settings
37. `SettingsClient`, `settings/page.tsx`.
38. Verify: change instrument (reflects in library/dashboard defaults), log
    out (secret cookie cleared → bounce to `/unlock`), copy UUID, sync another
    device, export JSON, import JSON.

### Phase L — Polish
39. Sweep for `pb-24`/`min-h-screen`/arbitrary padding; replace with `h-dvh`/
    `flex` patterns per §3.4.
40. Confirm `localStorage` holds only `bandboard_uid` + `bandboard_secret`.
41. `npm run lint` + `npm run typecheck` clean.
42. `npm run build` clean.
43. Manual pass on mobile viewport (bottom nav, kanban scroll, player
    full-bleed, no horizontal overflow).

---

## 18. Verification & Quality Gates

- **Lint:** `npm run lint` (eslint-config-next) — zero warnings before merge.
- **Typecheck:** `npm run tsc --noEmit` — zero errors.
- **Build:** `npm run build` — succeeds; no RSC boundary violations (no
  non-serializable props passed from server to client components).
- **Runtime smoke:** each Phase's "Verify:" step is the acceptance test.
- **No `useRef` mirror dance:** grep for `Ref = useRef` in
  `components/PracticeMode.tsx` and `RehearsalAutoplay.tsx` — expect only
  `playerRef` instances, no state mirrors. If a state mirror appears, it's a
  bug; reroute through the Zustand store.
- **`localStorage` discipline:** grep for `localStorage` across `src/` — only
  `bandboard_uid` and `bandboard_secret` keys appear, only in middleware,
  unlock, and settings.
- **Transaction usage:** grep for `reorderRehearsalSongs` /
  `removeSongFromRehearsalSetlist` / `ingestSongData` — each wraps multi-write
  in `db.transaction`.

---

## 19. Glossary

- **Role group** — one instrument role within a song (e.g. "Guitar"), owning
  the backing-track + tab-video YouTube links.
- **Track** — one Songsterr instrument line inside a role group (e.g. "Lead
  Guitar"), owning the tab deep-link and tuning.
- **Progress status** — `not_started | learning | ready_to_play | mastered`.
- **Practice markers** — up to 9 user-private timestamps (seconds) for quick
  jump-to within a song.
- **Start sync offsets** — per-user backing/tab start times (seconds) so the
  dual players align even if the two YouTube videos start at different points.
- **Device UUID** — anonymous `bandboard_uid` cookie minted by middleware,
  keying all per-user state.
- **Shared secret** — optional `BAND_SECRET` env value gating the whole app.

---

*End of plan. Implementation follows §17 in order; no further architectural
decisions should be required during the build.*

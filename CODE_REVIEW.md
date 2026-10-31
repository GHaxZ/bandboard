# Code review — 31 October 2026

Reviewed authentication, server actions, database operations, uploads and streaming, voting/setlists, practice and editor state, external media lookups, dependencies, and build configuration. Confirmed fixes are in the working tree. No application data migration was added; verification used in-memory or disposable databases and upload directories.

## Fixed findings

| Priority | Finding and consequence | Change |
| --- | --- | --- |
| P1 | A UUID-shaped session cookie passed the proxy gate. Several server reads had no authentication check; `getUserUuid()` also trusted a caller-supplied device cookie, allowing private progress/settings to be selected using another account's ID. Comment read markers and lazy vote finalization could run without a validated session. | Protected reads and writes now resolve an authenticated account. Page entry points redirect invalid sessions. Session age is also checked against the existing cookie lifetime. See `src/lib/auth.ts`, server actions and protected page/layout entry points. |
| P1 | Next.js 16.2.9 and several locked dependencies were in affected security-advisory ranges. The application uses App Router Server Actions, making the published Server Action denial-of-service advisory relevant. | Updated Next.js and its ESLint config to 16.4.3; applied compatible dependency fixes and a targeted brace-expansion update. No forced breaking downgrades. |
| P2 | A stale session cookie prevented reaching the login form. The `next` filter also accepted backslashes/control characters that URL parsing can turn into external redirect targets. | Login redirects only after session validation; server and client share `safeNext()`. A login target pointing back to `/login` is avoided. |
| P2 | Upload handlers buffered multipart bodies before reliably enforcing limits. Missing or misleading Content-Length bypassed the early stem check; multipart overhead could reject a file exactly at the advertised maximum. | Both upload routes enforce the actual bytes consumed, allow bounded multipart overhead, and retain the existing 250 MiB stem / 5 MiB cover limits. |
| P2 | Rate-limit cleanup used the current request's window for every bucket, prematurely clearing longer limits. Concurrent login failures could overwrite each other's counters. | Each bucket stores its own expiry. Persistent failure counters increment atomically in SQLite. |
| P2 | Failed YouTube requests were returned as empty searches and stored as the permanent `none` sentinel. Braces inside video titles could break JSON extraction. Slow searches could overwrite a member's newer manual choice. | Failures remain retryable, JSON extraction respects quoted strings, and automatic updates only fill columns that remain unset. |
| P2 | Replacing a media slot deleted its old track even when another slot still referenced it. Slots could also bind tracks belonging to another song. | Attachment changes are transactional, enforce song membership, and delete an old file only after its final slot reference is removed. |
| P2 | An original stem's staged offset/duration was omitted from its upload. Successfully uploaded stems could disappear from editor drafts before refreshed props arrived. | Initial timing is validated and stored with the upload. Committed uploads remain visible until the server refresh includes them, including after partial save failures. |
| P2 | Practice marker changes and original-song notes could report success despite a rejected server result. Removing an old custom artifact could fail silently. | Callers check success responses before reporting success or clearing the affected draft state. Marker hydration also accounts for a song change. |
| P2 | Rehearsal autoplay did not restart when moving between two custom-file sources. Practice could select an empty backing slot when only an uploaded tab existed. | Autoplay reacts to source/element changes. Practice selects slots using both YouTube and uploaded-media availability. |
| P2 | A voting page's expiry effect did not react to clock ticks; stream/direct practice reads could retain unfinalized nominations. Duplicate entries in a reorder request were accepted. | Expiration is checked on clock updates and relevant reads/edits, including a transaction-time deadline check. Reorders require each setlist song exactly once. |
| P2 | Invalid instrument/autoplay settings and NaN progress speed could reach persistence. Untagged MP3 files with ordinary frame headers were rejected; WAV and WebP shared an overly broad RIFF check. Malformed range numbers were partially accepted. | Added runtime validation, corrected MP3 frame matching, distinguished RIFF subtypes, and required a complete valid byte-range expression. Stored-path validation also rejects dot/parent names and backslashes. |
| P2 | Parallel production-build workers opening the same fresh SQLite file hit `SQLITE_BUSY` while initializing it. | Docker's build stage uses `:memory:` per worker with migrations disabled. Production database/volume settings are unchanged. |

The Next.js changes address the affected dependency versions; an advisory's presence does not by itself demonstrate that every reported attack is reachable in this application. Relevant primary sources: [Server Actions DoS](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3).

## Remaining findings and decisions

1. **Resolved — General authentication limits.** Login reservations are persistent and atomic: 5 attempts per device, 30 per account and 200 overall over five minutes. Registration permits 5 attempts per device and 50 overall per ten minutes, including rejected invite codes. Successful login clears its device/account counters while retaining the overall budget. Fixed windows expire even when blocked attempts continue. Authentication does not inspect proxy or provider headers, and no provider-specific origin configuration is included.

2. **Resolved — HTTPS authentication cookies with HTTP development support.** Session and device identity cookies set `Secure` when `NODE_ENV=production`. `next dev` supports local HTTP. Security does not depend on the tunnel-to-origin connection using HTTPS or on caller-supplied forwarding protocol headers.

3. **Moderate/low tooling advisories remain.** Final full audit: **25 package findings — 23 moderate, 2 low, zero high/critical**. Production-classified dependencies: **6 findings — 4 moderate, 2 low, zero high/critical**, all in the shadcn CLI/registry/ts-morph dependency chain. This app imports shadcn's CSS during the build; the remaining audit entries are not evidence of an exposed application endpoint. Other full-audit findings concern ESLint and Drizzle tooling. npm proposes breaking downgrades for parts of this tree; these were not forced to obtain an artificially clean audit.

## Verification

- **96 tests pass across 12 files**, up from 42 tests across 4 files. Tests use isolated SQLite databases and temporary upload directories.
- Authentication tests cover forged sessions/device identities, valid account reads, session expiration, stale-cookie login access, registration, case-insensitive login, logout, and password-change session revocation.
- Additional tests cover streamed upload limits, saved stem timing, attachment preservation, search failures/races, vote finalization, reorder validation, rate-limit concurrency, redirects, file signatures, and malformed ranges.
- `npm run lint`, `npm run typecheck`, and `git diff --check` pass.
- Production build passes with `DATABASE_PATH=:memory: MIGRATE_ON_BOOT=0 npm run build -- --webpack`.
- HTTP smoke tests against the production build pass for denied forged sessions, authenticated library/settings/song/editor/practice pages, safe login redirects, stem uploads, persisted alignment, and byte-range streaming. The smoke server and its temporary data were removed afterward.

Turbopack could not complete inside this execution environment because its internal worker port was denied; Webpack compilation, typechecking, page generation and tracing completed successfully. Stale generated `.next/dev/types` references to the removed `/unlock` page were moved to a temporary backup. Docker itself was not built, and audible playback in multiple browsers plus live third-party search responses were not exercised. This is a targeted code review and regression pass, not a guarantee that the codebase contains no other defects.

## Follow-up verification

Authentication coverage includes account and overall limits with rotating cookies, persistent registration budgets, and production/development cookie transport settings. Provider-specific configuration and header handling were subsequently removed.

The production Webpack build and local HTTP development smoke check pass. Existing production session cookies are upgraded to Secure on the next protected request.

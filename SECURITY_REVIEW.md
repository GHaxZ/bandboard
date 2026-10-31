# Security review

**Implementation update:** The findings below record the original review before
hardening. Authentication, sessions, organizer permissions, registration policy,
streamed upload limits, image decoding, persistent quotas/leases, origin/header
protections, bounded inputs/waveforms and encrypted-snapshot support have since
been implemented. See [SECURITY.md](SECURITY.md) for current behavior, upgrade
instructions and operational limits. Development advisories and live-volume
encryption remain explicit deployment/maintenance requirements.

Reviewed 2026-10-31. Repository-wide searches covered application source, server actions, API routes, authentication, database schema/migrations, browser rendering, dependencies, and Docker/deployment configuration. Detailed inspection focused on security boundaries. Generated output and vendored dependency source were excluded from the manual review; dependencies were checked using npm audit. This is a source review, not a penetration test or verification of the running production deployment. No application behavior was changed.

## Findings and recommended order

Priorities below assume an internet-accessible deployment. Conditional findings identify the configuration or threat model needed for impact.

### 1. Registration defaults to open, with full member access — high if this is intended to be private

Evidence: `src/app/actions/auth.ts:80`, `docker-compose.yml:16`, `src/app/actions/songs.ts:366`, `src/app/actions/rehearsals.ts:145`, `src/app/actions/votes.ts:306`.

An absent/empty BAND_SECRET permits anyone to register. Compose defaults it to empty. An authenticated account can read shared band content, delete songs/rehearsals, remove nominations, and close voting. There is no administrator/organizer role. Thus an exposed default deployment can admit outsiders with destructive capabilities. This is conditional on network exposure and registration configuration; equal permissions may be intentional within a trusted band.

Recommendation: make private/public registration an explicit deployment choice, fail closed for private production deployments without an invite configuration, and decide which destructive actions require an organizer. Setting an invite code gates new registration; it does not remove previously created accounts or sessions.

### 2. Uploads lack aggregate resource limits — high availability concern for untrusted members

Evidence: `src/app/api/uploads/route.ts:26`, `src/app/api/uploads/route.ts:76`, `src/lib/constants.ts:181`, `src/lib/constants.ts:232`.

The 250 MiB per-file cap and bounded multipart reader are useful, but each upload is parsed/buffered and then copied to a Buffer; writes/renames are synchronous. Twenty uploads per account per ten minutes can retain approximately 4.88 GiB per window. There are no account/storage quotas, concurrent-upload limits, or application-wide byte budgets. Parallel uploads can cause memory pressure, while repeated accepted uploads can fill the disk. The per-user request limiter does not prevent either outcome.

Recommendation: stream uploads to temporary files with bounded validation, use asynchronous filesystem operations, enforce storage/byte quotas and concurrency limits, and configure ingress/time limits and container resources. Include cover-art uploads in the same resource policy.

### 3. Password verification endpoints bypass login throttling — medium

Evidence: `src/app/actions/auth.ts:189`, `src/app/actions/auth.ts:227`.

changePassword and deleteAccount verify supplied passwords without reserving attempts or imposing the login delay. A party with a valid session can make repeated current-password guesses; an ordinary member can also repeatedly invoke synchronous scrypt to consume server CPU. This does not allow unauthenticated guessing against those endpoints.

Recommendation: apply persistent per-account and appropriate abuse limits to every password-verification endpoint, with a shared budget where appropriate. Do not rely on UI disabled states.

### 4. Password hashing uses implicit, relatively modest work factors and blocks requests — medium

Evidence: `src/lib/auth.ts:64`.

The implementation uses salted scrypt, which is a legitimate password hash, not broken encryption. It implicitly uses N=16384, r=8, p=1 (approximately 16 MiB working memory); a local comparison confirmed these defaults. It calls scryptSync, blocking the event loop. Stored hashes contain only salt and digest, so there is no algorithm/version/cost metadata for future upgrades. Password inputs have a minimum but no explicit maximum, and login does not perform equivalent hashing for unknown users, leaving a possible account-existence timing signal.

Recommendation: use asynchronous Argon2id or explicitly tuned asynchronous scrypt, benchmark costs and limit concurrent KDF work, version stored hashes, and rehash legacy values on successful login. Add bounded string validation and an equivalent unknown-user verification path. Raising costs without concurrency controls can worsen denial of service.

### 5. Long-lived replayable sessions increase compromise impact — medium

Evidence: `src/lib/constants.ts:222`, `src/lib/auth.ts:35`, `src/app/actions/auth.ts:36`, `src/db/schema.ts` (sessions table).

Sessions have a ten-year absolute lifetime with no idle timeout. Raw bearer tokens are stored in SQLite and therefore in database snapshots. Someone who obtains read access to a database/backup can replay an unexpired token without cracking a password. Password changes revoke other sessions but retain the current token, which is not rotated. Server-side expiration, logout revocation, and Secure/HttpOnly/SameSite cookies are already implemented.

Recommendation: choose shorter absolute/idle lifetimes, store token hashes rather than raw tokens, rotate on sensitive account changes, provide session revocation controls, and prune expired sessions. Hashing tokens limits the impact of read-only database leakage; it does not solve arbitrary server/database write compromise.

### 6. Global authentication budgets can be used to deny login — medium

Evidence: `src/lib/rate-limit.ts:71`, `src/lib/rate-limit.ts:86`.

All clients share a 200-attempt login budget per five minutes and a 50-attempt registration budget per ten minutes. Device identity is caller-controlled, so an attacker can rotate device values/account names to exhaust the global budget and temporarily block legitimate users. Likewise, targeted attempts can consume an account's 30-attempt budget. The persistent transactional reservations correctly resist concurrency and restart bypass; the concern is collateral lockout.

Recommendation: layer trusted ingress/source throttling, adaptive backoff and account protections with a global resource budget that preserves capacity for legitimate clients. Trust forwarded IP headers only from a configured proxy.

### 7. File-signature checks are too permissive — medium/low defense-in-depth

Evidence: `src/lib/uploads.ts:120`, `src/lib/uploads.ts:163`, `src/lib/uploads.ts:185`.

Confirmed by invoking the actual transpiled validator with a three-byte zero buffer: video/mp4, audio/mp4 and video/quicktime all return true. These types accept a generic zero prefix rather than requiring a valid container structure. Other checks identify prefixes rather than validating/decode-testing the complete file, and unknown types return true in the helper (current route MIME allowlists still constrain callers).

Recommendation: reject unknown types, enforce minimum lengths and valid container signatures, and use a maintained parser or isolated decoding/re-encoding where stronger validation is needed. Magic bytes alone are not malware protection. This finding does not demonstrate server-side code execution; authenticated serving and nosniff already reduce browser risks.

### 8. Some resource controls are process-local or absent — medium under hostile member traffic

Evidence: `src/lib/rate-limit.ts:13`, `src/app/actions/votes.ts:364`, `src/app/api/rehearsals/[id]/voting-stream/route.ts:12`, `src/app/actions/user.ts:249`, `src/app/actions/user.ts:279`.

Upload and external-search counters reset on process restart and do not coordinate across replicas. Login/registration counters are persistent and are not affected by this particular limitation. Comments, several writes, and SSE connections have no dedicated abuse limits. Each SSE connection polls database-backed voting state every two seconds. Comments have a per-comment length cap, but not a count/rate cap. Notes lack explicit server-side length bounds; marker lists are individually capped, but arbitrary new marker keys can grow the stored map over successive calls. Full library/rehearsal/comment reads are unpaginated.

Recommendation: share relevant counters across replicas, cap concurrent streams and mutation rates, bound text and map sizes on the server, and paginate growing collections. Existing framework request-size limits do not substitute for cumulative storage limits.

### 9. HTTPS and browser security policy depend on deployment — conditional hardening

Evidence: `docker-compose.yml:8`, `src/lib/auth-cookies.ts:2`, `next.config.ts`, `src/proxy.ts`.

Production cookies require HTTPS, but the provided Compose configuration publishes an HTTP application port and supplies no TLS terminator. No application-wide CSP, frame-ancestors/X-Frame-Options, HSTS, or Referrer-Policy was found. A reverse proxy may provide these; its configuration was not present. SameSite=Lax and Next Server Action origin protections provide useful CSRF defenses; the custom upload POST routes do not add explicit origin/token checks. This is not a demonstrated cross-site request exploit, particularly with same-site cookies in place.

Recommendation: verify the actual TLS proxy and headers, limit direct backend exposure, add a compatible CSP/frame policy, and explicitly enforce expected origins for custom state-changing endpoints where appropriate. Enable HSTS at the HTTPS boundary after validating the deployment.

### 10. Database/uploads/backups have no application-managed encryption at rest — deployment decision

Evidence: `src/db/index.ts`, `docker-entrypoint.sh`, `docker-compose.yml`.

SQLite, uploaded files, and pre-migration snapshots are ordinary files. Disk/volume encryption and remote encrypted backups may exist outside the repository and were not assessed. Startup snapshots are local recovery copies, not demonstrated off-host disaster recovery; they also retain deleted data and bearer tokens until rotated out.

Recommendation: set a storage/backup protection and retention policy appropriate to the data, verify host/volume encryption and restore procedures, and restrict backup access. Password hashing and HTTPS do not provide file encryption.

### 11. Custom JavaScript secret comparison overstates its guarantee — low

Evidence: `src/lib/utils.ts:8`, `src/app/actions/auth.ts:83`.

safeEqual avoids early exit for equal-length strings, but JavaScript/JIT execution does not guarantee constant-time behavior. The stated Edge-runtime rationale is stale for its current usage: the only production caller is a Node server action. Registration attempt limits reduce practical exploitability; no usable remote timing attack was demonstrated.

Recommendation: use Node crypto timingSafeEqual with carefully handled byte lengths, or compare fixed-size cryptographic digests, and correct the comment. Keep attempt limits.

### 12. Development dependencies have reported advisories — maintenance work

The full npm audit reported 27 affected packages: 25 moderate and 2 low; zero high/critical. These counts include transitive dependency effects, not 27 distinct vulnerabilities. Root advisories reported involve esbuild's development-server access policy, minimatch resource amplification, and deepmerge prototype poisoning. npm audit --omit=dev reported zero affected production dependencies. This is an advisory-database result, not proof of exploitability or absence of vulnerabilities.

Recommendation: update compatible development-tool dependency chains, review tool exposure and any remaining advisories individually, and avoid running development/database tooling on a public interface. No dependency updates or npm audit fix were performed.

## Additional observations

- Browser waveform generation fetches and decodes entire files (`src/lib/waveform.ts:37`). Uploaded compressed media can decode to much larger PCM buffers, causing browser memory pressure. Bound concurrent decodes and supported duration/decoded size. The 50-entry peaks cache itself is bounded and reasonable.
- Account deletion intentionally preserves shared comments and nominator references; these retain the old user UUID, while the username join becomes null. Confirm this matches the promised retention policy. Local snapshots also preserve old data until rotation.
- A stale comment at `src/app/api/uploads/[id]/route.ts:20` says authentication is a no-op without BAND_SECRET. That is false: requireAuth always validates a session. Correct the comment; the implementation is the safer behavior.
- Registration adopts an unsigned device UUID to preserve legacy anonymous rows. It refuses IDs already owned by an existing account, so this is not an existing-account takeover. If unclaimed historical private rows still exist, knowing their UUID could allow claiming them; retire the compatibility path after migration.
- No obvious SQL-injection, shell-execution, raw HTML injection, or arbitrary server-side URL-fetch sink was found in the reviewed application paths. This is not a blanket guarantee.

## Validation

- Existing test suite: 13 files, 103 tests passed during this review session. Security coverage includes forged/expired sessions, personal-data account binding, password-change session revocation, cookie transport, redirect filtering, rate limits, multipart caps and selected file signatures. Passing tests do not cover all findings above.
- Disposable local probe of the existing validator confirmed the three-byte MP4/M4A/MOV acceptance; it wrote no media or database rows.
- Local crypto probe confirmed the implicit scrypt parameters.
- Full and production-only npm advisory scans completed successfully. Raw results were saved under `/tmp/bandboard-npm-audit.json` and `/tmp/bandboard-npm-audit-production.json` for this workspace session.
- No application secrets or production data contents were read. No load attack, production exploit, or deployment change was performed.

## Original ponytail inventory

All 31 original occurrences are listed below. Security-related shortcuts have been replaced; UI and playback tradeoffs remain where reasonable. Locations refer to the pre-hardening revision.

| Location | Original comment |
| --- | --- |
| `src/app/actions/rehearsals.ts:101` | // ponytail: re-sending the stored (possibly past) end must not fail — |
| `src/app/actions/votes.ts:63` | // ponytail: tie rule per product decision — strict top-N, then extend past N |
| `src/components/AddRehearsalModal.tsx:167` | {/* ponytail: footer scrolls with the form; pin it only if this reads badly */} |
| `src/components/AddSongModal.tsx:148` | {/* ponytail: footer scrolls with the form; pin it only if this reads badly */} |
| `src/components/ConvertToVoteModal.tsx:146` | {/* ponytail: footer scrolls with the form; pin it only if this reads badly */} |
| `src/components/CustomPlaybackHUD.tsx:43` | // ponytail: cooldown filters the synthetic mouseenter the browser fires when |
| `src/components/EditRehearsalModal.tsx:76` | // ponytail: no min when the stored end is already past — native |
| `src/components/EditRehearsalModal.tsx:175` | {/* ponytail: footer scrolls with the form; pin it only if this reads badly */} |
| `src/components/KanbanBoard.tsx:111` | // ponytail: no overflow-y-auto here — a scrollable droppable |
| `src/components/OriginalEditor.tsx:539` | // ponytail: don't clear coverArtFile yet — keep blob URL visible until song prop updates. |
| `src/components/OriginalEditor.tsx:544` | // ponytail: don't clear coverArtMarkedForRemoval yet — keep null preview until song prop updates. |
| `src/components/SaveBar.tsx:84` | // ponytail: leaves one same-URL history entry behind after a guarded SPA nav; harmless. |
| `src/components/WaveformDisplay.tsx:87` | // ponytail: cap draw columns — at max zoom a clip spans tens of thousands |
| `src/db/schema.ts:213` | // ponytail: dead since the cookie migration (lib/device-media.ts); kept to |
| `src/db/schema.ts:232` | // ponytail: integer percent (50–200), unlike userSettings.playbackSpeed REAL |
| `src/hooks/useMultiStemPracticeEngine.tsx:77` | // ponytail: practice mode always starts from zero — discard any startOffset. |
| `src/hooks/useMultiTrackPlayer.ts:14` | // ponytail: rAF-driven currentT state updates every frame. Fine for 5–8 tracks |
| `src/hooks/useMultiTrackPlayer.ts:182` | // ponytail: reset playhead on song switch (track set change). Cancels the rAF |
| `src/hooks/useMultiTrackPlayer.ts:278` | // ponytail: not using useMediaStoreSync here — the volume push-down is |
| `src/lib/auth.ts:64` | // ponytail: fixed-param scrypt is plenty for a band app; move to argon2 if |
| `src/lib/constants.ts:181` | // ponytail: uploads buffer fully in RAM (route.ts arrayBuffer()); 250MB peaks |
| `src/lib/constants.ts:247` | // ponytail: unmapped types (mkv, ogg on Safari) intentionally warn everywhere. |
| `src/lib/file-stream.ts:11` | * ponytail: replaces Readable.toWeb; revisit if Node ever fixes the abort race. |
| `src/lib/rate-limit.ts:13` | // ponytail: in-memory fixed-window limiter, fine for LAN scale; move to a |
| `src/lib/serialize.ts:1` | // ponytail: read-boundary adapter. Raw DB rows expose `tunings` as a JSON text |
| `src/lib/uploads.ts:185` | // Ponytail: checks first 8 bytes max. A dedicated mime-validator lib would |
| `src/lib/utils.ts:12` | * ponytail: pure-JS so it works in both Node and Edge runtimes without a |
| `src/lib/utils.ts:112` | * ponytail: falls back to getRandomValues v4; upgrade to randomUUID only |
| `src/lib/waveform.ts:14` | // ponytail: bounded cache — 50 entries max, simple FIFO eviction. |
| `src/lib/waveform.ts:37` | // ponytail: fetches full file for decode. Fine for local band stems (3-10MB). |
| `src/stores/save-bar-store.ts:7` | // ponytail: `unknown` return — savers may or may not report success booleans |

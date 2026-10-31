# Security and deployment

This is one shared band workspace. Personal settings, notes and practice progress
are account-scoped. All signed-in band members have the same permissions for
shared songs, media, rehearsals, nominations and voting. There is no organizer or
administrator role. Authentication and abuse limits still apply to all actions.

## Upgrade and account behavior

Back up the database and uploads before upgrading. Migration 0011 preserves
accounts/content and revokes existing sessions once. Everyone must log in again.
Migration 0012 removes the account-role column introduced in the first hardening
revision, preserving accounts, content and active hashed sessions. The earlier
migration is retained so installations that already applied it can upgrade safely.
New accounts never claim unsigned device IDs or historical anonymous private data.

Legacy scrypt passwords work and upgrade to Argon2id on login. Existing shorter
passwords remain valid until changed. New passwords require 12–1024 characters.
Argon2id uses 64 MiB, three passes, one lane, random 16-byte salts and PHC strings
carrying version/cost metadata. Two password operations run per Node process at
most, without an unbounded queue. Do not roll back an older app against upgraded
hashes; restore its matching database snapshot if rolling back the application.

Sessions use random 256-bit tokens, with only SHA-256 digests stored in SQLite.
They expire after 30 days or seven idle days. Password changes rotate the current
token and revoke all others atomically. Settings offers “Log Out Other Devices.”
At most ten sessions per account are retained. Session cookies are HttpOnly,
SameSite=Lax and Secure in production.

Registration defaults to `REGISTRATION_MODE=invite`. It works only with a nonempty
`BAND_SECRET` and matching invite code. `closed` disables registration; `open`
explicitly permits public member registration. Invalid/missing invite configuration
closes registration. Configure a strong invite before exposing an empty installation. Rotating the invite does not revoke existing
accounts; review any accounts admitted before the upgrade.

## HTTPS and ingress

Base Compose binds the backend to `127.0.0.1` by default. Use a trusted HTTPS
proxy and set `APP_ORIGIN` to the exact external origin. This supplies the upload
origin check and enables HSTS. Do not publish the HTTP backend publicly.

HTTPS termination is supplied by your hosting setup, such as Cloudflare Tunnel
or an existing reverse proxy. No HTTPS proxy is bundled with the application.
The local connection from the tunnel or proxy to Bandboard can use HTTP.
Enable `TRUST_PROXY=true` only when a trusted proxy overwrites X-Real-IP and
clients cannot bypass it. Otherwise forwarded IPs are ignored. For Cloudflare
Tunnel, leave this false unless that header is explicitly sanitized.
Also bound connection counts, request-read time and unauthenticated rates at the
network/ingress layer. Distributed abuse cannot be prevented by IP limits alone.

HTML has a per-request nonce CSP, framing/object restrictions and production
HTTPS upgrades. The theme initializer receives the nonce. Other headers include
nosniff, DENY framing, a referrer policy and restricted device permissions.
Next Server Actions retain framework origin validation. Upload POSTs require an
exact same-origin Origin header. API routes authenticate themselves and bypass
Next's proxy to avoid buffering large multipart bodies before streaming.

## Resource and media limits

Persistent SQLite counters and expiring leases coordinate workers using the same
database. This remains a single-host SQLite app; unrelated databases and unsafe
network-filesystem replicas are not supported.

Defaults in `src/lib/constants.ts`:

- Tracks: 250 MiB; covers: 5 MiB. Two concurrent uploads total, one per account,
  120-second streaming deadline, 20 requests / ten minutes per account.
- Storage: 10 GiB total, 2 GiB per uploader, 10,000 files. Account upload byte
  budget: 512 MiB / ten minutes. Pending uploads reserve their maximum size;
  unused bytes are refunded for completed parsing. Failed/aborted parsing is
  conservatively charged its reservation. Disk headroom is checked before reads.
- Voting streams: three per account, 50 overall, five-minute reconnects, bounded
  output, revocation checks, expiring leases and cancellation cleanup.
- Mutations: 120 / minute per account. Comments: ten / minute. Password changes
  and account deletion share five verification attempts / ten minutes.
- Collections: 2,000 members/songs, 1,000 rehearsals, 1,000 comments per thread
  (100,000 overall). Text/map sizes are checked on writes. Caps prevent new
  growth and do not truncate older data that already exceeds them.

Legacy media has no trustworthy uploader: migration charges known track sizes
and a conservative 5 MiB per legacy cover to the global quota. New uploads stream
to exclusive mode-0600 temporary files and get bounded multipart/header checks,
path containment, asynchronous writes and cleanup. Abandoned temporary files
are removed. Covers are fully decoded under a 16-megapixel / 4096px budget and
re-encoded as metadata-free single-frame WebP; animated covers use their first
frame. Other media gets container/header checks, not malware scanning or a full
trusted decode. Keep browser codecs updated.

Waveform previews serialize work, cap compressed input at 16 MiB, check container
duration before PCM decoding (ten-minute limit), lower the preview sample rate
and bound queued work. Unsupported previews fail without preventing playback.
This does not guarantee protection from browser codec vulnerabilities.

## Files, snapshots and encryption

Files have restrictive permissions. The container runs the application as an
unprivileged user. Compose bounds memory, CPU and process counts and disallows
privilege elevation. New snapshots use a separate root-owned `/app/backups`
volume outside the application's writable data directory.

Set `BACKUP_AGE_RECIPIENT` to an age **public recipient** to encrypt database
snapshots. Keep its private key offline. A DB/WAL/SHM archive streams through a
FIFO into age without a plaintext intermediate; producer/encryption failure
stops startup. Without a recipient, snapshots remain plaintext mode-0600 files
in the restricted backup volume. `BACKUP_KEEP` defaults to ten; zero disables
snapshots, maximum 100. Restore into a separate directory with:

```sh
age --decrypt -i /secure/path/backup-key.txt database.tar.age | tar -xf -
```

Verify the restored database, then copy it and matching uploads with the app
stopped. Database snapshots do not include uploads: back up that volume too.
Test off-host encrypted backups and restores. Snapshots retain deleted data
until rotation. Older snapshots may contain raw session tokens. Upgrading does
not retroactively encrypt/move old data-volume backups; retire or retain them
under your backup policy.

**Live database/upload encryption at rest requires encrypted host volumes.** The
app does not provide SQLCipher or manage a live file-encryption key. HTTPS,
Argon2id and encrypted snapshots do not encrypt those live files.

Builds use an in-memory database. Docker exclusions, tracing exclusions and the
postbuild sanitizer remove environment files/databases/uploads from standalone
output. Next explicitly copies .env despite tracing exclusions, so package with
`npm run build` and retain its postbuild step. Supply credentials at runtime.

## Checks and remaining limits

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`.
Tests cover populated-database migration, equal member permissions, session expiry/revocation,
legacy hashes, KDF concurrency, quotas, multipart overflow/cancellation cleanup,
origins and image normalization.

Production-only npm audit reports no advisories. Development-tool advisories
remain in upstream dependency chains. Do not expose development servers or
Drizzle Studio publicly. A major tooling update was blocked by a registry
404; unsafe transitive cross-major overrides and suggested downgrades were not
applied. The original review/comment inventory is in `SECURITY_REVIEW.md`.

This does not provide MFA, a security audit-log service, malware scanning,
managed secret rotation or verification of production infrastructure.

## Verification for this change

The initial hardening passed 129 tests, type checking, lint and production build. The sanitized
standalone runtime was smoke-tested in Docker with real Chromium: invite signup,
the then-present role restrictions, secure cookie flags, streamed uploads, WebP cover
normalization, protected downloads, malformed media and wrong-origin rejection,
and zero CSP violations. No temporary media or resource leases remained.
Encrypted snapshot round trips, privilege drop, backup isolation and encryption
failure cleanup passed; the Compose configuration validated.

The complete multi-stage Docker build exceeded this environment's disk quota
with its VFS storage driver. Dependencies installed successfully; the runtime
stage was instead built and tested using the verified local production bundle.
No production deployment or existing application database was modified.

The subsequent role-removal revision restores equal shared-content permissions,
removes member-management controls and the last-organizer deletion restriction,
and styles “Log Out Other Devices” consistently with “Log Out.” Its migration
also preserves active sessions from already-upgraded databases. All other
hardening choices remain in place pending the user's review.

Role-removal verification: 131 tests, type checking, lint and the production build
passed. Chromium confirmed matching logout-button styling, removal of member
management and the role column, and shared editing access after migration.

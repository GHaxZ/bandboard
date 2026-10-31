# ---- deps: install node_modules (build tools for better-sqlite3 fallback build) ----
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js standalone bundle ----
FROM node:22-slim AS builder
WORKDIR /app
# Each build worker gets an isolated connection; no runtime data is read at
# build time, and sharing a fresh SQLite file can race on WAL initialization.
ENV DATABASE_PATH=:memory: \
    MIGRATE_ON_BOOT=0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal production image ----
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends age util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/sqlite.db \
    UPLOAD_DIR=/app/uploads \
    BACKUP_DIR=/app/backups \
    MIGRATE_ON_BOOT=1

# Next standalone server + traced node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Drizzle migrations — app runs these on boot (src/db/index.ts)
COPY --from=builder /app/drizzle ./drizzle
# Belt-and-suspenders: guarantee the better-sqlite3 native binding is present
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

COPY docker-entrypoint.sh /entrypoint.sh
# Build inputs can carry restrictive modes. Keep code root-owned and readable
# by the unprivileged runtime user, with writes limited to mounted data paths.
RUN chmod -R u=rwX,go=rX /app && chmod 755 /entrypoint.sh

VOLUME ["/app/data", "/app/uploads", "/app/backups"]
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]

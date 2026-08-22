#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="${DATABASE_PATH:-$DATA_DIR/sqlite.db}"
BACKUP_ROOT="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP="${BACKUP_KEEP:-10}"
UPLOADS_DIR="${UPLOAD_DIR:-/app/uploads}"

mkdir -p "$DATA_DIR" "$BACKUP_ROOT" "$UPLOADS_DIR"

# Pre-migration snapshot. Runs before the app starts (and thus before any
# migration), so a bad migration can never destroy data. We copy the db plus
# its WAL/SHM sidecars together — no process holds the db at entrypoint time,
# so the three files form a consistent snapshot.
if [ -f "$DB_PATH" ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  B="$BACKUP_ROOT/$TS"
  mkdir -p "$B"
  cp "$DB_PATH" "$B/sqlite.db"
  [ -f "$DB_PATH-wal" ] && cp "$DB_PATH-wal" "$B/sqlite.db-wal"
  [ -f "$DB_PATH-shm" ] && cp "$DB_PATH-shm" "$B/sqlite.db-shm"
  echo "[entrypoint] backed up db -> $B"

  # Rotate: keep the newest $KEEP backup subdirs, remove the rest.
  ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf
fi

# Migrations run automatically inside the app on boot (MIGRATE_ON_BOOT != '0').

# Run the app as the unprivileged `node` user (was root before). Fix volume
# ownership first — this also repairs volumes that earlier root-running images
# created as root. `setpriv` exec-replaces the process, so the app stays PID 1
# and receives signals (docker stop) directly.
chown -R node:node "$DATA_DIR" "$UPLOADS_DIR" 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups "$@"

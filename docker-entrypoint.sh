#!/bin/sh
set -eu
umask 077

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="${DATABASE_PATH:-$DATA_DIR/sqlite.db}"
BACKUP_ROOT="${BACKUP_DIR:-/app/backups}"
KEEP="${BACKUP_KEEP:-10}"
UPLOADS_DIR="${UPLOAD_DIR:-/app/uploads}"
case "$KEEP" in ''|*[!0-9]*) echo 'BACKUP_KEEP must be an integer' >&2; exit 1;; esac
[ "$KEEP" -le 100 ] || { echo 'BACKUP_KEEP must be at most 100' >&2; exit 1; }
mkdir -p "$DATA_DIR" "$BACKUP_ROOT" "$UPLOADS_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_ROOT" "$UPLOADS_DIR"
# Existing installations may have files created before restrictive permissions.
find "$DATA_DIR" "$UPLOADS_DIR" -type f -exec chmod 600 {} +

# Snapshot only while no app process holds this database. Backups retain deleted
# data until rotation. Use encrypted volumes and off-host encrypted backups too.
if [ "$KEEP" -gt 0 ] && [ -f "$DB_PATH" ]; then
  TS=$(date +%Y%m%d-%H%M%S)-$$
  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    # No decrypted intermediate is created; only the public recipient is needed.
    # A private staging directory prevents a failed pipe leaving a usable snapshot.
    B="$BACKUP_ROOT/$TS"
    mkdir "$B"
    mkfifo "$B/archive.pipe"
    (
      cd "$(dirname "$DB_PATH")"
      set -- "$(basename "$DB_PATH")"
      [ ! -f "$DB_PATH-wal" ] || set -- "$@" "$(basename "$DB_PATH")-wal"
      [ ! -f "$DB_PATH-shm" ] || set -- "$@" "$(basename "$DB_PATH")-shm"
      exec tar -cf "$B/archive.pipe" "$@"
    ) &
    archive_pid=$!
    if age -r "$BACKUP_AGE_RECIPIENT" -o "$B/database.tar.age.tmp" "$B/archive.pipe"; then
      if ! wait "$archive_pid"; then rm -rf -- "$B"; exit 1; fi
    else
      kill "$archive_pid" 2>/dev/null || true
      wait "$archive_pid" 2>/dev/null || true
      rm -rf -- "$B"
      exit 1
    fi
    rm "$B/archive.pipe"
    mv "$B/database.tar.age.tmp" "$B/database.tar.age"
  else
    B="$BACKUP_ROOT/$TS"
    mkdir "$B"
    cp "$DB_PATH" "$B/sqlite.db"
    [ ! -f "$DB_PATH-wal" ] || cp "$DB_PATH-wal" "$B/sqlite.db-wal"
    [ ! -f "$DB_PATH-shm" ] || cp "$DB_PATH-shm" "$B/sqlite.db-shm"
  fi
  # Generated directory names contain only digits/hyphens. Restrict rotation to
  # these entries and quote paths rather than passing arbitrary names to xargs.
  count=0
  for entry in $(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??????-??????*' -printf '%f\n' | sort -r); do
    count=$((count + 1))
    [ "$count" -le "$KEEP" ] || rm -rf -- "$BACKUP_ROOT/$entry"
  done
fi

chown -R node:node "$DATA_DIR" "$UPLOADS_DIR"
exec setpriv --reuid=node --regid=node --init-groups "$@"

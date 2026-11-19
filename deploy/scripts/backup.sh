#!/usr/bin/env bash
# Back up the database and the storage volume into one dated directory.
#
# Design notes, because backups are where good intentions go wrong:
#   * custom format (-Fc) restores selectively and compresses; a plain SQL dump does not.
#   * the schema and the files must share a timestamp, or a restore pairs yesterday's
#     rows with today's files.
#   * the script verifies what it wrote by listing the dump's table of contents, because
#     an unreadable backup is worse than no backup: it is a false sense of safety.
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-./backups}/$STAMP"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
STORAGE_DIR="${STORAGE_LOCAL_DIR:-/data/storage}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$OUT_DIR"

echo "→ database"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$OUT_DIR/database.dump"

echo "→ storage"
if docker compose ps --status running --services 2>/dev/null | grep -q '^web$'; then
  # Read the volume through a container so the host does not need to know its path.
  docker compose exec -T web tar -czf - -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" > "$OUT_DIR/storage.tar.gz"
else
  tar -czf "$OUT_DIR/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
fi

echo "→ verify"
pg_restore --list "$OUT_DIR/database.dump" > "$OUT_DIR/toc.txt"
TABLE_COUNT="$(grep -c 'TABLE DATA' "$OUT_DIR/toc.txt" || true)"
tar -tzf "$OUT_DIR/storage.tar.gz" > /dev/null
if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "backup verification failed: no table data in the dump" >&2
  exit 1
fi

cat > "$OUT_DIR/manifest.json" <<JSON
{"taken_at":"$STAMP","tables":$TABLE_COUNT,"database_dump":"database.dump","storage_archive":"storage.tar.gz"}
JSON

echo "→ retention (${RETENTION_DAYS}d)"
find "${BACKUP_DIR:-./backups}" -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} + 2>/dev/null || true

echo "done: $OUT_DIR ($TABLE_COUNT tables)"

#!/usr/bin/env bash
# Restore a backup directory produced by backup.sh into an EMPTY database.
#
# It refuses to run against a database that already has tables unless FORCE=1 is set.
# Restoring on top of live data is how a "quick check" becomes an incident.
set -euo pipefail

SRC="${1:?usage: restore.sh <backup-dir> [target-database-url]}"
TARGET="${2:-${DATABASE_URL:?DATABASE_URL or an explicit target is required}}"
STORAGE_DIR="${STORAGE_LOCAL_DIR:-/data/storage}"

[ -f "$SRC/database.dump" ] || { echo "missing $SRC/database.dump" >&2; exit 1; }

EXISTING="$(psql "$TARGET" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "${FORCE:-0}" != "1" ] && [ "$EXISTING" != "0" ]; then
  echo "refusing: target already has $EXISTING tables (set FORCE=1 to override)" >&2
  exit 1
fi

echo "→ restoring database into an otherwise empty schema"
pg_restore --dbname="$TARGET" --no-owner --no-privileges --exit-on-error "$SRC/database.dump"

echo "→ restoring files"
if [ -f "$SRC/storage.tar.gz" ]; then
  tar -xzf "$SRC/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")"
fi

echo "→ verifying"
psql "$TARGET" -tAc "select count(*) from information_schema.tables where table_schema='public'" | sed 's/^/tables: /'
psql "$TARGET" -tAc 'select count(*) from "User"' | sed 's/^/users: /' || true
echo "restore complete"

#!/usr/bin/env bash
# Nightly backup: snapshots the club database (members, events, nets,
# repeaters), compresses it, ENCRYPTS it with BACKUP_PASSPHRASE (from .env,
# inside the container), keeps 30 days locally, and pushes a copy to OneDrive
# via rclone (the same "onedrive" remote the other backups use).
# Restoring: see ops/RESTORE.md.
#
#   15 4 * * * /root/forx-radio-club/ops/db-backup.sh >> /var/log/forx-db-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname -- "$SCRIPT_DIR")
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
BACKUP_DIR="$PROJECT_DIR/backups"
RETENTION_DAYS=30
RCLONE_REMOTE="onedrive:claude/forx-radio-club-db-backups"

FILENAME="forx_$(date +%Y%m%d_%H%M%S).db.gz.enc"
OUT="$BACKUP_DIR/$FILENAME"

mkdir -p "$BACKUP_DIR"
umask 077

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
trap 'rm -f "$OUT"' ERR

compose exec -T forx node server/snapshot.mjs \
  | gzip \
  | compose exec -T forx node server/backup-crypto.mjs encrypt \
  > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "Backup produced an empty file — aborting." >&2
  rm -f "$OUT"; exit 1
fi

# Prove it opens with the current passphrase before it leaves this machine.
compose exec -T forx node server/backup-crypto.mjs decrypt < "$OUT" | gunzip -t

rclone copy "$OUT" "$RCLONE_REMOTE/"

find "$BACKUP_DIR" -name 'forx_*.db.gz.enc' -mtime "+$RETENTION_DAYS" -delete
rclone delete --min-age "${RETENTION_DAYS}d" "$RCLONE_REMOTE/"

echo "Backed up (encrypted) to $OUT and $RCLONE_REMOTE/$FILENAME"

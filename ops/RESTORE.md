# Restoring the club database

You need `BACKUP_PASSPHRASE` (password manager) in `/root/forx-radio-club/.env`.

```bash
cd /root/forx-radio-club && rclone copy onedrive:claude/forx-radio-club-db-backups/<file> backups/ && docker compose stop forx && docker compose run --rm -T forx node server/backup-crypto.mjs decrypt < backups/<file> | gunzip > data/forx.db && rm -f data/forx.db-wal data/forx.db-shm && docker compose up -d
```

#!/usr/bin/env bash
# Encrypted backup of the database and uploaded files, run nightly by cron (see bootstrap.sh).
# Keeps 14 days in /var/backups/yari. Copy them off this server too: a backup on the same
# disk doesn't survive losing the server.
#
# Restore (on a server set up with the same .env.production):
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in db-<date>.dump.enc |
#     docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
#     pg_restore -U yari -d yari --clean --if-exists
#   openssl enc -d ... -in uploads-<date>.tar.gz.enc | docker run --rm -i -v yari_uploads:/data \
#     public.ecr.aws/docker/library/alpine:3 tar -xzf - -C /data
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env.production
set -a; . ./"$ENV_FILE"; set +a
[ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "No BACKUP_PASSPHRASE in $ENV_FILE; skipping backup."; exit 1; }

dir=/var/backups/yari
stamp=$(date -u +%Y%m%d-%H%M)
# The files are encrypted (the passphrase is only in the root-only .env.production), so the
# server's login user may read them to copy them off with scp.
mkdir -p "$dir" && chmod 755 "$dir"
# Writes to a .part file first, so a failed run never leaves a backup that looks complete.
encrypt() {
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$1.part"
  mv "$1.part" "$1"
}

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T db pg_dump -U yari -Fc yari |
  encrypt "$dir/db-$stamp.dump.enc"
docker run --rm -v yari_uploads:/data:ro public.ecr.aws/docker/library/alpine:3 tar -czf - -C /data . |
  encrypt "$dir/uploads-$stamp.tar.gz.enc"

find "$dir" \( -name '*.enc' -o -name '*.part' \) -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: $(du -sh "$dir" | cut -f1) in $dir"

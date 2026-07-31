#!/bin/sh
set -eu

retention_days="${BACKUP_RETENTION_DAYS:-14}"

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  pg_dump --format=custom --file="/backups/autouploader-${timestamp}.dump"
  find /backups -type f -name 'autouploader-*.dump' -mtime "+${retention_days}" -delete
  sleep 86400
done

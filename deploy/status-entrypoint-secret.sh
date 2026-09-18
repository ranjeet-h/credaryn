#!/bin/sh
# Builds DATABASE_URL for the status service from the Docker secret file so the
# PostgreSQL password never appears in Compose environment values. Mirrors the
# DSS keystore wrapper; mounted read-only by docker-compose.yml.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -f /run/secrets/postgres_password ]; then
    echo "status: /run/secrets/postgres_password is required" >&2
    exit 1
  fi
  password="$(cat /run/secrets/postgres_password)"
  encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$password")"
  host="${STATUS_DB_HOST:-status-db}"
  port="${STATUS_DB_PORT:-5432}"
  user="${POSTGRES_USER:-credaryn}"
  database="${POSTGRES_DB:-credaryn}"
  DATABASE_URL="postgresql://${user}:${encoded}@${host}:${port}/${database}"
  export DATABASE_URL
fi

exec "$@"

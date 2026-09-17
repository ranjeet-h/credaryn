#!/usr/bin/env bash
set -euo pipefail

url="${DSS_URL:-http://127.0.0.1:8080}/health"
curl --fail --silent --show-error "$url" | grep --quiet '"status":"ready"'
echo "DSS 6.5 boundary is ready at $url"

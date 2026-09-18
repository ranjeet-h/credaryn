#!/usr/bin/env bash
# Reads the DSS keystore password from a Docker secret file instead of an inline
# environment value, then hands off to the adapter's normal entrypoint.
set -euo pipefail

secret_file="${DSS_KEYSTORE_PASSWORD_FILE:-/run/secrets/dss_keystore_password}"

if [[ -z "${DSS_KEYSTORE_PASSWORD:-}" && -r "$secret_file" ]]; then
  DSS_KEYSTORE_PASSWORD="$(cat "$secret_file")"
  export DSS_KEYSTORE_PASSWORD
fi

exec /usr/local/bin/credaryn-dss-entrypoint

#!/usr/bin/env bash
set -euo pipefail

keystore_path="${DSS_KEYSTORE_PATH:-/tmp/credaryn-demo.p12}"
keystore_password="${DSS_KEYSTORE_PASSWORD:-changeit}"
key_alias="${DSS_KEY_ALIAS:-credaryn-demo}"

if [[ ! -f "$keystore_path" ]]; then
  keytool -genkeypair \
    -alias "$key_alias" \
    -keyalg EC \
    -groupname secp256r1 \
    -sigalg SHA256withECDSA \
    -dname "CN=Credaryn Demo Issuer, O=Credaryn" \
    -validity 3650 \
    -storetype PKCS12 \
    -keystore "$keystore_path" \
    -storepass "$keystore_password" \
    -keypass "$keystore_password" \
    -noprompt
fi

export DSS_KEYSTORE_PATH="$keystore_path"
export DSS_KEYSTORE_PASSWORD="$keystore_password"
export DSS_KEY_ALIAS="$key_alias"
exec java -jar /opt/credaryn/dss-boundary-adapter.jar

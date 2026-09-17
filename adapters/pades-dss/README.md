# DSS 6.5 adapter boundary

This container builds against the official European Commission DSS Maven artifacts at version `6.5` and exposes the isolated PAdES signing/validation boundary. Its default key is generated ephemerally in `/tmp` for local demonstrations only; production deployments must mount a controlled keystore and secret rather than use the demo defaults.

The container exposes only normalized byte-oriented endpoints:

- `GET /health` confirms the DSS 6.5 PAdES class is available.
- `POST /v1/probe` accepts a normalized JSON probe containing `operation`, `pdfBase64` and `signatureRequest`, and returns normalized metadata without exposing DSS or Java types to Node packages.
- `POST /v1/sign` accepts a bounded PDF, an artifact digest and public signer identity, then returns a PAdES Baseline B-B PDF.
- `POST /v1/verify` validates the PDF signature and reports cryptographic validity and artifact integrity.

Start it from the repository root:

```bash
docker compose -f adapters/pades-dss/docker-compose.yml up -d --build
./adapters/pades-dss/healthcheck.sh
curl -fsS -X POST http://127.0.0.1:8080/v1/probe \
  -H 'content-type: application/json' \
  -d '{"operation":"sign","pdfBase64":"JVBERi0xLjQ=","signatureRequest":{"level":"B-B","artifactDigest":"sha256:fixture"}}'
```

The default demo key is not a production trust anchor. `DSS_KEYSTORE_PATH`,
`DSS_KEYSTORE_PASSWORD`, `DSS_KEY_ALIAS`, `DSS_ISSUER_ID` and `DSS_KEY_ID`
configure a mounted signing credential and immutable application identity.

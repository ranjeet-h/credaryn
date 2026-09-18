# DSS 6.5 adapter boundary

This container builds against the official European Commission DSS Maven artifacts at version `6.5` and exposes the isolated PAdES signing/validation boundary. Its default key is generated ephemerally in `/tmp` for local demonstrations only; production deployments must mount a controlled keystore and secret rather than use the demo defaults.

The container exposes only normalized byte-oriented endpoints:

- `GET /health` confirms the DSS 6.5 PAdES class is available.
- `POST /v1/probe` accepts a normalized JSON probe containing `operation`, `pdfBase64` and `signatureRequest`, and returns normalized metadata without exposing DSS or Java types to Node packages.
- `POST /v1/sign` accepts a bounded PDF, an artifact digest, public signer identity and a requested `level`, then returns a PAdES Baseline B-B PDF, or B-T when a TSA is configured. A `B-T` request against a boundary without a configured TSA fails closed with HTTP 400 (`timestamping_not_configured`); it is never silently downgraded.
- `POST /v1/verify` validates every PDF signature and reports cryptographic validity and artifact integrity for B-B and B-T. It derives `issuerId` (certificate CN/OU) and `keyId` (`sha256:` certificate fingerprint) from the *artifact's* signing certificate, never from container configuration; the fields are omitted when no signing certificate can be read.

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
configure a mounted signing credential and the identity used while *signing*.
Verification ignores them and attributes the result to the certificate embedded
in the PDF, so a valid PDF from any issuer is not mislabelled as this container.

## Timestamping (PAdES Baseline B-T)

B-T is opt-in. Set `DSS_TSA_URL` to an RFC 3161 timestamp-authority URL when
starting the container (the Compose file passes the host variable through):

```bash
DSS_TSA_URL=https://tsa.example.test docker compose -f adapters/pades-dss/docker-compose.yml up -d --build
```

The boundary then sets an `OnlineTSPSource` on the PAdES service, advertises
`"supportsTimestamping": true` from `GET /health`, and accepts sign requests
whose `signatureRequest.level` is `"B-T"`. With no `DSS_TSA_URL` the boundary
stays at B-B and rejects `"B-T"` with HTTP 400. The TypeScript boundary declares
the same capability via `new DssPdfSignatureEngine({ endpoint, timestampAuthorityUrl })`
(or the same `DSS_TSA_URL` environment variable); the sidecar must be configured
with the URL too, otherwise a `B-T` request fails closed.

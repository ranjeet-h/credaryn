# DSS 6.5 adapter boundary

This Phase 0 container builds against the official European Commission DSS Maven artifact `eu.europa.ec.joinup.sd-dss:dss-pades:6.5`. It proves the isolated deployment boundary and classpath version before the signing implementation is added in Milestone 3.

The container intentionally exposes only normalized byte-oriented probe endpoints in this phase:

- `GET /health` confirms the DSS 6.5 PAdES class is available.
- `POST /v1/probe` accepts a normalized JSON probe containing `operation`, `pdfBase64` and `signatureRequest`, and returns normalized metadata without exposing DSS or Java types to Node packages.

Start it from the repository root:

```bash
docker compose -f adapters/pades-dss/docker-compose.yml up -d --build
./adapters/pades-dss/healthcheck.sh
curl -fsS -X POST http://127.0.0.1:8080/v1/probe \
  -H 'content-type: application/json' \
  -d '{"operation":"sign","pdfBase64":"JVBERi0xLjQ=","signatureRequest":{"level":"B-B","artifactDigest":"sha256:fixture"}}'
```

The probe is not a PAdES signing implementation. `adapters/pades-dss/src/main/java/com/credaryn/dss/DssBoundaryApplication.java` is replaced/extended by the normalized `PdfSignatureEngine` implementation in Phase 3, while the DSS dependency remains isolated in this adapter.

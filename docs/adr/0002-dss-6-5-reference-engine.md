# ADR 0002: DSS 6.5 reference PAdES engine

## Status

Accepted.

## Decision

Use the European Commission DSS 6.5 Java implementation in a Dockerized,
non-root sidecar as the V1 reference PAdES engine. The sidecar performs
PAdES Baseline B-B signing with SHA-256/ECDSA and validates signed PDFs with
`SignedDocumentValidator`. Its HTTP boundary is deliberately narrow and
normalizes all requests and results before they reach TypeScript.

Puppeteer is the only V1 controlled PDF renderer. The reference invoice
materializes its Paper Seal QR and human-readable `CRD1:` transport before the
bytes are sent to the signing boundary. The pipeline computes the artifact
digest only after that seal-bearing PDF exists.

## Security and operational constraints

- The sidecar owns the signing key and receives no private-key material from
  Node packages.
- The demo PKCS#12 credential is generated in the container's ephemeral `/tmp`
  filesystem and is not a production trust anchor.
- Production deployments must mount a controlled keystore and secret, run the
  sidecar with a non-root user, and configure issuer/key identity explicitly.
- Requests are bounded to 16 MiB PDF input and have a client timeout.
- The adapter reports `qualifiedSignature: false`; PAdES alone is not a claim
  of qualified electronic-signature status.
- B-T is not attempted without an explicitly configured RFC 3161 TSA.

## Consequences

The TypeScript contract remains independent of Java/DSS types, and the
reference PDF vectors can be checked by any DSS 6.5-compatible deployment.
The sidecar adds a Java/Maven/Docker operational dependency for issuance, but
verification remains expressible as a bounded local adapter call and no
Credaryn-hosted service is required. An independent validator and
adoption-driven generator adapters may be added later without changing the
core verdict model.

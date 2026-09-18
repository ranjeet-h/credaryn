# Final compatibility matrix

| Area | Supported profile | Evidence | Limit |
| --- | --- | --- | --- |
| Runtime | Node 24+, pnpm 12 | `pnpm compatibility:report` | exact tested versions are report evidence |
| PDF | PAdES B-B (B-T when an RFC 3161 TSA is configured) | PDF fixtures, DSS and independent `pdfsig` report | B-T is capability-negotiated and fails fast without a TSA; not qualified-signature advice |
| Paper | CRD1 / CBOR / COSE ES256 / Base45 / QR M | published vectors | no universal printer/camera claim |
| Inputs | PDF, CRD1 text, Paper Seal PNG | V1 input matrix | bounded sizes only |
| Trust | local bundles, X.509 fingerprints, allow-listed did:web | trust-policy tests | operator anchors trust |
| Providers | local, injected AWS/GCP/Azure/PKCS#11 clients | provider tests/examples | mocks do not prove production accounts |
| W3C | VC 2.0/did:web reference path; ECDSA-SD-2023 and Bitstring Status List adapter paths | TrustVC tests and did:web vectors | dedicated final vector corpus remains open; adapter remains separate from core |
| Surfaces | SDK, CLI, verifier PWA/API, widget | shared result contract/tests | UI parity requires manual review |

See [runtime/generators](node-browsers-generators.md), [input matrix](v1-input-matrix.md), and [corpus results](final-corpus-results.md).

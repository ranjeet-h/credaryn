# Architecture index

Credaryn keeps standards and providers behind narrow byte/result contracts. Start with [the data contract](data-contract.md), [trust model](trust-model.md), [normalized verification result](verification-result.md), [PAdES boundary](pades-conformance.md), [Paper Seal Profile](paper-seal-profile-v1.md), and [browser-print boundary](browser-print.md).

`@credaryn/core` owns contracts and policy. Provider, DSS, TrustVC, status, UI, and deployment code depend inward; they do not redefine trust semantics. Core verification requires no hosted Credaryn service, blockchain, OCR, or watermark.

The verifier REST API is specified by the canonical OpenAPI 3.1 document
[`openapi/v1.yaml`](../../openapi/v1.yaml) (mirrored at
[`docs/api/openapi.yaml`](../api/openapi.yaml)): five endpoints
(`/v1/health`, `/v1/version`, `/v1/verify`, `/v1/verify/pdf`,
`/v1/verify/paper`) with request/response schemas.

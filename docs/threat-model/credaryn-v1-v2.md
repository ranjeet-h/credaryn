# Credaryn V1/V2 threat model

## Assets

- issuer private keys and keystore credentials;
- signed claims, PDF bytes, Paper Seal payloads, and trust material;
- lifecycle/status history and verifier audit records;
- user-uploaded PDFs, images, and OCR results.

## Threats and controls

| Threat | Required control | Evidence |
| --- | --- | --- |
| Edited PDF after signing | Bind the final seal-bearing bytes to PAdES and validate artifact integrity | `packages/pdf/test/mutation/`, DSS fixture verification |
| Edited Paper Seal claims | Verify COSE signature before reading claims | `packages/paper/test/mutation/`, `packages/paper/test/cose.test.ts` |
| Copied, fake, or removed seal | Separate cryptographic validity from trust and reject malformed/missing input | `packages/paper/test/adversarial-input.test.ts`, verifier input tests |
| Changed issuer/document/key identifier | Sign all identity fields and reject altered protected headers/payloads | `packages/paper/test/mutation/cose-fields.test.ts` |
| Stolen signing key | Isolate signing providers, keep local keys development-only, rotate and revoke operationally | `docs/key-management/`, `docs/status/lifecycle.md` |
| Cancellation or stale status | Keep lifecycle separate from cryptographic validity; fail closed when unavailable | `services/status/`, verifier result contracts |
| Compromised public/status service | Verify local signatures and require explicit trust material; never upgrade unknown network results | trust-policy and verifier tests |
| Malicious adapter | Use normalized `Uint8Array`/JSON boundaries and reject unsupported signature claims | adapter boundary tests and core boundary lint |
| Malformed CBOR/COSE/Base45/certificate-shaped input | Bound size/depth/items, reject non-canonical encodings, and do not parse certificates in core | paper adversarial, fuzz, and verifier input tests |
| Oversized files or decompression bombs | Bound PDF/image/text sizes and reject PNG dimensions before decompression | verifier input tests and `packages/paper/test/fuzz/png-bomb.test.ts` |
| OCR false positive | Keep OCR optional, confidence-bearing, and separate from authenticity | `README.md`, `docs/security/claims-vs-artifact.md` |

## Residual risk and release blockers

The reference DSS validator is not an independent implementation. A stable
1.0 release remains blocked until an independent PAdES-capable validator,
security review, provenance, and release evidence are recorded. This report
does not claim those external controls are complete.

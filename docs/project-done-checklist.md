# Project completion checklist

This is an evidence index, not a declaration that owner-only work passed. Run `pnpm project:audit`; it must remain non-zero until pending manual gates are accepted in the Milestone 12 report.

| Criterion | Evidence | State |
| --- | --- | --- |
| A Digital | PDF fixtures, PAdES conformance, independent validation report | Evidence present |
| B Paper | Profile/vectors; final physical corpus | **Blocked: corpus pending** |
| C Browser | browser-print security/architecture and example | **Blocked: real-browser review pending** |
| D Trust | trust bundle/X.509/did:web policy | **Partial: local exact-key trust and policy tests; delivery-surface did:web/X.509 wiring remains open** |
| E Keys | provider contracts, examples, rotation docs | Evidence present at documented mock/reference levels; **real provider acceptance pending** |
| F Lifecycle | status contract and Bitstring Status List fixture | **Partial: status is in-memory and not yet consumed by the verifier** |
| G Interop | TrustVC vectors and tests | **Partial: did:web fixture/tests present; dedicated ECDSA-SD-2023 and Bitstring vector corpus remains open** |
| H Verification | shared result contract and surface tests | **Blocked: final manual UI parity pending** |
| I Self-hosting | Compose/config/docs | **Blocked: clean-host operator run pending** |
| J Enterprise operations | OIDC/audit/observability/retention/deployment docs | **Blocked: operator acceptance pending** |
| K Physical intelligence | Owner explicitly deferred OCR/V3 for this delivery | Accepted deferral; no OCR completion claim |
| L Quality | vectors, benchmark, SBOM/security reports/docs | **Blocked: provenance and corpus owner gates pending** |
| M Developer experience | getting-started happy path | **Blocked: clean-checkout owner journey pending** |
| N Scope discipline | architecture/threat-model review | Evidence present |

## Explicit post-completion backlog

OCR/vision physical intelligence (owner-deferred), native mobile apps, additional SDK languages without adoption, BBS, DataMatrix, qualified-signature integrations, watermarking, hosted billing/control plane, blockchain/transparency logs, and Kubernetes/Helm without adoption remain out of scope. Deferral does not convert an untested capability into a completed one.

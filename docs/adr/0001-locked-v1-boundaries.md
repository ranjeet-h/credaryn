# ADR 0001: Locked V1 trust boundaries

## Status

Accepted for Phase 0.

## Decision

Credaryn V1 uses Node.js 24 LTS, TypeScript 7, pnpm 12 workspaces, QR-only Paper Seal Profile v1, Base45, deterministic CBOR, COSE_Sign1 and ES256. Controlled PDFs are generated through Puppeteer and signed at PAdES Baseline B-B through an isolated European Commission DSS 6.5 adapter.

`@credaryn/core` owns application contracts and normalized verdicts. The DSS adapter exposes only byte-oriented requests and normalized responses; DSS and Java types do not cross into Node packages. Basic cryptographic verification remains possible with local trust material and no mandatory Credaryn-hosted service.

Local development keys are generated only by explicit development tooling and are untrusted outside the demo trust store. Production private keys remain in server-side secure stores, KMS or HSM infrastructure.

## Deliberately deferred

W3C Verifiable Credentials, TrustVC, additional PDF generators, cloud key providers, browser printing, OCR, blockchain, DataMatrix and framework wrappers are later milestones. The Phase 0 DSS container is a classpath and normalized-boundary probe, not the final PAdES signing implementation.

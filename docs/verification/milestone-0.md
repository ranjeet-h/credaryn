# Milestone 0 verification report

## Automated checks

Environment: macOS arm64, Node.js `v24.21.0` via `mise exec node@24.21.0`, pnpm `12.3.3` using the cached pnpm runner. The local Corepack pnpm shim points at a missing `pnpm.cjs`, so the equivalent direct runner was used for the commands below; this does not change the repository lockfile or package scripts.

- `node .../pnpm.mjs install --frozen-lockfile` — passed; one lockfile, four workspace projects.
- `node .../pnpm.mjs lint` — passed; core boundary check covered 5 TypeScript source files.
- `node .../pnpm.mjs typecheck` — passed under Node 24.
- `node .../pnpm.mjs vitest packages/core/test packages/paper/test packages/pdf/test --run` — passed; 3 files, 6 tests.
- `node .../pnpm.mjs coverage` — passed; 4 files, 7 tests. Phase 0 spike coverage was 79.81% statements, 72.3% branches, 90.9% functions and 94.38% lines; the 90% core/paper/verifier target is a later production-package gate, and the spike is intentionally temporary.
- `docker compose -f adapters/pades-dss/docker-compose.yml config` — passed.
- `docker compose -f adapters/pades-dss/docker-compose.yml ps` — DSS container healthy on `127.0.0.1:8080`.
- `./adapters/pades-dss/healthcheck.sh` — passed: `DSS 6.5 boundary is ready`.
- `GET /health` — passed: DSS `6.5`, `padesClassLoaded: true`.
- `POST /v1/probe` with normalized JSON — passed: `status: accepted`, `engine: DSS`, `version: 6.5`, `inputBytes: 116`.
- `node .../pnpm.mjs --filter @credaryn/paper spike` — passed; `verified: true` and payload SHA-256 `98b86f31a820dc17431b531dabfc68232ca61dca9fe4795579c01b4158665d60`.
- `git diff --check` — passed after the Phase 0 edits.

## Manual check

- Started `docker compose -f adapters/pades-dss/docker-compose.yml up -d` and confirmed the container health state is `healthy`.
- Ran the Paper Seal spike with the fixed invoice descriptor in `test-vectors/paper-v1/descriptor.json`.
- Confirmed the emitted payload hash matches the README vector and the spike reports `verified: true`.
- Confirmed the unsigned deterministic CBOR payload bytes are stable for the fixed descriptor. The complete transport may differ between runs because the Phase 0 in-memory OpenSSL ECDSA signer uses a fresh nonce; deterministic signed golden vectors are intentionally deferred to Milestone 2.
- Confirmed the DSS probe returns normalized JSON and no DSS/Java types cross the TypeScript package boundary.
- Inspected the workspace: no committed private-key fixture, cloud credential, frontend bundle or OCR package exists. The only `privateKey` references are in the ephemeral spike runner and its test signer; no private key bytes are serialized or committed.

## Security and scope check

- Core boundary lint passed and contains no DSS, Java, Puppeteer, TrustVC, cloud SDK, OCR or database imports.
- Public signer metadata exposes only issuer/key/algorithm/public-key material; no `privateKey` field is part of the contract.
- The DSS adapter is a probe boundary only. It does not claim final PAdES signing or qualified-signature status.
- UI verification policy is manual only. No Playwright, browser automation, or automated UI-testing runner is used for UI changes; Puppeteer is reserved for later server-side PDF generation.
- V1 scope remains QR-only Paper Seal Profile v1, offline-capable trust resolution, normalized verdicts and isolated DSS 6.5.

## STOP decision

Phase 0 automated gates passed. Phase 0 is complete locally but has not been committed or pushed yet. STOP here and request user verification of the locked interfaces, DSS sidecar boundary, seed vector and execution plan before starting Milestone 1.

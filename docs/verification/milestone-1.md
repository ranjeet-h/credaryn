# Milestone 1 verification report

## Automated checks

Environment: macOS arm64, Node.js `v24.21.0` via `mise`, pnpm `12.3.3` through `npx --yes pnpm@12.3.3`.

- RED evidence: `vitest packages/core/test/descriptor-validation.test.ts --run` initially failed because `validate-descriptor.ts` did not exist.
- `pnpm install --frozen-lockfile` — passed; six workspace projects and one lockfile.
- `pnpm lint` — passed; core boundary check covered 8 TypeScript source files.
- `pnpm typecheck` — passed.
- `pnpm test` — passed; 9 test files and 31 tests.
- `pnpm test:property` — passed; 2 fixed-seed fast-check properties.
- `pnpm --filter @credaryn/node test:smoke` — passed; 1 file and 4 tests.
- `pnpm coverage` — passed; 89.05% statements, 85.12% branches, 97.61% functions and 95.94% lines. Core reached 92.72% statements and Node reached 93.33%; the remaining lower aggregate is the temporary Phase 0 paper spike and local-provider edge branches. No coverage threshold was bypassed.
- `git diff --check` — passed after staging the Phase 1 changes.

## Manual check

- Ran the documented `packages/node` smoke command from `docs/architecture/data-contract.md` with the ephemeral local signer and fake byte-only PDF engine.
- Observed `descriptorValid: true`.
- Observed key metadata containing issuer ID, key ID and `ES256`; `keyHasPrivateKey: false`.
- Observed trust metadata `source: "local-demo-trust-store"` and `developmentOnly: true`.
- Observed the deliberate pre-Phase-2 PDF result `verdict: "UNVERIFIABLE"` and `securityMode: "DIGITAL_ARTIFACT_SIGNED"`.
- Changed `totalMinor` from `1180000` to `8180000`; validation remained successful while the returned claim changed to `8180000`, proving the input was not silently normalized to the old value.
- `find` scan found no `.pem`, `.key`, `.p12` or `.pfx` files outside ignored dependencies. Private-key references are limited to in-memory signer implementations/tests; no private key is serialized in metadata or fixtures.

## Security and scope check

- Descriptor validation rejects unsafe values, nested structures, invalid timestamps, empty identity fields, non-HTTPS production status URLs and URL credentials.
- Trust, cryptographic validity and lifecycle remain separate. `VALID_TRUSTED`, `VALID_UNTRUSTED`, `INVALID` and `UNVERIFIABLE` are tested independently from lifecycle status.
- The local signer is explicitly development-only and exposes public key metadata only.
- `sealPdf()` computes the artifact digest internally and delegates only bytes/normalized requests to the PDF engine.
- Paper creation is explicitly unavailable until Milestone 2; paper verification returns `UNVERIFIABLE` rather than claiming validity.
- No UI was changed and no Playwright, browser automation or automated UI-testing tool was used.

## STOP decision

Phase 1 automated gates and manual checks passed. Phase 1 is complete locally. Commit this phase, then stop and request user verification before implementing Paper Seal Profile encoding in Phase 2.

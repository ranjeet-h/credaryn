# Milestone 2 verification report

## Automated checks

Environment: macOS arm64, Node.js `v24.21.0` via mise, pnpm `12.3.3` through the cached pnpm runner. The repository's Corepack shim points at a missing `pnpm.cjs`, so the equivalent Node 24 pnpm runner was used.

- `pnpm lint` — passed; core boundary check covered 8 TypeScript files.
- `pnpm typecheck` — passed.
- `pnpm test` — passed; 15 test files and 63 tests.
- `pnpm test:property` — passed; 2 fixed-seed fast-check properties.
- `pnpm --filter @credaryn/paper vectors:check` — passed; payload 139 bytes, COSE 229 bytes, transport 349 characters, verdict `VALID_TRUSTED`.
- `pnpm coverage` — passed; 82.77% statements, 75.61% branches, 97.41% functions and 90.18% lines overall. Core reached 93.63% statements; Paper reached 80.27% statements and 70.48% branches, with parser/QR defensive branches remaining for later hardening.
- The Paper round-trip test was run five consecutive times after QR decoder hardening; all five runs passed.
- `git diff --check` — passed.

Golden vector SHA-256 hashes:

- `test-vectors/paper-v1/payload.cbor`: `41ba983eefdf15c4c654e8cffd9568a3f42877a097d4bf7a6fdfdb850fa8bf74`
- `test-vectors/paper-v1/cose-sign1.bin`: `6abcfdbe6f9327e64da8966832d7335f6eade4ef532a38c14ca84cd7e2f401b6`
- `test-vectors/paper-v1/transport.txt`: `4c574f78649d64b6351e94a0e41c14bae29d0345a693cda26aa5acef93145167`
- `test-vectors/paper-v1/qr-512.png`: `8e6627b9f93c4eff1221a05eade166fdf061356486bed069be92f5dedbba9c18`

## Manual check

Environment: local Node 24 CLI; no Playwright, browser automation or automated UI-testing tool was used. The generated QR was visually inspected as a clean black-and-white image with an intact quiet margin and no clipping.

1. Ran `pnpm --filter @credaryn/paper demo:encode`.
2. Ran `pnpm --filter @credaryn/paper demo:verify -- artifacts/paper/invoice-11800.png --trust providers/local/demo-trust-store.json`.
   - Observed `VALID_TRUSTED`.
   - Observed invoice `INV-2026-82919`, `totalMinor: 1180000` (INR 11,800), issuer `acme-retail`, key ID `demo-local-key`, trust source `local-demo-trust-store`, `PAPER_CLAIMS_ONLY`, and `artifactIntegrity: NOT_APPLICABLE`.
3. Re-ran verification with an empty temporary trust directory.
   - Observed `UNVERIFIABLE` while the signed claims remained available.
4. Mutated one Base45 character and re-ran verification with the demo trust store.
   - Observed `INVALID`; it did not upgrade to `VALID_TRUSTED`.

## Security and scope check

- The COSE object is bounded at 1200 bytes; oversized claims fail with `PaperSealSizeError` and are never silently dropped.
- CBOR, Base45, COSE and QR inputs are bounded and fail closed on malformed structures, unsupported algorithms, unknown critical headers and invalid signatures.
- Cryptographic validity, trust, lifecycle and artifact integrity remain separate. Paper verification reports `PAPER_CLAIMS_ONLY` and does not claim PDF-byte integrity.
- The local demo trust material contains public keys only and is ignored by Git. No private key is serialized in vectors, logs or fixtures.
- PDF placement, PAdES signing, lifecycle status and UI surfaces remain out of scope for Milestone 2.

## STOP decision

Phase 2 automated gates and manual CLI/image checks passed. The QR decoder now first uses the exact generated-image path and retains a detector fallback for scanned PNGs. Phase 2 is complete locally; commit this phase and stop for explicit user review before implementing Milestone 3.

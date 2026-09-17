# Milestone 5 verification report

Date: 2026-09-17

## Automated checks

All checks were run on branch `master` with Node `v24.13.1` and pnpm
`12.3.3`. No Playwright, browser automation or automated UI runner was used.

| Check | Result |
| --- | --- |
| `pnpm vitest apps/playground/test/demo-fixture.test.ts apps/playground/test/documentation.test.ts --run` | PASS; 2 files, 5 tests |
| `pnpm vitest adapters/pades-dss/test/dss-engine.integration.test.ts --run` | PASS; 4 tests, including unknown-level invalid normalization |
| `pnpm lint` | PASS; core boundary check passed |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS; 26 files, 97 tests |
| `pnpm docs:check` | PASS; 2 documentation-policy tests |
| `pnpm demo:build` | PASS; generated INR 11,800 fixture, PDF verification `VALID`, Paper Seal `VALID_TRUSTED` |
| `pnpm --filter @credaryn/example-invoice-puppeteer verify:fixtures` | PASS; original `VALID`, mutation `INVALID`, Paper Seal `VALID_TRUSTED` |
| Playground `GET /health` and static page check | PASS on local port 3001 |
| Playground API original verification | PASS; `VALID_TRUSTED`, `DIGITAL_ARTIFACT_SIGNED`, artifact `VALID` |
| Playground API paper verification | PASS; `VALID_TRUSTED`, `PAPER_CLAIMS_ONLY`, `totalMinor: 1180000` |
| Playground API tamper verification | PASS; visible preview INR 81,800, PDF `INVALID`, Paper claim remains INR 11,800 |
| `git diff --check` | PASS |

The generated fixture reported artifact digest:
`sha256:f3a814d65293260f698c02190701afb86b6c49edda9a9314f7ba57400a9c6931`.

## Manual check

**Pending user verification.** Start the DSS sidecar and playground, then use a
real browser at `http://localhost:3000` (or another available local port):

1. Click **Generate and seal invoice** and confirm `INV-2026-82919` and INR
   11,800.00.
2. Click **Verify PDF** and **Verify Paper Seal**. Confirm
   `VALID_TRUSTED`, `VALID`, and `PAPER_CLAIMS_ONLY` are shown in their
   respective evidence cards.
3. Click **Tamper PDF → INR 81,800**, open the tampered preview, and confirm
   the visible amount is INR 81,800.00.
4. Confirm the PDF reports `INVALID` while the Paper Seal still reports
   `VALID_TRUSTED` and INR 11,800.00.

Record screenshots, browser/OS/PDF viewer and observed results here after the
checkpoint. This step is intentionally manual and is not replaced by the
automated API smoke checks above.

## Security and scope check

- The demo trust store is created in memory from the fixture key and is local
  development material only.
- PDF artifact integrity and Paper Seal claims remain separate verification
  surfaces.
- The playground exposes only local fixture generation, verification and the
  visible tamper preview; it adds no cloud credentials, OCR, blockchain, W3C
  VC or framework wrapper.
- The DSS normalizer now accepts an unknown signature level only when DSS has
  already classified both cryptography and artifact integrity as invalid,
  allowing unsigned previews to fail closed instead of becoming a server
  error.

## STOP decision

Milestone 5 implementation and automated gates are complete. The manual browser
checkpoint is still open. Do not release Milestone 6 until the user inspects
the demo and explicitly approves continuation.

# Milestone 6 verification report

Date: 2026-09-17

## Automated checks

All checks were run on branch `master` with Node `v24.13.1` and pnpm
`12.3.3`. No Playwright, browser automation or automated UI runner was used.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS; core boundary check passed |
| `pnpm typecheck` | PASS |
| `pnpm vitest packages/web/test --run` | PASS; 3 files, 6 tests |
| `pnpm bundle:inspect --filter @credaryn/web` | PASS; browser source contains no dynamic code execution, signer/private-key imports or `window.print` monkey patch |
| `pnpm test` | PASS; 30 files, 104 tests |
| `pnpm docs:check` | PASS; 1 documentation-policy file, 2 tests |
| `pnpm format:check` | PASS |
| Browser example `GET /` and module source inspection | PASS; explicit target, local module routes and native print API path are present |
| Browser example `POST /issue-seal` | PASS; returns `CRD1:` QR text, PNG data URL, verification text and `PAPER_CLAIMS_ONLY` |
| GitHub Actions workflow check | PASS; no `.github/workflows` files were added |

The local example uses an ephemeral development-only signer on the server. The
browser receives only the signed Paper Seal transport, a QR data URL and
display-safe verification text.

## Manual browser check — pending owner verification

This checkpoint must be completed in a real browser. Do not use Playwright,
browser automation or another automated UI runner.

1. Run `pnpm --filter @credaryn/example-browser-print dev` and open the URL
   printed by the server.
2. Confirm the invoice contains the explicit `data-credaryn-seal` target and
   no seal is rendered elsewhere before preparation.
3. Click **Prepare print**. Confirm a QR, `INV-2026-82919 · INR 11,800.00`
   and `PAPER_CLAIMS_ONLY` appear inside the marked target.
4. Open native print preview and confirm the invoice and seal remain visible.
5. Stop the example server. Reload the page and click **Prepare and print**.
   Confirm an issuance failure is shown and no print dialog opens.
6. Inspect the browser's served JavaScript and network panel. Confirm no
   private key, raw signing operation or third-party request appears.
7. If available, print to PDF, scan the QR with a phone and verify the claim
   using the existing local Paper Seal verification command.

Record the browser/OS, print-preview result and screenshot here before release:

```text
Manual status: PENDING
Browser/OS: pending
Screenshot: pending
Observed result: pending
```

## STOP decision

Automated implementation gates pass. Milestone 6 is intentionally stopped here
until the owner completes the manual browser checkpoint and explicitly releases
the next phase. No GitHub Actions CI workflow was added.

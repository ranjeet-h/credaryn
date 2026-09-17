# Milestone 4 verification report

Date: 2026-09-17

## Automated checks

All commands were run on branch `master` with Node `v24.13.1` and pnpm
`12.3.3`. No Playwright, browser automation or automated UI runner was used.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS; core boundary check passed |
| `pnpm typecheck` | PASS |
| `pnpm vitest run packages/verifier/test cli/credaryn/test apps/verifier-web/test --run` | PASS; 5 files, 19 tests |
| `pnpm --filter @credaryn/cli test:fixtures` | PASS; 1 file, 3 tests |
| `pnpm test` | PASS; 24 files, 91 tests |
| `pnpm coverage` | PASS; 24 files, 91 tests; repository totals 75.75% statements, 69.09% branches |
| `pnpm --filter @credaryn/paper vectors:check` | PASS; golden Paper Seal verdict `VALID_TRUSTED` |
| `docker build -t credaryn-verifier:phase-4 -f apps/verifier-web/Dockerfile .` | PASS |
| `curl -fsS http://localhost:4173/health` against the built container | PASS; `{ "status": "ready", "service": "credaryn-verifier" }` |
| `git diff --check` | PASS |

The real local DSS sidecar was healthy on `127.0.0.1:8080`. With a temporary
local trust bundle, the actual CLI and HTTP paths returned:

- Original PDF: `VALID_TRUSTED`, `DIGITAL_ARTIFACT_SIGNED`,
  `cryptographicValidity: VALID`, `trustDecision: TRUSTED`,
  `artifactIntegrity: VALID`, `keyId: dss-demo-key`.
- Mutated PDF: `INVALID`, `DIGITAL_ARTIFACT_SIGNED`,
  `cryptographicValidity: INVALID`, `artifactIntegrity: INVALID`.
- Golden CRD1 text: `VALID_TRUSTED`, `PAPER_CLAIMS_ONLY`,
  `cryptographicValidity: VALID`, `trustDecision: TRUSTED`,
  `signedClaims.currency: INR`, `signedClaims.invoiceNumber: INV-2026-82919`,
  `signedClaims.totalMinor: 1180000`.
- The same PDF without trust material: `UNVERIFIABLE`, never trusted.

The temporary trust bundle was written under `/tmp` and removed after the
check. No private key, uploaded document or credential was added to the
repository. `credaryn dev-ca init` was also run with a `/tmp` output and
confirmed `developmentOnly: true` and `local-development-only`.

## Manual check

**Pending user verification.** The implementation is intentionally stopped at
the manual checkpoint. Open the real browser and perform these actions without
any browser automation:

1. Start the local DSS sidecar and run the verifier. For a trusted result,
   mount a local trust bundle whose issuer/key identities match the fixture;
   without that bundle, omit the trust-related options and expect
   `UNVERIFIABLE`:

   ```bash
   docker compose -f adapters/pades-dss/docker-compose.yml up -d
   docker build -t credaryn-verifier:phase-4 -f apps/verifier-web/Dockerfile .
   docker run --rm --name credaryn-verifier-phase-4 \
     --add-host=host.docker.internal:host-gateway \
     -e DSS_URL=http://host.docker.internal:8080 \
     -e CREDARYN_TRUST_STORE=/run/trust/trust-store.json \
     -v "$PWD/trust:/run/trust:ro" \
     -p 4173:4173 credaryn-verifier:phase-4
   ```

2. Open `http://localhost:4173`.
3. Upload `artifacts/invoice-11800/sealed.pdf`; confirm the page keeps PDF
   integrity, issuer trust, lifecycle, security mode and evidence distinct.
4. Paste the CRD1 transport from `test-vectors/paper-v1/transport.txt`; confirm
   the signed INR claims and `PAPER_CLAIMS_ONLY` are shown.
5. Upload `test-vectors/pdf/invoice-11800-mutated.pdf`; confirm the PDF result
   is invalid.
6. Repeat with trust material unavailable; confirm the result says
   `UNVERIFIABLE` or otherwise clearly not trusted, never “authentic”.
7. Compare the displayed results with the CLI JSON from:

   ```bash
   pnpm credaryn verify artifacts/invoice-11800/sealed.pdf --trust ./trust
   pnpm credaryn paper inspect test-vectors/paper-v1/transport.txt --trust ./trust
   ```

Record screenshots and observations here after completing the checkpoint.

## Security and scope check

- Trust, cryptographic validity, artifact integrity, signed claims, lifecycle
  and security mode remain separate fields.
- Input limits and content-type/magic-byte agreement are checked before deep
  parsing.
- The web app uses no-store caching, a self-only CSP and security MIME headers.
- The static UI does not use `authentic` copy for unavailable or untrusted
  trust states.
- The Docker image contains the local verifier only; no Credaryn-hosted
  service is required for verification when trust material is supplied.
- No OCR, lifecycle service, cloud signer, browser-print path, Web Component or
  additional PDF adapter was added in this milestone.

## STOP decision

Milestone 4 implementation and automated gates are complete. This report is
the user-review checkpoint; Milestone 5 must not begin until the user manually
reviews the running UI and explicitly approves continuation.

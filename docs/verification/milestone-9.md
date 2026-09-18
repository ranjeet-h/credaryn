# Milestone 9 verification report

Date: 2026-09-18

Branch: `master`

Environment: Node `v24.13.1`, pnpm `12.3.3`

No GitHub Actions workflow was added. No browser UI automation was used;
Playwright was exercised only as the server-side PDF renderer adapter.

## Automated gates

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS; core boundary check passed for 10 TypeScript files |
| `pnpm typecheck` | PASS |
| `pnpm test` with the DSS sidecar healthy | PASS; 45 files, 144 tests |
| `pnpm interop:vectors:check` | PASS; 1 file, 4 tests |
| `pnpm adapter:fixtures:check` | PASS; 1 file, 2 tests |
| `pnpm vitest run adapters/pades-dss/test packages/pdf/test --run` | PASS; 6 files, 11 tests |
| `pnpm format:check` | PASS |

The full test suite requires the local DSS sidecar because the existing
Puppeteer invoice flow verifies its PAdES fixture through DSS. The sidecar was
started only for that check and was stopped afterward.

## Manual interoperability and adapter verification

### TrustVC W3C credential

Commands:

```bash
pnpm --filter @credaryn/example-w3c-vc issue
pnpm --filter @credaryn/example-w3c-vc verify
```

Result: PASS. The generated credential verified as `VALID`, issuer
`did:web:issuer.example.test`, and cryptosuite `ecdsa-sd-2023`. The generated
directory contains only `credential.json` and `did.json`; a recursive scan
found no private-key, secret, seed, or `privateKey` field. Example output is
written to ignored `artifacts/w3c-vc/`, while public committed fixtures remain
under `test-vectors/w3c/did-web/`.

### PDF generation and PAdES validation

With `docker compose -f adapters/pades-dss/docker-compose.yml up -d` running,
the DSS health endpoint reported version `6.5` and `padesClassLoaded: true`.

| Renderer | Generation | DSS verification | Artifact bytes |
| --- | --- | --- | ---: |
| Puppeteer | PASS; shared `createPdfPipeline` invocation | `VALID`, integrity `VALID` | 213185 |
| PDFKit | PASS | `VALID`, integrity `VALID`, key `dss-demo-key` | 21882 |
| Playwright | PASS; server-side PDF only | `VALID`, integrity `VALID`, key `dss-demo-key` | 99836 |

All three paths use the same render → Paper Seal placement → digest → PAdES
signing order. The PDFKit and Playwright examples use the DSS-configured
identity `acme-retail` / `dss-demo-key`; the DSS client now includes a bounded
error response body when the sidecar rejects a request.

### Mutation detection

For the generated PDFKit and Playwright files, one byte in the first signed
PDF byte range was flipped and both mutations were sent to DSS. Results:

```text
pdfkit      original VALID/VALID   mutated INVALID/INVALID
playwright  original VALID/VALID   mutated INVALID/INVALID
```

The existing Puppeteer fixture check also passed: the original PDF was
`VALID`/`VALID`, the supplied mutated PDF was `INVALID`/`INVALID`, and the
Paper Seal was `VALID_TRUSTED`.

## Evidence hashes

These hashes identify the ignored generated artifacts from the verification
run:

```text
9959b92349f0c7540b0a0749e5e20c9a94c5091f62b3f47eaed4847624b86fba  artifacts/invoice-pdfkit/sealed.pdf
560a6b48584e5584046b6771d1d3e4f12cc89ed99ff3e08b3ad1a7b7818f72ad  artifacts/invoice-playwright/sealed.pdf
12af6eba1d350b8cd471864cc744d8c5cd3ec0566105b6a4a22ab792d2f713e4  artifacts/w3c-vc/credential.json
27c9a5a21b4216e26e46525fe8317b899291bbdfc730037a70a13ea6d304482e  artifacts/w3c-vc/did.json
```

## Adoption and scope decisions

- OpenAttestation is deferred because no customer fixture or adoption evidence
  requires a legacy verification path. The compatibility note limits any
  future work to read-only, fixture-bounded verification.
- React and Next helpers are deferred because there is no real consumer or
  test adoption evidence. No speculative security or trust API was added.
- BBS-2023, DataMatrix, blockchain/TradeTrust, and generic multi-format
  signing remain out of scope.
- OCR/vision remains explicitly out of scope and is not required for this
  milestone.

## Cleanup

Every DSS-backed run used a teardown trap or explicit `docker compose down
--remove-orphans`. After the final run, port `8080` was checked with `lsof` and
was free.

## STOP decision

Milestone 9 implementation and verification are complete. Stop here for owner
review; do not begin Milestone 10 until this report and the interoperability
matrix are approved.

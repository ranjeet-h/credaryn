# Milestone 3 verification: controlled PDF proof

Date: 2026-09-17

## Automated gates

The following checks were run on branch `master` with Node 24.21.0 and pnpm
12.3.3:

| Check | Result |
| --- | --- |
| `docker compose -f adapters/pades-dss/docker-compose.yml config` | PASS |
| `docker compose -f adapters/pades-dss/docker-compose.yml build` | PASS; Maven compiled DSS 6.5 adapter |
| `./adapters/pades-dss/healthcheck.sh` | PASS; `status=ready`, `engine=DSS`, `version=6.5` |
| `pnpm lint` | PASS; core boundary check passed for 8 TypeScript files |
| `pnpm typecheck` | PASS |
| `pnpm vitest run packages/pdf/test adapters/pades-dss/test examples/invoice-puppeteer/test --run` | PASS; 6 files, 10 tests |
| `pnpm --filter @credaryn/example-invoice-puppeteer generate` | PASS; signed PDF, QR and mutation fixtures generated |
| `pnpm --filter @credaryn/example-invoice-puppeteer verify:fixtures` | PASS; original valid, mutation invalid, Paper Seal trusted |
| `pnpm coverage` | PASS; 19 files, 72 tests |
| `git diff --check` | PASS |

The generation command produced unsigned artifact digest:

`sha256:a88596e2fc122264e3138c96a53d670922c24ed403b6050be5d180d62ffcc643`

The committed PDF vector hashes are recorded in
[`test-vectors/pdf/README.md`](../../test-vectors/pdf/README.md):

- original: `0431be4d4d844e9516d9d0ceef84d0adf701a3f550ff2127f20c01635564f380`
- mutated: `457124278a8d05d6abfbdab459638da56aa74de6eb68f2b9763364571a70fc7e`

## DSS results

The normalized fixture verification reported:

```json
{
  "pdfVerification": {
    "cryptographicValidity": "VALID",
    "artifactIntegrity": "VALID",
    "issuerId": "acme-retail",
    "keyId": "dss-demo-key"
  },
  "mutatedVerification": {
    "cryptographicValidity": "INVALID",
    "artifactIntegrity": "INVALID",
    "issuerId": "acme-retail",
    "keyId": "dss-demo-key"
  }
}
```

The raw DSS response for the original fixture additionally reported
`signatureLevel=B-B` and `qualifiedSignature=false`. Content-byte and
metadata-byte mutations were independently sent through DSS and both returned
`cryptographicValidity=INVALID` and `artifactIntegrity=INVALID`.

The Paper Seal response reported `VALID_TRUSTED`, `PAPER_CLAIMS_ONLY`,
invoice number `INV-2026-82919`, currency `INR`, and `totalMinor=1180000`.
The expected-descriptor check reported `INVALID` for the same seal when
presented as a seal for `INV-2026-82920`.

## Manual PDF inspection

- Opened `artifacts/invoice-11800/sealed.pdf` for visual inspection.
- Confirmed one clean page with `INV-2026-82919`, visible `INR 11,800.00`, a
  crisp Paper Seal QR, and human-readable `CRD1:` text.
- Confirmed no clipping, overlap or truncation.
- Inspected `artifacts/invoice-11800/paper-seal.png`; the QR is square, centered,
  crisp and has an intact quiet zone.
- No Playwright, browser automation or automated UI test runner was used.

## STOP

Milestone 3 is locally committed as
`feat: add controlled puppeteer pades pdf flow`. Per the execution plan, stop
here for user review; do not begin Milestone 4 until explicitly approved.

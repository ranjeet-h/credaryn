# PDF renderer adapters

Puppeteer, PDFKit, and Playwright are document-rendering choices only. Each produces `Uint8Array` PDF bytes and then calls the existing `createPdfPipeline`:

```text
render bytes → place Paper Seal → calculate artifact digest → PAdES sign → verify
```

The shared pipeline owns seal-before-sign ordering. The renderer adapters do not sign, verify, access trust stores, or handle private keys. Playwright is used only for server-side PDF generation; it is not a UI test runner in this repository.

Run the adapter contract tests with `pnpm adapter:fixtures:check`. The full DSS-backed examples require the local DSS sidecar:

```bash
docker compose -f adapters/pades-dss/docker-compose.yml up -d
pnpm --filter @credaryn/example-invoice-pdfkit generate
pnpm --filter @credaryn/example-invoice-playwright generate
docker compose -f adapters/pades-dss/docker-compose.yml down
```

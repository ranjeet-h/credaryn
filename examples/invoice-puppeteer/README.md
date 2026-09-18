# Controlled Puppeteer invoice example

This is the reference integration for the controlled PDF workflow. Puppeteer
runs only on the server to materialize the invoice PDF; it is not a UI test
runner. The Paper Seal QR is rendered into the invoice before the resulting
bytes are passed to the DSS 6.5 PAdES Baseline B-B boundary.

After the DSS container is ready, the application flow is intentionally small:

```ts
const fixture = await loadInvoiceFixture();
const pdfEngine = new DssPdfSignatureEngine({ endpoint: DSS_URL });
const pipeline = createPdfPipeline({
  paperSigner: fixture.paperSigner,
  pdfSigner: dssSignerIdentity,
  pdfEngine,
  renderInvoice: (descriptor, seal) => renderInvoicePdf(descriptor, seal.transport),
  placePaperSeal: placePaperSealBeforeSigning,
});
const result = await pipeline.seal(fixture.descriptor);
```

The repository commands generate the controlled PDF and its mutation vector:

```bash
pnpm --filter @credaryn/example-invoice-puppeteer generate
pnpm --filter @credaryn/example-invoice-puppeteer verify:fixtures
pnpm --filter @credaryn/example-invoice-puppeteer mutate
```

Generated local artifacts are written under `artifacts/invoice-11800/` (and
ignored by Git). The committed vectors are under `test-vectors/pdf/`.

The demo signing key is ephemeral and must not be used for production. PAdES
Baseline B-B is not a claim of qualified electronic-signature status.

`test/pades-bt.integration.test.ts` covers the opt-in PAdES Baseline B-T path.
It is skipped unless the DSS sidecar is running *with* `DSS_TSA_URL` set and the
TSA at that URL is reachable from the test host; it never fakes a timestamp.

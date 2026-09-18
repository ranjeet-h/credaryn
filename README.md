Documents are easy to edit. Credaryn makes authentic issuance independently verifiable - from software to paper.

# Credaryn

Credaryn is a standards-first TypeScript/Node proof for signed documents. The
launch demo makes the boundary visible with one controlled invoice:

- the issued total is **INR 11,800**;
- the PDF is a digitally signed PAdES Baseline B-B artifact;
- the Paper Seal carries signed claims independently of the PDF bytes;
- a visible change to **INR 81,800** makes the PDF invalid while the Paper Seal still reports INR 11,800.

## Run the invoice demo

Requirements: Node 24, pnpm 12, and Docker for the local European Commission
DSS 6.5 reference adapter.

```bash
pnpm install --frozen-lockfile
docker compose -f adapters/pades-dss/docker-compose.yml up -d
pnpm demo:start
```

Open <http://localhost:3000> in a real browser. Click **Generate and seal
invoice**, verify the original PDF and Paper Seal, then use **Tamper PDF → INR
81,800**. The UI is a manual demonstration surface; no browser automation is
used to test it.

If port 3000 is already in use, the playground automatically selects the next
available local port and prints the exact URL to open.

For a deterministic fixture build without the playground:

```bash
pnpm demo:build
pnpm --filter @credaryn/example-invoice-puppeteer verify:fixtures
```

The demo signing key is local development material only. PAdES Baseline B-B
does not by itself establish qualified electronic-signature status.

## Optional OCR for scan usability

Credaryn intentionally does **not** include an OCR or vision engine. If your
application accepts photographed or scanned documents, add OCR in your own
web-app or service for text extraction, claim location, and a better review
experience. Keep that layer optional and report its confidence separately from
Credaryn's cryptographic result:

1. Verify the Paper Seal and PDF signature first.
2. Use your chosen OCR service to read visible invoice values and locate them
   in the image or PDF.
3. Compare OCR values with the signed claims and show any mismatch as OCR
   evidence, never as a replacement for cryptographic verification.

Choose a provider that fits your document sizes, print formats, privacy,
retention, and deployment requirements. OCR should not be required for
authenticity, and Credaryn does not send document content to an OCR provider.

## Integration shape

After infrastructure setup, the core invoice flow remains intentionally small:

```ts
const fixture = await loadInvoiceFixture();
const result = await createPdfPipeline({
  paperSigner: fixture.paperSigner,
  pdfSigner: dssSignerIdentity,
  pdfEngine: new DssPdfSignatureEngine({ endpoint: DSS_URL }),
  renderInvoice: (descriptor, seal) => renderInvoicePdf(descriptor, seal.transport),
  placePaperSeal: placePaperSealBeforeSigning,
}).seal(fixture.descriptor);
```

Read [Getting started](docs/getting-started.md) for the reproducible setup,
[the demo script](docs/demo/invoice-tamper-demo.md) for the story, and
[claims versus artifact integrity](docs/security/claims-vs-artifact.md) for the
security boundary.

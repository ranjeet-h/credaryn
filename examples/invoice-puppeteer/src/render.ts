import type { DocumentDescriptor } from "@credaryn/core";
import { renderPaperSealQr } from "@credaryn/paper";
import puppeteer from "puppeteer";

const DEFAULT_QR_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3C/svg%3E";

export function renderInvoiceHtml(
  descriptor: DocumentDescriptor,
  paperSealTransport: string,
  paperSealQrDataUrl = DEFAULT_QR_PLACEHOLDER,
): string {
  const invoiceNumber = claimString(descriptor, "invoiceNumber", descriptor.documentId);
  const currency = claimString(descriptor, "currency", "INR");
  const totalMinor = claimInteger(descriptor, "totalMinor", 0);
  const paid = descriptor.claims.paid === true ? "Paid" : "Payment due on receipt";
  const displayTotal = formatMinorAmount(currency, totalMinor);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(invoiceNumber)} · Credaryn invoice</title>
    <style>
      @page { size: A4; margin: 16mm; }
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; background: #fff; }
      * { box-sizing: border-box; }
      body { margin: 0; font-size: 12px; line-height: 1.45; }
      .invoice { min-height: 265mm; display: flex; flex-direction: column; }
      .masthead { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 28px; border-bottom: 2px solid #172033; }
      .brand { font-size: 24px; font-weight: 800; letter-spacing: -.04em; }
      .eyebrow { margin: 0 0 4px; color: #5b6880; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 26px; letter-spacing: -.04em; }
      .meta { text-align: right; color: #5b6880; }
      .meta strong { display: block; color: #172033; font-size: 13px; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 28px 0; }
      .party p { margin: 0; }
      .party .name { margin-bottom: 4px; color: #172033; font-size: 14px; font-weight: 750; }
      .party .address { color: #5b6880; }
      table { width: 100%; border-collapse: collapse; }
      th { padding: 9px 0; border-top: 1px solid #c9d0db; border-bottom: 1px solid #c9d0db; color: #5b6880; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: .08em; }
      td { padding: 14px 0; border-bottom: 1px solid #e3e7ed; }
      th:last-child, td:last-child { text-align: right; }
      .summary { display: flex; justify-content: flex-end; padding: 22px 0 30px; }
      .total { display: grid; grid-template-columns: auto auto; gap: 8px 28px; min-width: 230px; }
      .total dt { color: #5b6880; }
      .total dd { margin: 0; text-align: right; }
      .total .grand { padding-top: 8px; border-top: 2px solid #172033; font-size: 17px; font-weight: 800; }
      .seal { display: flex; align-items: center; gap: 22px; margin-top: auto; padding: 18px; border: 1px solid #9ca9bc; border-radius: 12px; background: #f4f7fb; }
      .seal img { width: 124px; height: 124px; image-rendering: pixelated; }
      .seal h2 { margin: 0 0 5px; font-size: 14px; }
      .seal p { margin: 0 0 8px; color: #5b6880; }
      .seal code { display: block; overflow: hidden; max-width: 500px; color: #172033; font-size: 8px; line-height: 1.25; word-break: break-all; }
      .footer { margin-top: 18px; color: #5b6880; font-size: 9px; }
    </style>
  </head>
  <body>
    <main class="invoice">
      <header class="masthead">
        <div><p class="eyebrow">Issued by</p><div class="brand">Acme Retail</div></div>
        <div class="meta"><p class="eyebrow">Tax invoice</p><h1>${escapeHtml(invoiceNumber)}</h1><strong>${escapeHtml(descriptor.issuedAt.slice(0, 10))}</strong></div>
      </header>
      <section class="parties">
        <div class="party"><p class="eyebrow">From</p><p class="name">Acme Retail Pvt. Ltd.</p><p class="address">14 Residency Road<br>Bengaluru 560025</p></div>
        <div class="party"><p class="eyebrow">Bill to</p><p class="name">Credaryn Demo Customer</p><p class="address">1 Verification Lane<br>Bengaluru 560001</p></div>
      </section>
      <table aria-label="Invoice line items">
        <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Enterprise verification subscription</td><td>1</td><td>${formatMinorAmount(currency, 1000000)}</td></tr>
          <tr><td>Paper Seal Profile setup</td><td>1</td><td>${formatMinorAmount(currency, 180000)}</td></tr>
        </tbody>
      </table>
      <section class="summary"><dl class="total"><dt>Status</dt><dd>${escapeHtml(paid)}</dd><dt class="grand">Total</dt><dd class="grand" data-visible-total="${escapeHtml(displayTotal)}">${escapeHtml(displayTotal)}</dd></dl></section>
      <section class="seal" data-credaryn-paper-seal="CRD1:" data-credaryn-paper-seal-transport="${escapeHtml(paperSealTransport)}">
        <img src="${escapeHtml(paperSealQrDataUrl)}" alt="Credaryn Paper Seal QR Code">
        <div><h2>Verify this invoice independently</h2><p>Scan the Paper Seal to verify the signed invoice number and total without the source PDF.</p><code>${escapeHtml(paperSealTransport)}</code></div>
      </section>
      <p class="footer">Paper claims and digital artifact integrity are separate verification signals.</p>
    </main>
  </body>
</html>`;
}

export async function renderInvoicePdf(
  descriptor: DocumentDescriptor,
  paperSealTransport: string,
): Promise<Uint8Array> {
  const qrBytes = await renderPaperSealQr(paperSealTransport, { width: 512, margin: 4 });
  const qrDataUrl = `data:image/png;base64,${Buffer.from(qrBytes).toString("base64")}`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(renderInvoiceHtml(descriptor, paperSealTransport, qrDataUrl), { waitUntil: "load" });
    return new Uint8Array(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}

function claimString(descriptor: DocumentDescriptor, key: string, fallback: string): string {
  const value = descriptor.claims[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function claimInteger(descriptor: DocumentDescriptor, key: string, fallback: number): number {
  const value = descriptor.claims[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function formatMinorAmount(currency: string, minor: number): string {
  return `${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

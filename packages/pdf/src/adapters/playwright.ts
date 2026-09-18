import type { DocumentDescriptor } from "@credaryn/core";

export interface PlaywrightPage {
  setContent(html: string, options?: { readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<void>;
  pdf(options?: Record<string, unknown>): Promise<Uint8Array | Buffer>;
}

export interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

export interface PlaywrightRendererOptions {
  readonly createBrowser: () => Promise<PlaywrightBrowser>;
}

export function createPlaywrightInvoiceRenderer(options: PlaywrightRendererOptions) {
  return async (descriptor: DocumentDescriptor, paperSealTransport: string): Promise<Uint8Array> => {
    const browser = await options.createBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(renderInvoiceHtml(descriptor, paperSealTransport), { waitUntil: "load" });
      return new Uint8Array(await page.pdf({ format: "A4", printBackground: true }));
    } finally {
      await browser.close();
    }
  };
}

export function renderInvoiceHtml(descriptor: DocumentDescriptor, paperSealTransport: string): string {
  const currency = typeof descriptor.claims.currency === "string" ? descriptor.claims.currency : "INR";
  const totalMinor = typeof descriptor.claims.totalMinor === "number" ? descriptor.claims.totalMinor : 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(descriptor.documentId)}</title><style>body{font-family:system-ui;padding:48px}main{border:1px solid #c9d0db;padding:32px}code{display:block;word-break:break-all;font-size:8px}</style></head><body><main><h1>Acme Retail</h1><h2>Invoice ${escapeHtml(descriptor.documentId)}</h2><p>Issued ${escapeHtml(descriptor.issuedAt)}</p><p>Total ${escapeHtml(currency)} ${escapeHtml(String(totalMinor))}</p><h3>Credaryn Paper Seal</h3><code>${escapeHtml(paperSealTransport)}</code></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

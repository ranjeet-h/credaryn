import PDFDocument from "pdfkit";
import type { DocumentDescriptor } from "@credaryn/core";

export interface PdfKitRendererOptions {
  readonly title?: string;
}

export function createPdfKitInvoiceRenderer(options: PdfKitRendererOptions = {}) {
  return async (descriptor: DocumentDescriptor, paperSealTransport: string): Promise<Uint8Array> => {
    const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: options.title ?? descriptor.documentId } });
    const chunks: Buffer[] = [];
    return new Promise<Uint8Array>((resolve, reject) => {
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("error", reject);
      document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      document.fontSize(24).text("Acme Retail", { continued: false });
      document.moveDown().fontSize(18).text(`Invoice ${descriptor.documentId}`);
      document.fontSize(12).text(`Issued ${descriptor.issuedAt}`);
      document.moveDown().text(`Total ${String(descriptor.claims.currency ?? "INR")} ${String(descriptor.claims.totalMinor ?? 0)}`);
      document.moveDown(2).fontSize(10).text("Credaryn Paper Seal");
      document.fontSize(7).text(paperSealTransport, { width: 500 });
      document.end();
    });
  };
}

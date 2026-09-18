import { describe, expect, it } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";
import type { DocumentDescriptor, SignerProvider } from "@credaryn/core";
import { createPdfPipeline, type PdfSignatureEngine } from "../src/index.js";
import { createPdfKitInvoiceRenderer } from "../src/adapters/pdfkit.js";
import { createPlaywrightInvoiceRenderer, type PlaywrightBrowser } from "../src/adapters/playwright.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const signer: SignerProvider = {
  getKeyInfo: async () => ({ issuerId: descriptor.issuerId, keyId: "adapter-test", algorithm: "ES256", publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })) }),
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(privateKey));
  },
};

function testEngine(calls: string[]): PdfSignatureEngine {
  return {
    sign: async (input) => {
      calls.push("sign");
      return new Uint8Array([...input, 1]);
    },
    verify: async (input) => ({
      cryptographicValidity: input.at(-1) === 1 ? "VALID" : "INVALID",
      artifactIntegrity: input.at(-1) === 1 ? "VALID" : "INVALID",
      issuerId: descriptor.issuerId,
      keyId: "adapter-test",
    }),
  };
}

async function runAdapter(renderInvoice: (descriptor: DocumentDescriptor, transport: string) => Promise<Uint8Array>, calls: string[]) {
  const pipeline = createPdfPipeline({
    paperSigner: signer,
    pdfEngine: testEngine(calls),
    renderInvoice: async (descriptor, paperSeal) => {
      calls.push("render");
      return renderInvoice(descriptor, paperSeal.transport);
    },
    placePaperSeal: async (pdfBytes, transport) => {
      calls.push(`place:${transport.startsWith("CRD1:")}`);
      return new Uint8Array([...pdfBytes, 2]);
    },
  });
  return pipeline.seal(descriptor);
}

describe("PDF document adapters", () => {
  it("renders PDFKit output and converges on seal-before-sign ordering", async () => {
    const calls: string[] = [];
    const result = await runAdapter(createPdfKitInvoiceRenderer(), calls);

    expect(result.unsignedPdf.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(calls).toEqual(["render", "place:true", "sign"]);
  });

  it("renders through a Playwright-compatible page boundary without a UI test runner", async () => {
    const calls: string[] = [];
    const browser: PlaywrightBrowser = {
      newPage: async () => ({
        setContent: async (html) => {
          calls.push(html.includes("INV-2026-82919") ? "set-content" : "bad-content");
        },
        pdf: async () => {
          calls.push("pdf");
          return new TextEncoder().encode("%PDF-1.7\nfixture");
        },
      }),
      close: async () => {
        calls.push("close");
      },
    };
    const result = await runAdapter(createPlaywrightInvoiceRenderer({ createBrowser: async () => browser }), calls);

    expect(result.unsignedPdf.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(calls).toEqual(["render", "set-content", "pdf", "close", "place:true", "sign"]);
  });
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider } from "@credaryn/core";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { createPdfKitInvoiceRenderer, createPdfPipeline } from "@credaryn/pdf";
import { LocalSigner } from "@credaryn/provider-local";

const outputUrl = new URL("../../../artifacts/invoice-pdfkit/", import.meta.url);
const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

export async function generate(): Promise<void> {
  const paperSigner = new LocalSigner({ issuerId: descriptor.issuerId, keyId: "pdfkit-paper-key" });
  const result = await createPdfPipeline({
    paperSigner,
    pdfSigner: dssSigner(),
    pdfEngine: new DssPdfSignatureEngine({ endpoint: process.env.DSS_URL ?? "http://127.0.0.1:8080" }),
    renderInvoice: async (input, paperSeal) => createPdfKitInvoiceRenderer()(input, paperSeal.transport),
    placePaperSeal: async (pdfBytes, transport) => placeSeal(pdfBytes, transport),
  }).seal(descriptor);
  await mkdir(fileURLToPath(outputUrl), { recursive: true });
  await writeFile(new URL("sealed.pdf", outputUrl), result.signedPdf);
  await writeFile(new URL("paper-seal.txt", outputUrl), result.paperSeal.transport, "utf8");
  await writeFile(new URL("artifact-digest.txt", outputUrl), `${result.artifactDigest}\n`, "utf8");
  console.log(JSON.stringify({ artifactDigest: result.artifactDigest, bytes: result.signedPdf.byteLength }, null, 2));
}

export async function verify(): Promise<void> {
  const pdf = new Uint8Array(await readFile(new URL("sealed.pdf", outputUrl)));
  const result = await new DssPdfSignatureEngine({ endpoint: process.env.DSS_URL ?? "http://127.0.0.1:8080" }).verify(pdf, { trustStore: { resolve: async () => undefined } });
  console.log(JSON.stringify(result, null, 2));
  if (result.artifactIntegrity !== "VALID") process.exitCode = 1;
}

function dssSigner(): SignerProvider {
  const keyInfo: SignerKeyInfo = { issuerId: descriptor.issuerId, keyId: "dss-demo-key", algorithm: "ES256", publicKey: new Uint8Array() };
  return { getKeyInfo: async () => keyInfo, sign: async () => { throw new Error("DSS owns the PDF private key"); } };
}

function placeSeal(pdfBytes: Uint8Array, transport: string): Uint8Array {
  if (pdfBytes[0] !== 0x25 || pdfBytes[1] !== 0x50 || pdfBytes[2] !== 0x44 || pdfBytes[3] !== 0x46) throw new Error("PDFKit renderer did not produce a PDF");
  if (!transport.startsWith("CRD1:")) throw new Error("Paper Seal transport is invalid");
  return new Uint8Array(pdfBytes);
}

if (process.argv[2] === "generate") await generate();
else if (process.argv[2] === "verify") await verify();
else throw new Error("Usage: seal.ts <generate|verify>");

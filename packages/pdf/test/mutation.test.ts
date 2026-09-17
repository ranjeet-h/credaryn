import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerProvider } from "@credaryn/core";
import type { PdfSignatureEngine } from "../src/engine.js";
import { createPdfPipeline } from "../src/pipeline.js";
import { isArtifactIntegrityValid } from "../src/verify.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const signer: SignerProvider = {
  getKeyInfo: async () => ({
    issuerId: descriptor.issuerId,
    keyId: "phase-3-mutation-test",
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  }),
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(privateKey));
  },
};

describe("PDF artifact mutation boundary", () => {
  it("detects a changed post-signing byte from the digest bound at signing time", async () => {
    let signedDigest = "";
    const engine: PdfSignatureEngine = {
      sign: async (input, request) => {
        signedDigest = request.artifactDigest;
        return new Uint8Array([...input, 0x53]);
      },
      verify: async (input) => ({
        cryptographicValidity: digest(input) === signedDigest ? "VALID" : "INVALID",
        artifactIntegrity: digest(input) === signedDigest ? "VALID" : "INVALID",
      }),
    };
    const pipeline = createPdfPipeline({
      paperSigner: signer,
      pdfEngine: engine,
      renderInvoice: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]),
      placePaperSeal: async (input) => input,
    });

    const result = await pipeline.seal(descriptor);
    const original = await engine.verify(result.unsignedPdf, { trustStore: { resolve: async () => undefined } });
    const mutatedBytes = new Uint8Array(result.unsignedPdf);
    mutatedBytes[mutatedBytes.length - 1] = mutatedBytes[mutatedBytes.length - 1]! ^ 0x01;
    const mutated = await engine.verify(mutatedBytes, { trustStore: { resolve: async () => undefined } });

    expect(isArtifactIntegrityValid(original)).toBe(true);
    expect(isArtifactIntegrityValid(mutated)).toBe(false);
  });
});

function digest(input: Uint8Array): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

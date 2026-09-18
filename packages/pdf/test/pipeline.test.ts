import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider } from "@credaryn/core";
import { decodePaperSeal } from "@credaryn/paper";
import type { PdfSignatureEngine } from "../src/engine.js";
import { createPdfPipeline } from "../src/pipeline.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keyInfo: SignerKeyInfo = {
  issuerId: descriptor.issuerId,
  keyId: "phase-3-test",
  algorithm: "ES256",
  publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
};

const signer: SignerProvider = {
  getKeyInfo: async () => keyInfo,
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(privateKey));
  },
};

describe("controlled PDF pipeline", () => {
  it("places the paper seal before computing the artifact digest and signing", async () => {
    const calls: string[] = [];
    const pdfEngine: PdfSignatureEngine = {
      sign: async (input, request) => {
        calls.push(`sign:${request.level}:${request.artifactDigest.startsWith("sha256:")}`);
        return new Uint8Array([...input, 3]);
      },
      verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
    };
    const pipeline = createPdfPipeline({
      paperSigner: signer,
      pdfEngine,
      renderInvoice: async () => {
        calls.push("render");
        return new Uint8Array([1]);
      },
      placePaperSeal: async (input, transport) => {
        calls.push(`place:${transport.startsWith("CRD1:")}`);
        return new Uint8Array([...input, 2]);
      },
    });

    const result = await pipeline.seal(descriptor);

    expect(calls).toEqual(["render", "place:true", "sign:B-B:true"]);
    expect(result.unsignedPdf).toEqual(new Uint8Array([1, 2]));
    expect(result.signedPdf).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // No caller-supplied link: the circular self-digest is never fabricated.
    expect(decodePaperSeal(result.paperSeal.transport).profile.artifactDigest).toBeUndefined();
  });

  it("embeds a caller-supplied linked artifact digest in the Paper Seal payload", async () => {
    const linkedArtifactDigest = `sha256:${"b".repeat(64)}`;
    const pdfEngine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
    };
    const pipeline = createPdfPipeline({
      paperSigner: signer,
      pdfEngine,
      linkedArtifactDigest,
      renderInvoice: async () => new Uint8Array([1]),
      placePaperSeal: async (input) => input,
    });

    const result = await pipeline.seal(descriptor);

    // The caller's reference digest must land in the signed payload before placement.
    expect(decodePaperSeal(result.paperSeal.transport).profile.artifactDigest).toBe(linkedArtifactDigest);
    expect(decodePaperSeal(result.paperSeal.transport).payload).toEqual(result.paperSeal.payload);
  });
});

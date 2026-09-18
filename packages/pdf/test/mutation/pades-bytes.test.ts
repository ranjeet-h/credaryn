import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerProvider, TrustStore } from "@credaryn/core";
import type { PdfSignatureEngine } from "../../src/engine.js";
import { createPdfPipeline } from "../../src/pipeline.js";
import { isArtifactIntegrityValid } from "../../src/verify.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { totalMinor: 1_180_000 },
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const signer: SignerProvider = {
  getKeyInfo: async () => ({
    issuerId: descriptor.issuerId,
    keyId: "phase-10-pdf-mutation",
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  }),
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(privateKey));
  },
};

const trustStore: TrustStore = { resolve: async () => undefined };

describe("PAdES artifact mutation boundary", () => {
  it("rejects a changed post-signing PDF byte in the signed artifact", async () => {
    let signedArtifact: Uint8Array | undefined;
    const engine: PdfSignatureEngine = {
      sign: async (input) => {
        signedArtifact = new Uint8Array([...input, 0x53]);
        return signedArtifact;
      },
      verify: async (input) => {
        const valid = signedArtifact !== undefined
          && Buffer.compare(Buffer.from(input), Buffer.from(signedArtifact)) === 0;
        return { cryptographicValidity: valid ? "VALID" : "INVALID", artifactIntegrity: valid ? "VALID" : "INVALID" };
      },
    };
    const result = await createPdfPipeline({
      paperSigner: signer,
      pdfEngine: engine,
      renderInvoice: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]),
      placePaperSeal: async (input) => input,
    }).seal(descriptor);

    expect(result.signedPdf).not.toEqual(result.unsignedPdf);
    const mutated = new Uint8Array(result.signedPdf);
    mutated[mutated.length - 1] = mutated[mutated.length - 1]! ^ 0x01;

    await expect(engine.verify(result.signedPdf, { trustStore })).resolves.toSatisfy(isArtifactIntegrityValid);
    // The unsigned pre-signing artifact is not what a verifier receives and must not validate.
    await expect(engine.verify(result.unsignedPdf, { trustStore })).resolves.not.toSatisfy(isArtifactIntegrityValid);
    await expect(engine.verify(mutated, { trustStore })).resolves.not.toSatisfy(isArtifactIntegrityValid);
  });
});

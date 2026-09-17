import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor } from "../../core/src/document.js";
import type { SignerKeyInfo, SignerProvider } from "../../core/src/signer.js";
import type { TrustStore } from "../../core/src/trust.js";
import { createSpikePaperSeal, verifySpikePaperSeal } from "../src/spike.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: {
    currency: "INR",
    invoiceNumber: "INV-2026-82919",
    totalMinor: 1_180_000,
  },
};

function createSpikeSigner(): { signer: SignerProvider; keyInfo: SignerKeyInfo } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: descriptor.issuerId,
    keyId: "phase-0-ephemeral",
    algorithm: "ES256",
    publicKey: publicKey.export({ type: "spki", format: "der" }),
  };
  return {
    keyInfo,
    signer: {
      getKeyInfo: async () => keyInfo,
      sign: async (input) => {
        const signer = createSign("SHA256");
        signer.update(input);
        return signer.sign(privateKey);
      },
    },
  };
}

describe("Phase 0 paper standards spike", () => {
  it("creates deterministic CRD1 payload bytes and verifies an ES256 COSE proof", async () => {
    const first = createSpikeSigner();
    const second = createSpikeSigner();
    const firstSeal = await createSpikePaperSeal(descriptor, first.signer);
    const secondSeal = await createSpikePaperSeal(descriptor, second.signer);
    const trustStore: TrustStore = {
      resolve: async () => first.keyInfo,
    };

    expect(firstSeal.transport.startsWith("CRD1:")).toBe(true);
    expect(firstSeal.payloadHash).toBe(secondSeal.payloadHash);
    expect(firstSeal.payloadHash).toBe("98b86f31a820dc17431b531dabfc68232ca61dca9fe4795579c01b4158665d60");
    await expect(verifySpikePaperSeal(firstSeal.transport, trustStore)).resolves.toBe(true);
    expect(createHash("sha256").update(firstSeal.payload).digest("hex")).toBe(firstSeal.payloadHash);
  });

  it("rejects an altered transport byte", async () => {
    const { signer } = createSpikeSigner();
    const seal = await createSpikePaperSeal(descriptor, signer);
    const altered = `${seal.transport.slice(0, -1)}${seal.transport.endsWith("0") ? "1" : "0"}`;
    const trustStore: TrustStore = { resolve: async () => undefined };

    await expect(verifySpikePaperSeal(altered, trustStore)).resolves.toBe(false);
  });
});

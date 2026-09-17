import { createSign, generateKeyPairSync } from "node:crypto";
import { createSpikePaperSeal, verifySpikePaperSeal } from "./spike.js";
import type { DocumentDescriptor } from "../../core/src/document.js";
import type { SignerKeyInfo, SignerProvider } from "../../core/src/signer.js";
import type { TrustStore } from "../../core/src/trust.js";

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

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keyInfo: SignerKeyInfo = {
  issuerId: descriptor.issuerId,
  keyId: "phase-0-ephemeral",
  algorithm: "ES256",
  publicKey: publicKey.export({ type: "spki", format: "der" }),
};
const signer: SignerProvider = {
  getKeyInfo: async () => keyInfo,
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return operation.sign(privateKey);
  },
};
const trustStore: TrustStore = { resolve: async () => keyInfo };
const seal = await createSpikePaperSeal(descriptor, signer);
const verified = await verifySpikePaperSeal(seal.transport, trustStore);

console.log(JSON.stringify({
  payloadHash: seal.payloadHash,
  payloadHex: Buffer.from(seal.payload).toString("hex"),
  transport: seal.transport,
  verified,
}));

import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerProvider, TrustStore } from "@credaryn/core";
import {
  decodeDeterministicCbor,
  decodePaperSeal,
  encodeBase45,
  encodeCoseSign1Parts,
  encodeDeterministicCbor,
  encodePaperSeal,
  verifyPaperSeal,
} from "../../src/index.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

function createSigner(): { signer: SignerProvider; trustStore: TrustStore } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo = {
    issuerId: descriptor.issuerId,
    keyId: "phase-10-mutation",
    algorithm: "ES256" as const,
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
  return { signer, trustStore: { resolve: async () => keyInfo, isTrusted: async () => true } };
}

describe("Paper Seal mutation boundaries", () => {
  it.each(["issuerId", "documentId", "claims", "keyId"] as const)("rejects a changed signed %s", async (field) => {
    const { signer, trustStore } = createSigner();
    const seal = await encodePaperSeal(descriptor, signer);
    const decoded = decodePaperSeal(seal.transport);
    const payload = decodeDeterministicCbor(decoded.payload);
    if (!(payload instanceof Map)) throw new Error("test payload must be a CBOR map");

    let mutatedParts = decoded.coseParts;
    if (field === "keyId") {
      mutatedParts = {
        ...decoded.coseParts,
        protectedHeaders: new Map([...decoded.coseParts.protectedHeaders, [4, new TextEncoder().encode("different-key")]]),
      };
    } else {
      const nextPayload = new Map(payload);
      if (field === "issuerId") nextPayload.set(2, "different-issuer");
      if (field === "documentId") nextPayload.set(4, "different-document");
      if (field === "claims") nextPayload.set(7, new Map([["totalMinor", 81_800]]));
      mutatedParts = { ...decoded.coseParts, payload: encodeDeterministicCbor(nextPayload) };
    }

    const mutatedTransport = `CRD1:${encodeBase45(encodeCoseSign1Parts(mutatedParts))}`;
    await expect(verifyPaperSeal(mutatedTransport, { trustStore })).resolves.toMatchObject({
      verdict: "INVALID",
      cryptographicValidity: "INVALID",
    });
  });
});

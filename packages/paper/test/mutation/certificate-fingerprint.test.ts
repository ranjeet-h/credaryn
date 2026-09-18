import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
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

const SIGNED_FINGERPRINT = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

interface TestSigner {
  signer: SignerProvider;
  keyInfo: SignerKeyInfo;
  trustStore: TrustStore;
}

function createSigner(certificateFingerprint = SIGNED_FINGERPRINT): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: descriptor.issuerId,
    keyId: "fingerprint-mutation",
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
    certificateFingerprint,
  };
  const signer: SignerProvider = {
    getKeyInfo: async () => keyInfo,
    sign: async (input) => {
      const operation = createSign("SHA256");
      operation.update(input);
      return new Uint8Array(operation.sign(privateKey));
    },
  };
  return {
    signer,
    keyInfo,
    trustStore: { resolve: async () => keyInfo, isTrusted: async () => true },
  };
}

describe("Paper Seal certificate-fingerprint mutation boundaries", () => {
  it("trusts a seal whose signed fingerprint matches the trusted key (control)", async () => {
    const { signer, trustStore } = createSigner();
    const seal = await encodePaperSeal(descriptor, signer);

    await expect(verifyPaperSeal(seal.transport, { trustStore })).resolves.toMatchObject({
      verdict: "VALID_TRUSTED",
    });
  });

  it("rejects a signed certificate fingerprint that was changed in the payload", async () => {
    const { signer, trustStore } = createSigner();
    const seal = await encodePaperSeal(descriptor, signer);
    const decoded = decodePaperSeal(seal.transport);
    const payload = decodeDeterministicCbor(decoded.payload);
    if (!(payload instanceof Map)) throw new Error("test payload must be a CBOR map");

    const nextPayload = new Map(payload);
    nextPayload.set(10, "sha256:2222222222222222222222222222222222222222222222222222222222222222");
    const mutatedTransport = `CRD1:${encodeBase45(encodeCoseSign1Parts({
      ...decoded.coseParts,
      payload: encodeDeterministicCbor(nextPayload),
    }))}`;

    const result = await verifyPaperSeal(mutatedTransport, { trustStore });
    expect(result.verdict).not.toBe("VALID_TRUSTED");
    expect(result.verdict).toBe("INVALID");
  });

  it("rejects a payload whose signed fingerprint does not match the trusted signing key", async () => {
    const { signer, keyInfo } = createSigner(SIGNED_FINGERPRINT);
    const seal = await encodePaperSeal(descriptor, signer);
    const swappedFingerprint = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
    const mismatchedTrustStore: TrustStore = {
      resolve: async () => ({ ...keyInfo, certificateFingerprint: swappedFingerprint }),
      isTrusted: async () => true,
    };

    const result = await verifyPaperSeal(seal.transport, { trustStore: mismatchedTrustStore });
    expect(result.verdict).not.toBe("VALID_TRUSTED");
    expect(result.verdict).toBe("INVALID");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ code: "PAPER_CERTIFICATE_FINGERPRINT_MISMATCH" }),
    );
  });
});

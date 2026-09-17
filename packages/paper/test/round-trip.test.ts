import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import {
  decodePaperSealQr,
  encodePaperSeal,
  renderPaperSealQr,
  verifyPaperSeal,
} from "../src/index.js";

function createSigner(): { signer: SignerProvider; keyInfo: SignerKeyInfo } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: "acme-retail",
    keyId: "phase-2-test",
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  };
  return {
    keyInfo,
    signer: {
      getKeyInfo: async () => keyInfo,
      sign: async (input) => {
        const operation = createSign("SHA256");
        operation.update(input);
        return new Uint8Array(operation.sign(privateKey));
      },
    },
  };
}

const descriptors: Record<string, DocumentDescriptor> = {
  small: {
    issuerId: "acme-retail",
    documentId: "INV-2026-82919",
    documentType: "invoice",
    issuedAt: "2026-01-01T00:00:00Z",
    claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
  },
  medium: {
    issuerId: "acme-retail",
    documentId: "INV-2026-82920",
    documentType: "invoice",
    issuedAt: "2026-01-01T00:00:00Z",
    claims: {
      currency: "INR",
      invoiceNumber: "INV-2026-82920",
      totalMinor: 81_800_000,
      customerReference: "CUSTOMER-REFERENCE-2026",
      paid: false,
    },
  },
  "near-limit": {
    issuerId: "acme-retail",
    documentId: "INV-2026-82921",
    documentType: "invoice",
    issuedAt: "2026-01-01T00:00:00Z",
    claims: {
      currency: "INR",
      invoiceNumber: "INV-2026-82921",
      totalMinor: 1_180_000,
      reconciliationReference: "R".repeat(820),
    },
  },
};

describe("Paper Seal Profile v1 round trips", () => {
  it.each([
    ["small", 256],
    ["medium", 384],
    ["near-limit", 512],
  ] as const)("encodes, renders, decodes and verifies the %s payload at %spx", async (name, width) => {
    const { signer, keyInfo } = createSigner();
    const encoded = await encodePaperSeal(descriptors[name]!, signer);
    const image = await renderPaperSealQr(encoded.transport, { width });
    const decoded = decodePaperSealQr(image);
    const trustStore: TrustStore = {
      resolve: async (keyId, issuerId) => keyId === keyInfo.keyId && issuerId === keyInfo.issuerId ? keyInfo : undefined,
    };
    const result = await verifyPaperSeal(decoded, { trustStore });

    expect(decoded).toBe(encoded.transport);
    expect(result).toMatchObject({
      verdict: "VALID_TRUSTED",
      issuerId: "acme-retail",
      keyId: "phase-2-test",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      signedClaims: descriptors[name]!.claims,
    });
  });

  it("returns valid-untrusted without a matching key while retaining cryptographic claims", async () => {
    const { signer, keyInfo } = createSigner();
    const encoded = await encodePaperSeal(descriptors.small!, signer);

    const result = await verifyPaperSeal(encoded.transport, {
      trustStore: {
        resolve: async () => keyInfo,
        isTrusted: async () => false,
      },
    });

    expect(result).toMatchObject({
      verdict: "VALID_UNTRUSTED",
      signedClaims: descriptors.small!.claims,
      securityMode: "PAPER_CLAIMS_ONLY",
    });
  });

  it("rejects a valid seal copied onto a different document identity", async () => {
    const { signer, keyInfo } = createSigner();
    const encoded = await encodePaperSeal(descriptors.small!, signer);
    const result = await verifyPaperSeal(encoded.transport, {
      expectedDescriptor: { ...descriptors.small!, documentId: "INV-2026-82920" },
      trustStore: {
        resolve: async () => keyInfo,
      },
    });

    expect(result).toMatchObject({ verdict: "INVALID" });
    expect(result.evidence).toContainEqual(expect.objectContaining({ code: "PAPER_DOCUMENT_MISMATCH" }));
  });
});

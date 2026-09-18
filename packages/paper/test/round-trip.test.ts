import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import {
  decodePaperSeal,
  decodePaperSealQr,
  encodeBase45,
  encodeCoseSign1Parts,
  encodePaperSeal,
  renderPaperSealQr,
  verifyPaperSeal,
} from "../src/index.js";

function createSigner(options: { certificateFingerprint?: string } = {}): { signer: SignerProvider; keyInfo: SignerKeyInfo } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: "acme-retail",
    keyId: "phase-2-test",
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
    ...(options.certificateFingerprint === undefined ? {} : { certificateFingerprint: options.certificateFingerprint }),
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
      isTrusted: async () => true,
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
    expect(result).not.toHaveProperty("signedClaims");
  });

  it("binds a paper seal to the signing certificate fingerprint", async () => {
    const { signer, keyInfo } = createSigner({ certificateFingerprint: "sha256:paper-cert" });
    const encoded = await encodePaperSeal(descriptors.small!, signer);
    const decoded = decodePaperSeal(encoded.transport);

    expect(decoded.profile.certificateFingerprint).toBe("sha256:paper-cert");

    const result = await verifyPaperSeal(encoded.transport, {
      trustStore: {
        resolve: async () => ({ ...keyInfo, certificateFingerprint: "sha256:wrong-cert" }),
      },
    });

    expect(result).toMatchObject({ verdict: "INVALID" });
    expect(result.evidence).toContainEqual(expect.objectContaining({ code: "PAPER_CERTIFICATE_FINGERPRINT_MISMATCH" }));
    expect(result).not.toHaveProperty("signedClaims");
  });

  it("omits signed claims when a paper signature is invalid", async () => {
    const { signer, keyInfo } = createSigner();
    const encoded = await encodePaperSeal(descriptors.small!, signer);
    const decoded = decodePaperSeal(encoded.transport);
    const invalidSignature = decoded.coseParts.signature.slice();
    const lastSignatureByte = invalidSignature.length - 1;
    invalidSignature[lastSignatureByte] = invalidSignature[lastSignatureByte]! ^ 1;
    const mutatedCose = encodeCoseSign1Parts({
      ...decoded.coseParts,
      signature: invalidSignature,
    });
    const result = await verifyPaperSeal(`CRD1:${encodeBase45(mutatedCose)}`, {
      trustStore: { resolve: async () => keyInfo },
    });

    expect(result.cryptographicValidity).toBe("INVALID");
    expect(result).not.toHaveProperty("signedClaims");
  });

  it("omits signed claims when a paper signature is unverifiable", async () => {
    const { signer } = createSigner();
    const encoded = await encodePaperSeal(descriptors.small!, signer);

    const result = await verifyPaperSeal(encoded.transport);

    expect(result.cryptographicValidity).toBe("UNVERIFIABLE");
    expect(result).not.toHaveProperty("signedClaims");
  });
});

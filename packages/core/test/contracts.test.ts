import { describe, expect, it } from "vitest";
import type {
  ClaimValue,
  Claims,
  DocumentDescriptor,
} from "../src/document.js";
import { V1_CLAIM_VALUE_KINDS } from "../src/document.js";
import { V1_SIGNING_ALGORITHM } from "../src/signer.js";
import type { SignerKeyInfo, SignerProvider } from "../src/signer.js";
import type { TrustStore } from "../src/trust.js";
import { V1_PDF_SIGNATURE_LEVEL } from "../../pdf/src/engine.js";
import type { PdfSignatureEngine } from "../../pdf/src/engine.js";

describe("locked V1 contracts", () => {
  it("defines the required document descriptor and supported claim values", () => {
    const claims: Claims = {
      invoiceNumber: "INV-2026-82919",
      totalMinor: 1_180_000,
      paid: false,
    };
    const descriptor: DocumentDescriptor = {
      issuerId: "acme-retail",
      documentId: "INV-2026-82919",
      documentType: "invoice",
      issuedAt: "2026-01-01T00:00:00Z",
      claims,
    };

    const supportedValues: ClaimValue[] = ["text", true, 42];

    expect(descriptor.issuerId).toBe("acme-retail");
    expect(Object.keys(descriptor.claims)).toContain("totalMinor");
    expect(supportedValues).toHaveLength(3);
    expect(V1_CLAIM_VALUE_KINDS).toEqual(["string", "boolean", "safe-integer"]);
  });

  it("keeps signer and trust contracts asynchronous and public-key only", async () => {
    const keyInfo: SignerKeyInfo = {
      issuerId: "acme-retail",
      keyId: "dev-key-1",
      algorithm: "ES256",
      publicKey: new Uint8Array([1, 2, 3]),
    };
    const signer: SignerProvider = {
      getKeyInfo: async () => keyInfo,
      sign: async (input) => input,
    };
    const trustStore: TrustStore = {
      resolve: async () => keyInfo,
    };

    await expect(signer.getKeyInfo()).resolves.toEqual(keyInfo);
    await expect(trustStore.resolve("dev-key-1", "acme-retail")).resolves.toEqual(keyInfo);
    expect(Object.keys(keyInfo)).not.toContain("privateKey");
    expect(V1_SIGNING_ALGORITHM).toBe("ES256");
  });

  it("defines a byte-only PDF signature boundary", async () => {
    const engine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "UNVERIFIABLE",
        artifactIntegrity: "UNKNOWN",
      }),
    };

    const output = await engine.sign(new Uint8Array([37]), {
      signer: {
        getKeyInfo: async () => ({
          issuerId: "acme-retail",
          keyId: "dev-key-1",
          algorithm: "ES256",
          publicKey: new Uint8Array([1]),
        }),
        sign: async (input) => input,
      },
      level: "B-B",
      artifactDigest: "sha256:fixture",
    });

    expect(output).toEqual(new Uint8Array([37]));
    expect(V1_PDF_SIGNATURE_LEVEL).toBe("B-B");
    await expect(
      engine.verify(new Uint8Array([37]), { trustStore: { resolve: async () => undefined } }),
    ).resolves.toMatchObject({
      cryptographicValidity: "UNVERIFIABLE",
      artifactIntegrity: "UNKNOWN",
    });
  });
});

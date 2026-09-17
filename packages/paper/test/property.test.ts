import { createSign, generateKeyPairSync } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import { decodePaperSeal, encodePaperSeal, verifyPaperSeal } from "../src/index.js";

function createSigner(): { signer: SignerProvider; keyInfo: SignerKeyInfo } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: "property-issuer",
    keyId: "property-key",
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

const claimKey = fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/);
const claimValue = fc.oneof(fc.string({ maxLength: 24 }), fc.boolean(), fc.integer({ min: -1_000_000, max: 1_000_000 }));

describe("Paper Seal properties", () => {
  it("keeps equivalent claim insertion orders byte-identical", async () => {
    await fc.assert(fc.asyncProperty(
      fc.dictionary(claimKey, claimValue, { maxKeys: 6 }),
      async (claims) => {
        const first = createSigner();
        const descriptor: DocumentDescriptor = {
          issuerId: "property-issuer",
          documentId: "property-document",
          documentType: "invoice",
          issuedAt: "2026-01-01T00:00:00Z",
          claims,
        };
        const reordered = {
          ...descriptor,
          claims: Object.fromEntries(Object.entries(claims).reverse()),
        };
        const firstSeal = await encodePaperSeal(descriptor, first.signer);
        const secondSeal = await encodePaperSeal(reordered, first.signer);

        expect(firstSeal.payload).toEqual(secondSeal.payload);
        expect(firstSeal.transport).not.toBe("");
      },
    ), { seed: 20260919, numRuns: 40 });
  });

  it("never upgrades a structurally mutated transport to trusted", async () => {
    const { signer, keyInfo } = createSigner();
    const descriptor: DocumentDescriptor = {
      issuerId: "property-issuer",
      documentId: "property-document",
      documentType: "invoice",
      issuedAt: "2026-01-01T00:00:00Z",
      claims: { amount: 11800 },
    };
    const seal = await encodePaperSeal(descriptor, signer);
    const trustStore: TrustStore = { resolve: async () => keyInfo };
    const mutated = `${seal.transport.slice(0, -1)}${seal.transport.endsWith("0") ? "1" : "0"}`;

    const result = await verifyPaperSeal(mutated, { trustStore });
    expect(result.verdict).not.toBe("VALID_TRUSTED");
    expect(decodePaperSeal(seal.transport).payload).toEqual(seal.payload);
  });
});

import { describe, expect, it } from "vitest";
import type { PdfSignatureEngine } from "../src/engine.js";

const signer = {
  getKeyInfo: async () => ({
    issuerId: "acme-retail",
    keyId: "engine-contract",
    algorithm: "ES256" as const,
    publicKey: new Uint8Array([1]),
  }),
  sign: async (input: Uint8Array) => input,
};

describe("PdfSignatureEngine contract", () => {
  it("treats timestamping support as optional and defaults it to unclaimed", async () => {
    const withoutClaim: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
    };
    const withClaim: PdfSignatureEngine = { ...withoutClaim, supportsTimestamping: true };

    expect(withoutClaim.supportsTimestamping).toBeUndefined();
    expect(withClaim.supportsTimestamping).toBe(true);
    await expect(withClaim.sign(new Uint8Array([1]), {
      signer,
      level: "B-T",
      artifactDigest: "sha256:fixture",
    })).resolves.toEqual(new Uint8Array([1]));
  });
});

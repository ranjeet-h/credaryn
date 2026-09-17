import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import {
  CoseVerificationError,
  decodeCoseSign1,
  encodeCoseSign1Parts,
  createCoseSign1,
  verifyCoseSign1,
} from "../src/cose.js";

function createSigner(issuerId = "acme-retail", keyId = "key-1"): {
  signer: SignerProvider;
  keyInfo: SignerKeyInfo;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId,
    keyId,
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

describe("COSE_Sign1 ES256", () => {
  it("creates and verifies a COSE_Sign1 with the protected ES256 and key-id headers", async () => {
    const { signer, keyInfo } = createSigner();
    const payload = new TextEncoder().encode("signed payload");
    const cose = await createCoseSign1(payload, signer);
    const parsed = decodeCoseSign1(cose);
    const trustStore: TrustStore = { resolve: async () => keyInfo };

    expect(parsed.protectedHeaders.get(1)).toBe(-7);
    expect(parsed.protectedHeaders.get(4)).toEqual(new TextEncoder().encode("key-1"));
    await expect(verifyCoseSign1(cose, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
      cryptographicValidity: "VALID",
      keyId: "key-1",
      payload,
    });
  });

  it("returns invalid for a changed payload and unverifiable for absent trust material", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("signed payload"), signer);
    const trustStore: TrustStore = { resolve: async () => keyInfo };
    const parts = decodeCoseSign1(cose);
    const changed = encodeCoseSign1Parts({ ...parts, payload: new TextEncoder().encode("changed payload") });

    await expect(verifyCoseSign1(changed, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
      cryptographicValidity: "INVALID",
    });
    await expect(verifyCoseSign1(cose, { issuerId: "acme-retail" })).resolves.toMatchObject({
      cryptographicValidity: "UNVERIFIABLE",
    });
  });

  it("fails closed for unsupported algorithms and unknown critical headers", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("signed payload"), signer);
    const parts = decodeCoseSign1(cose);
    const trustStore: TrustStore = { resolve: async () => keyInfo };
    const unsupportedAlgorithm = encodeCoseSign1Parts({
      ...parts,
      protectedHeaders: new Map([...parts.protectedHeaders, [1, -37]]),
    });
    const unknownCritical = encodeCoseSign1Parts({
      ...parts,
      protectedHeaders: new Map([...parts.protectedHeaders, [2, [99]]]),
    });

    await expect(verifyCoseSign1(unsupportedAlgorithm, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
      cryptographicValidity: "INVALID",
    });
    await expect(verifyCoseSign1(unknownCritical, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
      cryptographicValidity: "INVALID",
    });
  });

  it("rejects malformed COSE structures with a bounded error", () => {
    expect(() => decodeCoseSign1(new Uint8Array([0x84, 0x40]))).toThrow(CoseVerificationError);
  });
});

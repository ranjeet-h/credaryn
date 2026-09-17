import { describe, expect, it } from "vitest";
import type { ManagedSignerProvider } from "@credaryn/core";

const SIGNATURE = new Uint8Array([
  0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01,
]);

export function defineProviderContract(
  providerName: string,
  createProvider: (signature?: Uint8Array, failure?: Error) => ManagedSignerProvider,
): void {
  describe(`${providerName} provider contract`, () => {
    it("returns immutable versioned public metadata and a healthy status", async () => {
      const provider = createProvider(SIGNATURE);
      const keyInfo = await provider.getKeyInfo();
      const publicKey = await provider.getPublicKey();
      const health = await provider.healthCheck();

      expect(keyInfo).toMatchObject({
        issuerId: "acme-retail",
        keyId: "issuer-key@v1",
        algorithm: "ES256",
      });
      expect(publicKey.publicKey).toEqual(keyInfo.publicKey);
      expect(Object.hasOwn(keyInfo, "privateKey")).toBe(false);
      expect(health).toMatchObject({ provider: providerName, status: "HEALTHY", keyId: "issuer-key@v1" });
      expect(Number.isNaN(Date.parse(health.checkedAt))).toBe(false);
    });

    it("signs through the provider boundary without returning private material", async () => {
      const provider = createProvider(SIGNATURE);
      const signature = await provider.sign(new Uint8Array([1, 2, 3]));

      expect(signature).toEqual(SIGNATURE);
      expect(signature).not.toBe((await provider.getKeyInfo() as unknown as { privateKey?: unknown }).privateKey);
    });

    it("normalizes a remote signing failure", async () => {
      const provider = createProvider(SIGNATURE, new Error("remote failure"));

      await expect(provider.sign(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
        provider: providerName,
        code: "SIGNING_FAILED",
        retryable: false,
      });
    });
  });
}

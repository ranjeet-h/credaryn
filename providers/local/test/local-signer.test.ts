import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DemoTrustStore } from "../src/demo-trust-store.js";
import { LocalSigner } from "../src/local-signer.js";

describe("development local signer", () => {
  it("generates an ES256 key and signs asynchronously without exposing private bytes", async () => {
    const signer = new LocalSigner({ issuerId: "acme-retail", keyId: "local-dev-1" });
    const keyInfo = await signer.getKeyInfo();
    const input = new TextEncoder().encode("phase-1-fixture");
    const signature = await signer.sign(input);

    const verifier = createVerify("SHA256");
    verifier.update(input);
    verifier.end();

    expect(keyInfo).toMatchObject({
      issuerId: "acme-retail",
      keyId: "local-dev-1",
      algorithm: "ES256",
    });
    expect(keyInfo.publicKey.byteLength).toBeGreaterThan(0);
    expect(signature.byteLength).toBeGreaterThan(0);
    expect(verifier.verify({ key: Buffer.from(keyInfo.publicKey), format: "der", type: "spki" }, signature)).toBe(true);
    expect(Object.keys(keyInfo)).not.toContain("privateKey");
    expect(signer.isDevelopmentOnly).toBe(true);
  });

  it("resolves only matching issuer and key IDs from the demo trust store", async () => {
    const signer = new LocalSigner({ issuerId: "acme-retail", keyId: "local-dev-1" });
    const keyInfo = await signer.getKeyInfo();
    const trustStore = new DemoTrustStore([keyInfo]);

    await expect(trustStore.resolve("local-dev-1", "acme-retail")).resolves.toEqual(keyInfo);
    await expect(trustStore.resolve("local-dev-1", "other-issuer")).resolves.toBeUndefined();
    await expect(trustStore.resolve("other-key", "acme-retail")).resolves.toBeUndefined();
    expect(trustStore.isDevelopmentOnly).toBe(true);
    expect(trustStore.trustSource).toBe("local-demo-trust-store");
  });
});

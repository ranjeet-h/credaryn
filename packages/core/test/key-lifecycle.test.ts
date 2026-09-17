import { describe, expect, it } from "vitest";
import type { SignerKeyInfo } from "../src/signer.js";
import {
  KeyLifecycleError,
  KeyLifecycleRegistry,
  type KeyVersionRecord,
} from "../src/key-lifecycle.js";

describe("KeyLifecycleRegistry", () => {
  it("authorizes a new version before activation and retires the old signing version", () => {
    const registry = new KeyLifecycleRegistry();
    const oldKey = registry.authorize(record("v1", "fingerprint-v1"));
    registry.activate(oldKey.identity);

    const newKey = registry.authorize(record("v2", "fingerprint-v2"));
    expect(newKey.status).toBe("AUTHORIZED");
    expect(registry.getActive("acme-retail")?.identity.version).toBe("v1");

    registry.activate(newKey.identity);

    expect(registry.getActive("acme-retail")?.identity.version).toBe("v2");
    expect(registry.resolve(oldKey.identity)?.status).toBe("RETIRED");
    expect(registry.resolve(newKey.identity)?.status).toBe("ACTIVE");
  });

  it("retains revoked and compromised public metadata but blocks them from signing", () => {
    const registry = new KeyLifecycleRegistry();
    const revoked = registry.authorize(record("revoked", "fingerprint-revoked"));
    registry.activate(revoked.identity);
    registry.revoke(revoked.identity, "suspected compromise");

    const compromised = registry.authorize(record("compromised", "fingerprint-compromised"));
    registry.compromise(compromised.identity, "private key exposure");

    expect(registry.resolve(revoked.identity)).toMatchObject({
      status: "REVOKED",
      reason: "suspected compromise",
    });
    expect(registry.resolve(compromised.identity)).toMatchObject({
      status: "COMPROMISED",
      reason: "private key exposure",
    });
    expect(registry.getActive("acme-retail")).toBeUndefined();
  });

  it("rejects identity reuse with changed public material and keeps returned records immutable", () => {
    const registry = new KeyLifecycleRegistry();
    const identity = record("v1", "fingerprint-v1");
    const stored = registry.authorize(identity);
    stored.keyInfo.publicKey[0] = 0xff;

    expect(registry.resolve(stored.identity)?.keyInfo.publicKey[0]).toBe(1);
    expect(() => registry.authorize({
      ...identity,
      keyInfo: { ...identity.keyInfo, publicKey: new Uint8Array([9, 9, 9]) },
    })).toThrowError(KeyLifecycleError);
  });
});

function record(version: string, certificateFingerprint: string): KeyVersionRecord {
  const keyInfo: SignerKeyInfo = {
    issuerId: "acme-retail",
    keyId: `issuer-key-${version}`,
    algorithm: "ES256",
    publicKey: new Uint8Array([1, 2, 3]),
    certificateFingerprint,
  };
  return {
    identity: {
      issuerId: keyInfo.issuerId,
      keyId: keyInfo.keyId,
      version,
      certificateFingerprint,
    },
    keyInfo,
    authorizedAt: "2026-09-17T00:00:00.000Z",
  };
}

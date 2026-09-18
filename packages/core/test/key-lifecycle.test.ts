import { describe, expect, it } from "vitest";
import type { SignerKeyInfo } from "../src/signer.js";
import {
  KeyLifecycleError,
  KeyLifecycleRegistry,
  versionedKeyId,
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

  it("returns the existing record when the same public identity is authorized again", () => {
    const registry = new KeyLifecycleRegistry();
    const identity = record("v1", "fingerprint-v1");
    const first = registry.authorize(identity);
    const second = registry.authorize(record("v1", "fingerprint-v1"));

    expect(second).toEqual(first);
    expect(second.status).toBe("AUTHORIZED");
  });

  it("requires an ACTIVE key for signing and enforces activation ordering", () => {
    const registry = new KeyLifecycleRegistry();

    expect(() => registry.getSigningKey("acme-retail")).toThrow(/No ACTIVE signing key/);
    expect(() => registry.activate(record("missing", "fingerprint-missing").identity)).toThrow(/Unknown key version/);

    const authorized = registry.authorize(record("v1", "fingerprint-v1"));
    registry.activate(authorized.identity);
    expect(registry.getSigningKey("acme-retail").identity.version).toBe("v1");
    expect(() => registry.activate(authorized.identity)).toThrow(/Only AUTHORIZED/);
  });

  it("blocks retiring revoked or compromised keys but records a retire reason", () => {
    const registry = new KeyLifecycleRegistry();
    const revoked = registry.authorize(record("revoked", "fingerprint-revoked"));
    registry.revoke(revoked.identity, "suspected compromise");

    expect(() => registry.retire(revoked.identity)).toThrow(/cannot be retired/);

    const retiring = registry.authorize(record("retiring", "fingerprint-retiring"));
    const retired = registry.retire(retiring.identity, "2026-09-18T00:00:00.000Z", "superseded");
    expect(retired).toMatchObject({ status: "RETIRED", reason: "superseded" });
  });

  it("requires a non-empty reason when revoking or compromising a key", () => {
    const registry = new KeyLifecycleRegistry();
    const identity = registry.authorize(record("v1", "fingerprint-v1")).identity;

    expect(() => registry.revoke(identity, "   ")).toThrow(/require a reason/);
    expect(() => registry.compromise(identity, "")).toThrow(/require a reason/);
  });

  it("validates key version identifiers and record metadata", () => {
    const registry = new KeyLifecycleRegistry();

    expect(versionedKeyId("key-1", "v1")).toBe("key-1@v1");
    expect(() => versionedKeyId("", "v1")).toThrow(/must not be empty/);
    expect(() => versionedKeyId("key-1", " ")).toThrow(/must not be empty/);

    expect(() => registry.authorize({
      ...record("v1", "fingerprint-v1"),
      keyInfo: { ...record("v1", "fingerprint-v1").keyInfo, algorithm: "RS256" as "ES256" },
    })).toThrow(/Only ES256/);
    expect(() => registry.authorize({
      ...record("v1", "fingerprint-v1"),
      keyInfo: { ...record("v1", "fingerprint-v1").keyInfo, issuerId: "other" },
    })).toThrow(/does not match key metadata/);
    expect(() => registry.authorize({
      ...record("v1", "fingerprint-v1"),
      identity: { ...record("v1", "fingerprint-v1").identity, version: "  " },
    })).toThrow(/must not be empty/);
    expect(() => registry.authorize({
      ...record("v1", "fingerprint-v1"),
      identity: { ...record("v1", "fingerprint-v1").identity, certificateFingerprint: "" },
    })).toThrow(/certificateFingerprint must not be empty/);
    expect(() => registry.authorize({
      ...record("v1", "fingerprint-v1"),
      keyInfo: { ...record("v1", "fingerprint-v1").keyInfo, publicKey: new Uint8Array() },
    })).toThrow(/publicKey must not be empty/);
  });

  it("deep-copies certificate chains on authorization and reads", () => {
    const registry = new KeyLifecycleRegistry();
    const base = record("v1", "fingerprint-v1");
    const stored = registry.authorize({
      ...base,
      keyInfo: {
        ...base.keyInfo,
        certificateChain: [new Uint8Array([1, 2]), new Uint8Array([3])],
      },
    });

    stored.keyInfo.certificateChain![0]![0] = 0xff;

    expect(registry.resolve(stored.identity)?.keyInfo.certificateChain?.[0]?.[0]).toBe(1);
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

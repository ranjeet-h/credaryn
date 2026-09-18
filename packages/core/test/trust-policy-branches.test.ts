import { describe, expect, it } from "vitest";
import type { SignerKeyInfo } from "../src/signer.js";
import { TrustPolicy, type RemoteTrustMaterial } from "../src/trust-policy.js";

const issuerId = "acme-retail";

function key(keyId: string, certificateFingerprint?: string): SignerKeyInfo {
  return {
    issuerId,
    keyId,
    algorithm: "ES256",
    publicKey: new Uint8Array([1, 2, 3]),
    ...(certificateFingerprint === undefined ? {} : { certificateFingerprint }),
  };
}

function material(
  remoteKey: SignerKeyInfo,
  options: { url?: string; fetchedAt?: string; source?: RemoteTrustMaterial["source"] } = {},
): RemoteTrustMaterial {
  return {
    key: remoteKey,
    url: options.url ?? "https://keys.example.test/.well-known/did.json",
    fetchedAt: options.fetchedAt ?? "2026-09-18T00:00:00.000Z",
    source: options.source ?? "did-web",
  };
}

describe("TrustPolicy resilience branches", () => {
  it("reports UNAVAILABLE when the resolver throws", async () => {
    const policy = new TrustPolicy({
      resolver: async () => {
        throw new Error("dns unavailable");
      },
    });

    await expect(policy.evaluate({ issuerId, keyId: "remote-key" })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      trustSource: "UNCONFIGURED",
      freshness: "UNAVAILABLE",
    });
  });

  it("rejects a resolver that returns a different key than requested", async () => {
    const policy = new TrustPolicy({ resolver: async () => material(key("other-key")) });

    await expect(policy.evaluate({ issuerId, keyId: "requested-key" })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      trustSource: "UNCONFIGURED",
    });
  });

  it("treats an unparseable fetchedAt as UNAVAILABLE freshness", async () => {
    const remote = key("remote-key");
    const policy = new TrustPolicy({
      resolver: async () => material(remote, { fetchedAt: "not-a-date" }),
      allowedDidWebDomains: ["keys.example.test"],
      maxCacheAgeMs: 60_000,
    });

    await expect(policy.evaluate({ issuerId, keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      freshness: "UNAVAILABLE",
    });
  });

  it("does not trust did:web material when freshness is required but unavailable", async () => {
    const remote = key("remote-key");
    const policy = new TrustPolicy({
      resolver: async () => material(remote, { fetchedAt: "invalid" }),
      allowedDidWebDomains: ["keys.example.test"],
      maxCacheAgeMs: 60_000,
      requireFreshness: true,
    });

    await expect(policy.evaluate({ issuerId, keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      freshness: "UNAVAILABLE",
    });
  });

  it("evaluates isTrusted for remembered, configured and anchored keys", async () => {
    const configured = key("configured-key", "fingerprint-configured");
    const policy = new TrustPolicy({
      configuredKeys: [configured],
      x509Anchors: [{ issuerId, certificateFingerprint: "fingerprint-anchor" }],
    });

    expect(policy.isTrusted(configured)).toBe(true);
    expect(policy.isTrusted({ ...configured, certificateFingerprint: "other" })).toBe(false);

    await policy.evaluate({ issuerId, keyId: configured.keyId });
    expect(policy.isTrusted(configured)).toBe(true);

    expect(policy.isTrusted(key("leaf-key", "fingerprint-anchor"))).toBe(true);
    expect(policy.isTrusted(key("leaf-key", "fingerprint-unknown"))).toBe(false);
  });

  it("resolves a remembered remote key by certificate fingerprint", async () => {
    const remote = key("remote-key", "fingerprint-remote");
    const policy = new TrustPolicy({
      resolver: async () => material(remote),
      allowedDidWebDomains: ["keys.example.test"],
      x509Anchors: [{ issuerId, certificateFingerprint: "fingerprint-remote" }],
    });

    await policy.evaluate({ issuerId, keyId: remote.keyId });

    expect(policy.resolveByFingerprint("fingerprint-remote")).toMatchObject({ keyId: "remote-key" });
    expect(policy.resolveByFingerprint("fingerprint-missing")).toBeUndefined();
  });

  it("fails closed when a resolver URL cannot be parsed", async () => {
    const remote = key("remote-key");
    const policy = new TrustPolicy({
      resolver: async () => material(remote, { url: "" }),
      allowedDidWebDomains: ["keys.example.test"],
    });

    await expect(policy.evaluate({ issuerId, keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      trustSource: "UNCONFIGURED",
    });
  });

  it("accepts exact and subdomain did:web matches and ignores empty allowlist entries", async () => {
    const remote = key("remote-key");
    const resolver = async () => material(remote, { url: "https://sub.keys.example.test/did.json" });
    const policy = new TrustPolicy({
      resolver,
      allowedDidWebDomains: ["", "keys.example.test"],
    });

    await expect(policy.evaluate({ issuerId, keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "TRUSTED",
      trustSource: "DID_WEB_DOMAIN",
    });
  });

  it("remembers resolved material but reports it as untrusted", async () => {
    const remote = key("remote-key", "fingerprint-remote");
    const policy = new TrustPolicy({
      resolver: async () => material(remote, { url: "http://keys.example.test/did.json" }),
      allowedDidWebDomains: ["keys.example.test"],
    });

    await expect(policy.evaluate({ issuerId, keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
    });
    expect(policy.isTrusted(remote)).toBe(false);
    expect(policy.resolveByFingerprint("fingerprint-remote")).toMatchObject({ keyId: "remote-key" });
  });
});

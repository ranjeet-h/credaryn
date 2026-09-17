import { describe, expect, it } from "vitest";
import type { SignerKeyInfo } from "../src/signer.js";
import { TrustPolicy } from "../src/trust-policy.js";

const configuredKey = key("configured-key", "sha256:configured");

describe("TrustPolicy", () => {
  it("trusts only an explicitly configured public key", async () => {
    const policy = new TrustPolicy({ configuredKeys: [configuredKey] });

    await expect(policy.evaluate({ issuerId: "acme-retail", keyId: configuredKey.keyId })).resolves.toMatchObject({
      trustDecision: "TRUSTED",
      trustSource: "configured-public-key",
      freshness: "NOT_APPLICABLE",
    });
    await expect(policy.evaluate({ issuerId: "acme-retail", keyId: "unknown" })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      trustSource: "none",
    });
  });

  it("does not treat a fetched key as trusted unless an allowed HTTPS did:web domain is configured", async () => {
    const fetched = key("remote-key", "sha256:remote");
    const resolver = async () => ({ key: fetched, url: "https://keys.example.test/acme.json", fetchedAt: "2026-09-17T00:00:00.000Z", source: "fetched" as const });
    const untrusted = new TrustPolicy({ resolver });
    const trusted = new TrustPolicy({ resolver, allowedDidWebDomains: ["keys.example.test"] });

    await expect(untrusted.evaluate({ issuerId: "acme-retail", keyId: fetched.keyId })).resolves.toMatchObject({ trustDecision: "UNTRUSTED" });
    await expect(trusted.evaluate({ issuerId: "acme-retail", keyId: fetched.keyId })).resolves.toMatchObject({ trustDecision: "UNTRUSTED" });

    const didWebResolver = async () => ({ key: fetched, url: "https://keys.example.test/acme.json", fetchedAt: "2026-09-17T00:00:00.000Z", source: "did-web" as const });
    const didWebPolicy = new TrustPolicy({ resolver: didWebResolver, allowedDidWebDomains: ["keys.example.test"], now: () => Date.parse("2026-09-17T00:01:00.000Z") });
    await expect(didWebPolicy.evaluate({ issuerId: "acme-retail", keyId: fetched.keyId })).resolves.toMatchObject({ trustDecision: "TRUSTED", trustSource: "did-web" });
  });

  it("rejects HTTP resolution and stale keys when freshness is required", async () => {
    const remote = key("remote-key", "sha256:remote");
    const resolver = async () => ({ key: remote, url: "http://keys.example.test/acme.json", fetchedAt: "2026-09-16T00:00:00.000Z", source: "did-web" as const });
    const policy = new TrustPolicy({
      resolver,
      allowedDidWebDomains: ["keys.example.test"],
      maxCacheAgeMs: 60_000,
      requireFreshness: true,
      now: () => Date.parse("2026-09-17T00:00:00.000Z"),
    });

    await expect(policy.evaluate({ issuerId: "acme-retail", keyId: remote.keyId })).resolves.toMatchObject({
      trustDecision: "UNTRUSTED",
      freshness: "STALE",
    });
  });
});

function key(keyId: string, certificateFingerprint: string): SignerKeyInfo {
  return { issuerId: "acme-retail", keyId, algorithm: "ES256", publicKey: new Uint8Array([1, 2, 3]), certificateFingerprint };
}

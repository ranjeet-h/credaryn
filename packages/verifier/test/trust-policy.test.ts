import { mkdtemp, writeFile } from "node:fs/promises";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTrustPolicyStore, loadTrustStore, createPolicyTrustStore } from "../src/index.js";

describe("trust-policy driven trust store", () => {
  it("marks configured enterprise keys as ENTERPRISE_ANCHOR and resolves them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-key-"));
    const publicKey = publicKeyBase64();
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({
      keys: [{
        issuerId: "acme-retail",
        keyId: "enterprise-key",
        algorithm: "ES256",
        publicKey,
        certificateFingerprint: "sha256:enterprise",
      }],
    }));

    const trustStore = await loadTrustPolicyStore(path);

    expect(trustStore.trustSource).toBe("ENTERPRISE_ANCHOR");
    const resolved = await trustStore.resolve("enterprise-key", "acme-retail");
    expect(resolved).toBeDefined();
    expect(trustStore.isTrusted?.(resolved!) ?? false).toBe(true);
  });

  it("falls back to certificate fingerprint lookup for configured keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-fingerprint-"));
    const publicKey = publicKeyBase64();
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({
      keys: [{
        issuerId: "acme-retail",
        keyId: "enterprise-key",
        algorithm: "ES256",
        publicKey,
        certificateFingerprint: "sha256:enterprise",
      }],
      x509Anchors: [{ issuerId: "acme-retail", certificateFingerprint: "sha256:anchor" }],
    }));

    const trustStore = await loadTrustPolicyStore(path);

    const byFingerprint = await trustStore.resolveByFingerprint?.("sha256:enterprise");
    expect(byFingerprint).toBeDefined();
    expect(byFingerprint?.keyId).toBe("enterprise-key");
    await expect(trustStore.resolveByFingerprint?.("sha256:unknown")).resolves.toBeUndefined();
  });

  it("uses X509_CHAIN when only X.509 anchors are configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-x509-"));
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({
      x509Anchors: [{ issuerId: "acme-retail", certificateFingerprint: "sha256:anchor" }],
    }));

    const trustStore = await loadTrustPolicyStore(path);

    expect(trustStore.trustSource).toBe("X509_CHAIN");
    expect(trustStore.isTrusted?.({
      issuerId: "acme-retail",
      keyId: "leaf-key",
      algorithm: "ES256",
      publicKey: new Uint8Array([1]),
      certificateFingerprint: "sha256:anchor",
    }) ?? false).toBe(true);
    expect(trustStore.isTrusted?.({
      issuerId: "acme-retail",
      keyId: "leaf-key",
      algorithm: "ES256",
      publicKey: new Uint8Array([1]),
      certificateFingerprint: "sha256:other",
    }) ?? false).toBe(false);
  });

  it("reports UNCONFIGURED when no trust material is present", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-empty-"));
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({ keys: [] }));

    const trustStore = await loadTrustPolicyStore(path);

    expect(trustStore.trustSource).toBe("UNCONFIGURED");
  });

  it("reports DID_WEB_DOMAIN for domain-only policies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-didweb-"));
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({ didWebDomains: ["keys.example.test"] }));

    const trustStore = await loadTrustPolicyStore(path, { didWebResolver: async () => undefined });

    expect(trustStore.trustSource).toBe("DID_WEB_DOMAIN");
  });

  it("trusts bounded did:web material through a configured X.509 anchor", async () => {
    const issuerId = "did:web:keys.example.test";
    const remoteKey = {
      issuerId,
      keyId: "remote-key",
      algorithm: "ES256" as const,
      publicKey: new Uint8Array([1, 2, 3]),
      certificateFingerprint: "sha256:remote",
    };
    const trustStore = createPolicyTrustStore(
      {
        x509Anchors: [{ issuerId, certificateFingerprint: "sha256:remote" }],
        didWebDomains: ["keys.example.test"],
      },
      {
        didWebResolver: async () => ({
          key: remoteKey,
          url: "https://keys.example.test/.well-known/did.json",
          fetchedAt: "2026-09-18T00:00:00.000Z",
          source: "did-web",
        }),
      },
    );

    expect(trustStore.trustSource).toBe("X509_CHAIN");
    const resolved = await trustStore.resolve("remote-key", issuerId);
    expect(resolved).toBeDefined();
    expect(trustStore.isTrusted?.(resolved!) ?? false).toBe(true);
  });

  it("exposes fingerprint lookup on the backward-compatible key bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-legacy-fingerprint-"));
    await writeFile(join(directory, "trust.json"), JSON.stringify({
      keys: [{
        issuerId: "issuer",
        keyId: "key",
        algorithm: "ES256",
        publicKey: publicKeyBase64(),
        certificateFingerprint: "sha256:legacy",
      }],
    }));

    const trustStore = await loadTrustStore(directory);

    const resolved = await trustStore.resolveByFingerprint?.("sha256:legacy");
    expect(resolved).toBeDefined();
    expect(resolved?.keyId).toBe("key");
  });

  it("rejects malformed X.509 anchors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-policy-invalid-anchor-"));
    const path = join(directory, "trust-policy.json");
    await writeFile(path, JSON.stringify({ x509Anchors: [{ issuerId: "acme-retail" }] }));

    await expect(loadTrustPolicyStore(path)).rejects.toMatchObject({ code: "TRUST_STORE_INVALID" });
  });
});

function publicKeyBase64(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return Buffer.from(exportDer(publicKey)).toString("base64");
}

function exportDer(publicKey: KeyObject): Uint8Array {
  return new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
}

import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SignerKeyInfo } from "@credaryn/core";
import {
  TrustStoreLoadError,
  createPolicyTrustStore,
  loadTrustStore,
} from "../src/index.js";

async function bundleFile(name: string, contents: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "credaryn-edges-"));
  const path = join(directory, name);
  await writeFile(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
}

function publicKeyBase64(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return Buffer.from(publicKey.export({ type: "spki", format: "der" })).toString("base64");
}

function key(): SignerKeyInfo {
  return {
    issuerId: "issuer",
    keyId: "key",
    algorithm: "ES256",
    publicKey: new Uint8Array([1, 2, 3]),
    certificateFingerprint: "sha256:key",
  };
}

describe("trust bundle loading failures", () => {
  it("rejects a bundle path that cannot be read", async () => {
    await expect(loadTrustStore(join(tmpdir(), "credaryn-missing-bundle"))).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it.each([
    ["invalid JSON", "not json"],
    ["a non-object JSON document", "[]"],
  ])("rejects %s", async (_name, contents) => {
    await expect(loadTrustStore(await bundleFile("trust.json", contents))).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it.each([
    ["keys that are not an array", { keys: {} }],
    ["a non-object key entry", { keys: [42] }],
    ["key metadata with the wrong algorithm", {
      keys: [{ issuerId: "issuer", keyId: "key", algorithm: "RS256", publicKey: publicKeyBase64() }],
    }],
    ["an empty certificate fingerprint", {
      keys: [{
        issuerId: "issuer",
        keyId: "key",
        algorithm: "ES256",
        publicKey: publicKeyBase64(),
        certificateFingerprint: "   ",
      }],
    }],
    ["x509Anchors that are not an array", { x509Anchors: {} }],
    ["a non-object X.509 anchor entry", { x509Anchors: [42] }],
    ["didWebDomains that are not an array", { didWebDomains: {} }],
    ["an empty did:web domain entry", { didWebDomains: ["  "] }],
  ])("rejects %s", async (_name, contents) => {
    await expect(loadTrustStore(await bundleFile("trust.json", contents))).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it("rejects a JSON file that is a directory inside the bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-edges-dir-"));
    await mkdir(join(directory, "nested.json"));

    await expect(loadTrustStore(directory)).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it("marks a development-only bundle and still loads its keys", async () => {
    const path = await bundleFile("trust.json", {
      developmentOnly: true,
      keys: [{
        issuerId: "issuer",
        keyId: "key",
        algorithm: "ES256",
        publicKey: publicKeyBase64(),
      }],
    });

    const store = await loadTrustStore(path);

    expect(store.trustSource).toBe("ENTERPRISE_ANCHOR (development-only)");
    await expect(store.resolve("key", "issuer")).resolves.toBeDefined();
  });
});

describe("policy trust store fallbacks", () => {
  it("creates a bounded did:web resolver when domains are configured", () => {
    const store = createPolicyTrustStore({ didWebDomains: ["keys.example.test"] });

    expect(store.trustSource).toBe("DID_WEB_DOMAIN");
  });

  it("deletes unresolved references and reports unknown configured keys as untrusted", async () => {
    const store = createPolicyTrustStore({}, { didWebResolver: async () => undefined });

    await expect(store.resolve("missing-key", "issuer")).resolves.toBeUndefined();
    expect(store.isTrusted?.(key()) ?? false).toBe(false);
    await expect(store.resolveByFingerprint?.("   ")).resolves.toBeUndefined();

    const bare = createPolicyTrustStore({});
    expect(bare.isTrusted?.(key()) ?? false).toBe(false);
  });

  it("resolves a policy-fetched key by certificate fingerprint", async () => {
    const remote = key();
    const store = createPolicyTrustStore({}, {
      didWebResolver: async () => ({
        key: remote,
        url: "https://keys.example.test/.well-known/did.json",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        source: "did-web",
      }),
    });

    await expect(store.resolve("key", "issuer")).resolves.toMatchObject({ keyId: "key" });
    await expect(store.resolveByFingerprint?.("sha256:key")).resolves.toMatchObject({ keyId: "key" });
    await expect(store.resolveByFingerprint?.("sha256:missing")).resolves.toBeUndefined();
  });

  it("rejects a configured key whose public material or algorithm differs", async () => {
    const configured = key();
    const store = createPolicyTrustStore({ keys: [configured] });

    expect(store.isTrusted?.(configured) ?? false).toBe(true);
    expect(store.isTrusted?.({ ...configured, publicKey: new Uint8Array([1, 2]) }) ?? false).toBe(false);
    expect(store.isTrusted?.({
      ...configured,
      algorithm: "RS256" as "ES256",
    }) ?? false).toBe(false);
  });
});

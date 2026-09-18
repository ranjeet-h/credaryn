import { mkdtemp, writeFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrustStoreLoadError, loadTrustStore } from "../src/index.js";

describe("trust store loading", () => {
  it("rejects malformed public-key Base64 instead of creating an empty key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-trust-"));
    const path = join(directory, "trust.json");
    await writeFile(path, JSON.stringify({
      keys: [{
        issuerId: "issuer",
        keyId: "key",
        algorithm: "ES256",
        publicKey: "%%%not-base64%%%",
      }],
    }));

    await expect(loadTrustStore(path)).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it("rejects a trust directory with too many JSON files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-trust-dir-"));
    await Promise.all(Array.from({ length: 65 }, (_, index) => writeFile(
      join(directory, `${index}.json`),
      JSON.stringify({ keys: [] }),
    )));

    await expect(loadTrustStore(directory)).rejects.toBeInstanceOf(TrustStoreLoadError);
  });

  it("trusts only the exact public key loaded from the bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-trust-key-"));
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const { publicKey: otherPublicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const publicKeyBytes = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
    await writeFile(join(directory, "trust.json"), JSON.stringify({
      keys: [{
        issuerId: "issuer",
        keyId: "key",
        algorithm: "ES256",
        publicKey: Buffer.from(publicKeyBytes).toString("base64"),
      }],
    }));

    const trustStore = await loadTrustStore(directory);
    const resolved = await trustStore.resolve("key", "issuer");

    expect(resolved).toBeDefined();
    expect(trustStore.isTrusted?.(resolved!) ?? false).toBe(true);
    expect(trustStore.isTrusted?.({
      ...resolved!,
      publicKey: new Uint8Array(otherPublicKey.export({ type: "spki", format: "der" })),
    }) ?? false).toBe(false);
  });
});

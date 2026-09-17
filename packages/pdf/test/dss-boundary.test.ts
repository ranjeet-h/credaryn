import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { PdfSignatureEngine } from "../src/engine.js";

describe("DSS adapter boundary", () => {
  it("exposes only normalized byte-oriented signing and validation", async () => {
    const source = await readFile(new URL("../src/engine.ts", import.meta.url), "utf8");
    const engine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "UNVERIFIABLE",
        artifactIntegrity: "UNKNOWN",
      }),
    };

    expect(source).not.toMatch(/import .*dss|import .*java/i);
    await expect(engine.sign(new Uint8Array([1]), {
      signer: {
        getKeyInfo: async () => ({
          issuerId: "acme-retail",
          keyId: "phase-0",
          algorithm: "ES256",
          publicKey: new Uint8Array([1]),
        }),
        sign: async (input) => input,
      },
      level: "B-B",
      artifactDigest: "sha256:fixture",
    })).resolves.toEqual(new Uint8Array([1]));
  });
});

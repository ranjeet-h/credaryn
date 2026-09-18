import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider } from "@credaryn/core";
import {
  PaperSealSizeError,
  decodePaperSeal,
  encodePaperSeal,
  verifyPaperSeal,
} from "../src/index.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

function createSigner(keyId = "phase-2-adversarial"): SignerProvider {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId: descriptor.issuerId,
    keyId,
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  };
  return {
    getKeyInfo: async () => keyInfo,
    sign: async (input) => {
      const operation = createSign("SHA256");
      operation.update(input);
      return new Uint8Array(operation.sign(privateKey));
    },
  };
}

describe("Paper Seal adversarial inputs", () => {
  it("rejects oversized payloads without dropping the oversized claim", async () => {
    const oversized = {
      ...descriptor,
      claims: { ...descriptor.claims, privateNote: "x".repeat(2_000) },
    };

    await expect(encodePaperSeal(oversized, createSigner())).rejects.toThrow(PaperSealSizeError);
    await expect(encodePaperSeal(oversized, createSigner())).rejects.toThrow(/1200.*claims/i);
  });

  it("reports the measured oversized COSE object length", async () => {
    const oversized = {
      ...descriptor,
      claims: { ...descriptor.claims, privateNote: "x".repeat(2_000) },
    };

    const error = await encodePaperSeal(oversized, createSigner()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PaperSealSizeError);
    expect((error as PaperSealSizeError).actualBytes).toBe(2_256);
  });

  it("reports a measured COSE length that tracks the protected key ID header", async () => {
    const oversized = {
      ...descriptor,
      claims: { ...descriptor.claims, privateNote: "x".repeat(2_000) },
    };
    const defaultKey = await encodePaperSeal(oversized, createSigner()).catch((caught: unknown) => caught) as PaperSealSizeError;
    const shortKey = await encodePaperSeal(oversized, createSigner("k")).catch((caught: unknown) => caught) as PaperSealSizeError;

    // The old fabricated formula (`payload.length + 120`) would differ by exactly the
    // key-ID delta. The measured COSE length also accounts for CBOR header framing.
    expect(defaultKey.actualBytes).toBe(2_256);
    expect(shortKey.actualBytes).toBe(2_219);
  });

  it("classifies malformed prefix, Base45 and CBOR as invalid", async () => {
    const trustStore = { resolve: async () => undefined };

    await expect(verifyPaperSeal("not-a-credaryn-seal", { trustStore })).resolves.toMatchObject({ verdict: "INVALID" });
    await expect(verifyPaperSeal("CRD1:!", { trustStore })).resolves.toMatchObject({ verdict: "INVALID" });
    await expect(verifyPaperSeal("CRD1:000", { trustStore })).resolves.toMatchObject({ verdict: "INVALID" });
  });

  it("rejects input larger than the profile limit before deep parsing", () => {
    expect(() => decodePaperSeal(new TextEncoder().encode(`CRD1:${"0".repeat(4_000)}`))).toThrow(/1200|maximum/i);
  });

  it("includes only approved optional references and excludes source-document fields", async () => {
    const descriptorWithExtras = {
      ...descriptor,
      statusUrl: "https://issuer.example/status/INV-2026-82919",
      fullDocument: "do-not-include-this",
      privateNote: "do-not-include-this-either",
    };
    const encoded = await encodePaperSeal(descriptorWithExtras, createSigner(), { artifactDigest: "sha256:0123456789abcdef" });
    const decoded = decodePaperSeal(encoded.transport);

    expect(decoded.profile.statusUrl).toBe("https://issuer.example/status/INV-2026-82919");
    expect(decoded.profile.artifactDigest).toBe("sha256:0123456789abcdef");
    expect(new TextDecoder().decode(decoded.payload)).not.toContain("do-not-include-this");
  });

  it("accepts digitalArtifactDigest as the canonical artifact-link option", async () => {
    const encoded = await encodePaperSeal(descriptor, createSigner(), { digitalArtifactDigest: "sha256:feedface" });
    const decoded = decodePaperSeal(encoded.transport);

    expect(decoded.profile.artifactDigest).toBe("sha256:feedface");
  });
});

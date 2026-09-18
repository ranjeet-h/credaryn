import { describe, expect, it } from "vitest";
import type { SignerProvider, TrustStore, VerificationResult } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import {
  VerificationInputError,
  applyStatusResolver,
  createVerifier,
  detectInput,
  normalizeVerificationResult,
} from "../src/index.js";

const pdfEngine: PdfSignatureEngine = {
  sign: async (input) => input,
  verify: async () => ({ cryptographicValidity: "VALID", artifactIntegrity: "VALID" }),
};

const paperSigner: SignerProvider = {
  getKeyInfo: async () => ({
    issuerId: "test",
    keyId: "test",
    algorithm: "ES256",
    publicKey: new Uint8Array(),
  }),
  sign: async () => new Uint8Array(),
};

const trustStore: TrustStore = { resolve: async () => undefined };

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const baseResult: VerificationResult = {
  verdict: "VALID_TRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "TRUSTED",
  lifecycleStatus: "UNCHECKED",
  securityMode: "PAPER_CLAIMS_ONLY",
  evidence: [],
};

describe("unified verifier dispatch edges", () => {
  it("reports an invalid paper image instead of throwing", async () => {
    const verifier = createVerifier({ pdfEngine, paperSigner, trustStore });

    const result = await verifier.verifyPaperImage(new Uint8Array([1, 2, 3]));

    expect(result).toMatchObject({
      verdict: "INVALID",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
    });
    expect(result.evidence).toContainEqual(expect.objectContaining({ code: "PAPER_IMAGE_INVALID" }));
  });

  it("rejects non-byte input and ambiguous text before parsing", () => {
    expect(() => detectInput(null as unknown as Uint8Array)).toThrow(VerificationInputError);
    expect(() => detectInput(new TextEncoder().encode("hello"), "text/plain")).toThrow(/does not start with CRD1/);
  });

  it("normalizes an empty content type and detects image magic bytes", () => {
    expect(detectInput(PNG_MAGIC, "  ")).toBe("paper-image");
    expect(detectInput(PNG_MAGIC, "image/png")).toBe("paper-image");
  });

  it("forwards a trust store through the direct PDF entry point", async () => {
    const verifier = createVerifier({ pdfEngine, paperSigner, trustStore });

    await expect(verifier.verifyPdf(new TextEncoder().encode("%PDF-1.7"), trustStore)).resolves.toMatchObject({
      verdict: "UNVERIFIABLE",
    });
  });
});

describe("paper result normalization and status edges", () => {
  it("preserves optional lifecycle and status fields when normalizing", () => {
    const normalized = normalizeVerificationResult({
      ...baseResult,
      keyLifecycleState: "REVOKED",
      statusUrl: "https://status.example.test/INV-2026-82919",
      documentId: "INV-2026-82919",
      signedClaims: { totalMinor: 1, currency: "INR" },
    });

    expect(normalized.keyLifecycleState).toBe("REVOKED");
    expect(normalized.statusUrl).toBe("https://status.example.test/INV-2026-82919");
    expect(Object.keys(normalized.signedClaims ?? {})).toEqual(["currency", "totalMinor"]);
  });

  it("leaves the result unchanged when the document reference is missing", async () => {
    const withIssuer: VerificationResult = { ...baseResult, issuerId: "acme-retail" };

    const result = await applyStatusResolver(withIssuer, async () => ({ status: "REVOKED", freshness: "FRESH" }));

    expect(result).toBe(withIssuer);
  });
});

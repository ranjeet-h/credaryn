import { describe, expect, it } from "vitest";
import type { SignerProvider, TrustStore } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import {
  MAX_PAPER_IMAGE_BYTES,
  MAX_PAPER_TEXT_BYTES,
  MAX_PDF_BYTES,
  VerificationInputError,
  createVerifier,
  detectInput,
} from "../src/index.js";

describe("unified verifier input limits", () => {
  it("rejects unsupported content types before parsing", () => {
    expect(() => detectInput(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "image/jpeg")).toThrow(VerificationInputError);
    expect(() => detectInput(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "image/jpeg")).toThrow(/unsupported content type/i);
  });

  it("rejects content-type and magic-byte ambiguity before deep parsing", () => {
    expect(() => detectInput(new TextEncoder().encode("CRD1:!"), "application/pdf")).toThrow(/does not match/i);
    expect(() => detectInput(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "text/plain")).toThrow(/does not match/i);
  });

  it("rejects oversized PDF and image inputs before invoking an engine", async () => {
    let verifyCalls = 0;
    const verifier = createVerifier({
      pdfEngine: {
        sign: async (input) => input,
        verify: async () => {
          verifyCalls += 1;
          return { cryptographicValidity: "VALID", artifactIntegrity: "VALID" };
        },
      } satisfies PdfSignatureEngine,
      paperSigner: {
        getKeyInfo: async () => ({
          issuerId: "test",
          keyId: "test",
          algorithm: "ES256" as const,
          publicKey: new Uint8Array(),
        }),
        sign: async () => new Uint8Array(),
      } satisfies SignerProvider,
      trustStore: { resolve: async () => undefined } satisfies TrustStore,
    });

    await expect(verifier.verifyInput({
      bytes: new Uint8Array(MAX_PDF_BYTES + 1),
      contentType: "application/pdf",
    })).rejects.toThrow(/maximum.*16 MiB/i);
    await expect(verifier.verifyInput({
      bytes: new Uint8Array(MAX_PAPER_IMAGE_BYTES + 1),
      contentType: "image/png",
    })).rejects.toThrow(/maximum.*4 MiB/i);
    expect(verifyCalls).toBe(0);
  });

  it("detects only supported PDF, CRD1 text and PNG inputs", () => {
    expect(detectInput(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(detectInput(new TextEncoder().encode("CRD1:0"))).toBe("paper-text");
    expect(detectInput(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("paper-image");
    expect(() => detectInput(new TextEncoder().encode("not a supported document"))).toThrow(/unable to identify/i);
  });

  it("applies the detected format limit when content type is omitted", () => {
    const oversizedPng = new Uint8Array(MAX_PAPER_IMAGE_BYTES + 1);
    oversizedPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => detectInput(oversizedPng)).toThrow(/maximum size of 4 MiB/i);
    expect(() => detectInput(new TextEncoder().encode(`CRD1:${"0".repeat(MAX_PAPER_TEXT_BYTES)}`))).toThrow(/maximum size of 64 KiB/i);
  });

  it("bounds the direct verifier entry points before deep parsing", async () => {
    const verifier = createVerifier({
      pdfEngine: {
        sign: async (input) => input,
        verify: async () => ({ cryptographicValidity: "VALID", artifactIntegrity: "VALID" }),
      } satisfies PdfSignatureEngine,
      paperSigner: {
        getKeyInfo: async () => ({
          issuerId: "test",
          keyId: "test",
          algorithm: "ES256" as const,
          publicKey: new Uint8Array(),
        }),
        sign: async () => new Uint8Array(),
      } satisfies SignerProvider,
      trustStore: { resolve: async () => undefined } satisfies TrustStore,
    });

    await expect(verifier.verifyPdf(new Uint8Array(MAX_PDF_BYTES + 1))).rejects.toThrow(/maximum size of 16 MiB/i);
    await expect(verifier.verifyPaperText("CRD1:" + "0".repeat(MAX_PAPER_TEXT_BYTES))).rejects.toThrow(/maximum size of 64 KiB/i);
    await expect(verifier.verifyPaperImage(new Uint8Array(MAX_PAPER_IMAGE_BYTES + 1))).rejects.toThrow(/maximum size of 4 MiB/i);
  });
});

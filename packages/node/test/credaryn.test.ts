import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, SignerProvider, TrustStore } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import { Credaryn } from "../src/credaryn.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keyInfo = {
  issuerId: "acme-retail",
  keyId: "phase-2-node",
  algorithm: "ES256" as const,
  publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
};
const signer: SignerProvider = {
  getKeyInfo: async () => keyInfo,
  sign: async (input) => {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(privateKey));
  },
};

const trustStore: TrustStore = { resolve: async () => undefined };

describe("Credaryn SDK skeleton", () => {
  it("constructs with the locked dependency shape and exposes the four primary methods", () => {
    const sdk = new Credaryn({
      pdfEngine: createPdfEngine(),
      paperSigner: signer,
      trustStore,
    });

    expect(sdk).toEqual(expect.any(Credaryn));
    expect(sdk.sealPdf).toEqual(expect.any(Function));
    expect(sdk.verifyPdf).toEqual(expect.any(Function));
    expect(sdk.createPaperSeal).toEqual(expect.any(Function));
    expect(sdk.verifyPaperSeal).toEqual(expect.any(Function));
  });

  it("validates descriptors before invoking the PDF engine", async () => {
    let signCalls = 0;
    const sdk = new Credaryn({
      pdfEngine: {
        sign: async (input: Uint8Array) => {
          signCalls += 1;
          return input;
        },
        verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
      },
      paperSigner: signer,
      trustStore,
    });

    await expect(sdk.sealPdf(new Uint8Array([1]), { ...descriptor, claims: { totalMinor: 1.5 } })).rejects.toThrow(
      /claims\.totalMinor/,
    );
    expect(signCalls).toBe(0);
  });

  it("creates and verifies a signed paper seal through the Node façade", async () => {
    const sdk = new Credaryn({
      pdfEngine: createPdfEngine(),
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, trustSource: "phase-2-test-trust" },
    });

    const seal = await sdk.createPaperSeal(descriptor);
    await expect(sdk.verifyPaperSeal(seal)).resolves.toMatchObject({
      verdict: "VALID_TRUSTED",
      issuerId: "acme-retail",
      keyId: "phase-2-node",
      signedClaims: descriptor.claims,
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
    });
  });

  it("delegates PDF bytes through the byte-only engine and normalizes verification", async () => {
    const sdk = new Credaryn({ pdfEngine: createPdfEngine(), paperSigner: signer, trustStore });
    const bytes = new Uint8Array([37, 80, 68, 70]);

    await expect(sdk.sealPdf(bytes, descriptor)).resolves.toEqual(bytes);
    await expect(sdk.verifyPdf(bytes)).resolves.toMatchObject({
      verdict: "UNVERIFIABLE",
      securityMode: "DIGITAL_ARTIFACT_SIGNED",
      artifactIntegrity: "UNKNOWN",
    });
  });

  it("maps a valid PDF proof to trusted or untrusted without changing lifecycle", async () => {
    const validEngine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        issuerId: "acme-retail",
        keyId: "phase-1",
      }),
    };
    const trustedKey = await signer.getKeyInfo();
    const trustedStore: TrustStore = { resolve: async () => trustedKey };
    const trustedSdk = new Credaryn({ pdfEngine: validEngine, paperSigner: signer, trustStore: trustedStore });
    const untrustedSdk = new Credaryn({ pdfEngine: validEngine, paperSigner: signer, trustStore });

    await expect(trustedSdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "VALID_TRUSTED",
      lifecycleStatus: "UNCHECKED",
      artifactIntegrity: "VALID",
    });
    await expect(untrustedSdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "VALID_UNTRUSTED",
      lifecycleStatus: "UNCHECKED",
    });
  });
});

function createPdfEngine(): PdfSignatureEngine {
  return {
    sign: async (input) => input,
    verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
  };
}

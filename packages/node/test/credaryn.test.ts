import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  KeyLifecycleError,
  KeyLifecycleRegistry,
  type DocumentDescriptor,
  type KeyVersionRecord,
  type SignerProvider,
  type TrustStore,
} from "@credaryn/core";
import type { PdfSignatureEngine, PdfSigningRequest } from "@credaryn/pdf";
import { Credaryn } from "../src/credaryn.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000, currency: "INR" },
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
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => true, trustSource: "phase-2-test-trust" },
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
    const trustedStore: TrustStore = { resolve: async () => trustedKey, isTrusted: async () => true };
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

  it("honors an explicit PDF trust policy rejection", async () => {
    const validEngine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        issuerId: keyInfo.issuerId,
        keyId: keyInfo.keyId,
      }),
    };
    const sdk = new Credaryn({
      pdfEngine: validEngine,
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => false },
    });

    await expect(sdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "VALID_UNTRUSTED",
      trustDecision: "UNTRUSTED",
    });
  });

  it("fails closed when PDF trust evaluation throws", async () => {
    const validEngine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        issuerId: keyInfo.issuerId,
        keyId: keyInfo.keyId,
      }),
    };
    const sdk = new Credaryn({
      pdfEngine: validEngine,
      paperSigner: signer,
      trustStore: {
        resolve: async () => keyInfo,
        isTrusted: async () => { throw new Error("trust resolver unavailable"); },
      },
    });

    await expect(sdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "UNVERIFIABLE",
      trustDecision: "MISSING",
    });
  });

  it("forwards the expected descriptor when verifying a paper seal", async () => {
    const sdk = new Credaryn({
      pdfEngine: createPdfEngine(),
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo },
    });
    const seal = await sdk.createPaperSeal(descriptor);

    await expect(sdk.verifyPaperSeal(seal, {
      expectedDescriptor: { ...descriptor, documentId: "a-different-document" },
    })).resolves.toMatchObject({ verdict: "INVALID" });
  });

  it("returns INVALID when PDF artifact integrity is invalid despite a trusted signature", async () => {
    const engine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "VALID",
        artifactIntegrity: "INVALID",
        issuerId: keyInfo.issuerId,
        keyId: keyInfo.keyId,
      }),
    };
    const sdk = new Credaryn({
      pdfEngine: engine,
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => true },
    });

    await expect(sdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "INVALID",
      artifactIntegrity: "INVALID",
    });
  });

  it("keeps development statusUrl validation consistent between SDK and paper encoding", async () => {
    const sdk = new Credaryn({
      pdfEngine: createPdfEngine(),
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => true },
      environment: "development",
    });

    const developmentDescriptor = {
      ...descriptor,
      statusUrl: "http://localhost:8080/status/INV-2026-82919",
    };
    await expect(sdk.createPaperSeal(developmentDescriptor)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("fails fast when PAdES B-T is requested from an engine without timestamp support", async () => {
    const sdk = new Credaryn({ pdfEngine: createPdfEngine(), paperSigner: signer, trustStore });

    await expect(sdk.sealPdf(new Uint8Array([37]), descriptor, {
      timestampAuthorityUrl: "https://tsa.example.test",
    })).rejects.toThrow(/supportsTimestamping/);
  });

  it("passes level B-T to a timestamp-capable engine", async () => {
    let received: PdfSigningRequest | undefined;
    const engine: PdfSignatureEngine & { supportsTimestamping: boolean } = {
      supportsTimestamping: true,
      sign: async (input, request) => {
        received = request;
        return input;
      },
      verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
    };
    const sdk = new Credaryn({ pdfEngine: engine, paperSigner: signer, trustStore });

    await expect(sdk.sealPdf(new Uint8Array([37]), descriptor, {
      timestampAuthorityUrl: "https://tsa.example.test",
    })).resolves.toEqual(new Uint8Array([37]));
    expect(received?.level).toBe("B-T");
  });

  it("rejects signing with a key that is not ACTIVE when a lifecycle registry is configured", async () => {
    const registry = new KeyLifecycleRegistry();
    registry.authorize(lifecycleRecord("phase-2-node", "v1"));
    const sdk = new Credaryn({ pdfEngine: createPdfEngine(), paperSigner: signer, trustStore, keyLifecycle: registry });

    await expect(sdk.createPaperSeal(descriptor)).rejects.toThrowError(KeyLifecycleError);
    await expect(sdk.sealPdf(new Uint8Array([37]), descriptor)).rejects.toThrow(/not ACTIVE/);
  });

  it("allows an ACTIVE key to sign and exposes its lifecycle state on verification", async () => {
    const registry = new KeyLifecycleRegistry();
    const authorized = registry.authorize(lifecycleRecord("phase-2-node", "v1"));
    registry.activate(authorized.identity);
    const sdk = new Credaryn({
      pdfEngine: createPdfEngine(),
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => true },
      keyLifecycle: registry,
    });

    const seal = await sdk.createPaperSeal(descriptor);
    await expect(sdk.verifyPaperSeal(seal)).resolves.toMatchObject({
      verdict: "VALID_TRUSTED",
      keyLifecycleState: "ACTIVE",
    });
  });

  it("reports a RETIRED key lifecycle state on verification and refuses to sign with it", async () => {
    const registry = new KeyLifecycleRegistry();
    const authorized = registry.authorize(lifecycleRecord("phase-2-node", "v1"));
    registry.activate(authorized.identity);
    registry.retire(authorized.identity);
    const engine: PdfSignatureEngine = {
      sign: async (input) => input,
      verify: async () => ({
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        issuerId: keyInfo.issuerId,
        keyId: keyInfo.keyId,
      }),
    };
    const sdk = new Credaryn({
      pdfEngine: engine,
      paperSigner: signer,
      trustStore: { resolve: async () => keyInfo, isTrusted: async () => true },
      keyLifecycle: registry,
    });

    await expect(sdk.verifyPdf(new Uint8Array([37]))).resolves.toMatchObject({
      verdict: "VALID_TRUSTED",
      keyLifecycleState: "RETIRED",
    });
    await expect(sdk.sealPdf(new Uint8Array([37]), descriptor)).rejects.toThrow(/not ACTIVE/);
  });

  it("rejects a Minor money claim without a co-located ISO currency at the issuance boundary", async () => {
    const sdk = new Credaryn({ pdfEngine: createPdfEngine(), paperSigner: signer, trustStore });

    await expect(sdk.sealPdf(new Uint8Array([37]), {
      ...descriptor,
      claims: { invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
    })).rejects.toThrow(/currency/);
  });
});

function lifecycleRecord(keyId: string, version: string): KeyVersionRecord {
  return {
    identity: {
      issuerId: keyInfo.issuerId,
      keyId,
      version,
      certificateFingerprint: "sha256:node-lifecycle",
    },
    keyInfo: { ...keyInfo, keyId },
    authorizedAt: "2026-01-01T00:00:00Z",
  };
}

function createPdfEngine(): PdfSignatureEngine {
  return {
    sign: async (input) => input,
    verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
  };
}

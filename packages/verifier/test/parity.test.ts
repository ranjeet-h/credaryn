import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SignerProvider, TrustStore } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import { vectorKeyInfo, vectorSigner } from "../../paper/scripts/vector-fixture.js";
import { createVerifier, type Verifier } from "../src/index.js";

const repositoryRoot = new URL("../../../", import.meta.url);
const paperTransportUrl = new URL("test-vectors/paper-v1/transport.txt", repositoryRoot);
const pdfVectorUrl = new URL("test-vectors/pdf/invoice-11800.pdf", repositoryRoot);
const mutatedPdfUrl = new URL("test-vectors/pdf/invoice-11800-mutated.pdf", repositoryRoot);

describe("unified verifier parity", () => {
  it("normalizes original and mutated PDF results through the shared verifier", async () => {
    const original = new Uint8Array(await readFile(pdfVectorUrl));
    const mutated = new Uint8Array(await readFile(mutatedPdfUrl));
    const verifier = createFixtureVerifier({
      pdfDigest: digest(original),
    });

    const originalResult = await verifier.verifyInput({ bytes: original, contentType: "application/pdf" });
    const mutatedResult = await verifier.verifyInput({ bytes: mutated, contentType: "application/pdf" });

    expect(originalResult).toMatchObject({
      verdict: "VALID_TRUSTED",
      lifecycleStatus: "UNCHECKED",
      securityMode: "DIGITAL_ARTIFACT_SIGNED",
      artifactIntegrity: "VALID",
      trustSource: "phase-4-test-trust",
      issuerId: "acme-retail",
      keyId: "dss-demo-key",
    });
    expect(mutatedResult).toMatchObject({
      verdict: "INVALID",
      lifecycleStatus: "UNCHECKED",
      securityMode: "DIGITAL_ARTIFACT_SIGNED",
      artifactIntegrity: "INVALID",
    });
  });

  it("returns trusted and untrusted paper results with the same signed claims", async () => {
    const transport = (await readFile(paperTransportUrl, "utf8")).trim();
    const trustedVerifier = createFixtureVerifier();
    const untrustedVerifier = createFixtureVerifier({
      isTrusted: async () => false,
    });

    const trusted = await trustedVerifier.verifyInput({
      bytes: new TextEncoder().encode(transport),
      contentType: "text/vnd.credaryn.crd1",
    });
    const untrusted = await untrustedVerifier.verifyInput({
      bytes: new TextEncoder().encode(transport),
      contentType: "text/vnd.credaryn.crd1",
    });

    expect(trusted).toMatchObject({
      verdict: "VALID_TRUSTED",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: "acme-retail",
      keyId: "phase-2-vector",
      signedClaims: {
        currency: "INR",
        invoiceNumber: "INV-2026-82919",
        totalMinor: 1_180_000,
      },
    });
    expect(untrusted).toMatchObject({
      ...trusted,
      verdict: "VALID_UNTRUSTED",
      trustDecision: "UNTRUSTED",
    });
  });

  it("accepts normal text-file whitespace around a CRD1 transport", async () => {
    const transportWithNewline = new Uint8Array(await readFile(paperTransportUrl));

    await expect(createFixtureVerifier().verifyInput({
      bytes: transportWithNewline,
      contentType: "text/vnd.credaryn.crd1",
    })).resolves.toMatchObject({ verdict: "VALID_TRUSTED" });
  });

  it("classifies malformed CRD1 input as invalid through the same dispatch path", async () => {
    const result = await createFixtureVerifier().verifyInput({
      bytes: new TextEncoder().encode("CRD1:!"),
      contentType: "text/vnd.credaryn.crd1",
    });

    expect(result).toMatchObject({
      verdict: "INVALID",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
    });
  });

  it("does not call a valid PDF trusted when no trust material is configured", async () => {
    const original = new Uint8Array(await readFile(pdfVectorUrl));
    const verifier = createFixtureVerifier({
      pdfDigest: digest(original),
      resolve: async () => undefined,
      trustSource: "no-trust-material",
    });

    await expect(verifier.verifyInput({ bytes: original, contentType: "application/pdf" })).resolves.toMatchObject({
      verdict: "UNVERIFIABLE",
      trustSource: "no-trust-material",
    });
  });
});

function createFixtureVerifier(options: Partial<TrustStore> & { pdfDigest?: string } = {}): Verifier {
  const trustStore: TrustStore = {
    ...options,
    resolve: options.resolve ?? (async (keyId, issuerId) => (keyId === vectorKeyInfo.keyId || keyId === "dss-demo-key") && issuerId === vectorKeyInfo.issuerId
      ? vectorKeyInfo
      : undefined),
    isTrusted: options.isTrusted ?? (async () => true),
    trustSource: options.trustSource ?? "phase-4-test-trust",
  };
  const pdfEngine: PdfSignatureEngine = {
    sign: async (input) => input,
    verify: async (input) => {
      const isOriginal = options.pdfDigest !== undefined && digest(input) === options.pdfDigest;
      return {
        cryptographicValidity: isOriginal ? "VALID" : "INVALID",
        artifactIntegrity: isOriginal ? "VALID" : "INVALID",
        issuerId: "acme-retail",
        keyId: "dss-demo-key",
      };
    },
  };
  return createVerifier({ pdfEngine, paperSigner: vectorSigner, trustStore });
}

function digest(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

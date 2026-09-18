import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { TrustStore } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import { vectorDescriptor, vectorKeyInfo, vectorSigner } from "../../paper/scripts/vector-fixture.js";
import { createVerifier, type Verifier } from "../src/index.js";

const transportUrl = new URL("../../../test-vectors/paper-v1/transport.txt", import.meta.url);
const contentType = "text/vnd.credaryn.crd1";

const pdfEngine: PdfSignatureEngine = {
  sign: async (input) => input,
  verify: async () => ({ cryptographicValidity: "VALID", artifactIntegrity: "VALID" }),
};

const trustStore: TrustStore = {
  resolve: async (keyId, issuerId) => keyId === vectorKeyInfo.keyId && issuerId === vectorKeyInfo.issuerId
    ? vectorKeyInfo
    : undefined,
  isTrusted: async () => true,
  trustSource: "phase-4-test-trust",
};

describe("expected descriptor binding through the unified verifier", () => {
  it("rejects a copied seal when the expected descriptor names a different document", async () => {
    const verifier = createFixtureVerifier();

    const result = await verifier.verifyInput({
      bytes: new TextEncoder().encode(await transport()),
      contentType,
      expectedDescriptor: { ...vectorDescriptor, documentId: "INV-2026-82920" },
    });

    expect(result.verdict).toBe("INVALID");
    expect(result.evidence).toContainEqual(expect.objectContaining({ code: "PAPER_DOCUMENT_MISMATCH" }));
    expect(result).not.toHaveProperty("signedClaims");
  });

  it("accepts the seal when the expected descriptor matches the signed document", async () => {
    const verifier = createFixtureVerifier();

    const result = await verifier.verifyInput({
      bytes: new TextEncoder().encode(await transport()),
      contentType,
      expectedDescriptor: vectorDescriptor,
    });

    expect(result.verdict).toBe("VALID_TRUSTED");
    expect(result.documentId ?? vectorDescriptor.documentId).toBe(vectorDescriptor.documentId);
  });

  it("forwards the expected descriptor through the direct paper entry points", async () => {
    const verifier = createFixtureVerifier();

    const textResult = await verifier.verifyPaperText(await transport(), undefined, {
      ...vectorDescriptor,
      documentId: "INV-2026-82920",
    });
    expect(textResult.verdict).toBe("INVALID");

    const imageResult = await verifier.verifyPaperImage(await pngBytes(), undefined, {
      ...vectorDescriptor,
      documentId: "INV-2026-82920",
    });
    expect(imageResult.verdict).toBe("INVALID");
  });
});

function createFixtureVerifier(): Verifier {
  return createVerifier({ pdfEngine, paperSigner: vectorSigner, trustStore });
}

async function transport(): Promise<string> {
  return (await readFile(transportUrl, "utf8")).trim();
}

async function pngBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL("../../../test-vectors/paper-v1/qr-512.png", import.meta.url)));
}

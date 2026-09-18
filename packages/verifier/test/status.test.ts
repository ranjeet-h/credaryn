import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { TrustStore, VerificationResult } from "@credaryn/core";
import type { PdfSignatureEngine } from "@credaryn/pdf";
import { vectorKeyInfo, vectorSigner } from "../../paper/scripts/vector-fixture.js";
import { applyStatusResolver, createVerifier, type StatusResolver } from "../src/index.js";

const baseResult: VerificationResult = {
  verdict: "VALID_TRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "TRUSTED",
  lifecycleStatus: "UNCHECKED",
  securityMode: "PAPER_CLAIMS_ONLY",
  artifactIntegrity: "NOT_APPLICABLE",
  evidence: [{ code: "PAPER_VALID", message: "Paper Seal cryptographic validity is valid" }],
};

function withDocument(result: VerificationResult, documentId: string, statusUrl?: string): VerificationResult {
  return { ...result, issuerId: "acme-retail", keyId: "phase-2-vector", documentId, ...(statusUrl === undefined ? {} : { statusUrl }) };
}

describe("status resolver integration", () => {
  it("sets the lifecycle status and adds evidence without changing the verdict", async () => {
    const calls: Array<Parameters<StatusResolver>[0]> = [];
    const resolver: StatusResolver = async (input) => {
      calls.push(input);
      return { status: "REVOKED", freshness: "FRESH" };
    };

    const result = await applyStatusResolver(withDocument(baseResult, "INV-2026-82919", "https://status.example.test/INV-2026-82919"), resolver);

    expect(calls).toEqual([{
      issuerId: "acme-retail",
      keyId: "phase-2-vector",
      documentId: "INV-2026-82919",
      statusUrl: "https://status.example.test/INV-2026-82919",
    }]);
    expect(result.lifecycleStatus).toBe("REVOKED");
    expect(result.verdict).toBe("VALID_TRUSTED");
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.trustDecision).toBe("TRUSTED");
    expect(result.evidence).toContainEqual(expect.objectContaining({ code: "STATUS_REVOKED" }));
  });

  it("stays UNCHECKED when the result has no document reference", async () => {
    let called = 0;
    const resolver: StatusResolver = async () => {
      called += 1;
      return { status: "REVOKED", freshness: "FRESH" };
    };

    const result = await applyStatusResolver(baseResult, resolver);

    expect(called).toBe(0);
    expect(result.lifecycleStatus).toBe("UNCHECKED");
    expect(result.evidence).toEqual(baseResult.evidence);
  });

  it("stays UNCHECKED when the status resolver fails", async () => {
    const resolver: StatusResolver = async () => {
      throw new Error("status service unavailable");
    };

    const result = await applyStatusResolver(withDocument(baseResult, "INV-2026-82919"), resolver);

    expect(result.lifecycleStatus).toBe("UNCHECKED");
    expect(result.verdict).toBe("VALID_TRUSTED");
  });

  it("stays UNCHECKED when status freshness is unavailable", async () => {
    const resolver: StatusResolver = async () => ({ status: "ACTIVE", freshness: "UNAVAILABLE" });

    const result = await applyStatusResolver(withDocument(baseResult, "INV-2026-82919"), resolver);

    expect(result.lifecycleStatus).toBe("UNCHECKED");
    expect(result.verdict).toBe("VALID_TRUSTED");
  });

  it("is a no-op when no status resolver is configured", async () => {
    const input = withDocument(baseResult, "INV-2026-82919");
    const result = await applyStatusResolver(input, undefined);

    expect(result).toBe(input);
    expect(result.lifecycleStatus).toBe("UNCHECKED");
  });

  it("applies a configured status resolver through the unified verifier", async () => {
    const transport = (await readFile(new URL("../../../test-vectors/paper-v1/transport.txt", import.meta.url), "utf8")).trim();
    let seen: Parameters<StatusResolver>[0] | undefined;
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
    const verifier = createVerifier({
      pdfEngine,
      paperSigner: vectorSigner,
      trustStore,
      statusResolver: async (input) => {
        seen = input;
        return { status: "CANCELLED", freshness: "FRESH" };
      },
    });

    const result = await verifier.verifyInput({
      bytes: new TextEncoder().encode(transport),
      contentType: "text/vnd.credaryn.crd1",
    });

    expect(seen).toMatchObject({ issuerId: "acme-retail", documentId: "INV-2026-82919" });
    expect(result.lifecycleStatus).toBe("CANCELLED");
    expect(result.verdict).toBe("VALID_TRUSTED");
    expect(result.cryptographicValidity).toBe("VALID");
  });
});

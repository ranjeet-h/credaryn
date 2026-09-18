import { describe, expect, it } from "vitest";
import type { SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import { DssPdfSignatureEngine } from "../src/dss-engine.js";

const keyInfo: SignerKeyInfo = {
  issuerId: "acme-retail",
  keyId: "dss-test-key",
  algorithm: "ES256",
  publicKey: new Uint8Array([1, 2, 3]),
};

const signer: SignerProvider = {
  getKeyInfo: async () => keyInfo,
  sign: async (input) => input,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DSS PDF engine boundary", () => {
  it("sends normalized bytes and B-B metadata to the DSS sidecar", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response({
          status: "signed",
          signedPdfBase64: Buffer.from([4, 5, 6]).toString("base64"),
          cryptographicValidity: "VALID",
          artifactIntegrity: "VALID",
          issuerId: keyInfo.issuerId,
          keyId: keyInfo.keyId,
          signatureLevel: "B-B",
          qualifiedSignature: false,
        });
      },
    });

    const signed = await engine.sign(new Uint8Array([1, 2, 3]), {
      signer,
      level: "B-B",
      artifactDigest: "sha256:fixture",
    });

    expect(signed).toEqual(new Uint8Array([4, 5, 6]));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:8080/v1/sign");
    expect(requests[0]?.body).toMatchObject({
      operation: "sign",
      pdfBase64: Buffer.from([1, 2, 3]).toString("base64"),
      signatureRequest: { level: "B-B", artifactDigest: "sha256:fixture" },
      signer: { issuerId: "acme-retail", keyId: "dss-test-key", algorithm: "ES256" },
    });
  });

  it("normalizes DSS validation and never marks PAdES as qualified by default", async () => {
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080/",
      fetchImpl: async () => response({
        cryptographicValidity: "VALID",
        artifactIntegrity: "INVALID",
        issuerId: "acme-retail",
        keyId: "dss-test-key",
        signatureLevel: "B-B",
        qualifiedSignature: false,
      }),
    });
    const trustStore: TrustStore = { resolve: async () => keyInfo };

    await expect(engine.verify(new Uint8Array([9]), { trustStore })).resolves.toEqual({
      cryptographicValidity: "VALID",
      artifactIntegrity: "INVALID",
      issuerId: "acme-retail",
      keyId: "dss-test-key",
    });
  });

  it("normalizes an unsigned or unknown-level artifact as invalid", async () => {
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      fetchImpl: async () => response({
        cryptographicValidity: "INVALID",
        artifactIntegrity: "INVALID",
        signatureLevel: "UNKNOWN",
        qualifiedSignature: false,
      }),
    });

    await expect(engine.verify(new Uint8Array([9]), { trustStore: { resolve: async () => undefined } })).resolves.toEqual({
      cryptographicValidity: "INVALID",
      artifactIntegrity: "INVALID",
    });
  });

  it("includes a bounded DSS error body when the sidecar rejects a request", async () => {
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      fetchImpl: async () => response({ error: "signer_identity_mismatch" }, 400),
    });

    await expect(engine.sign(new Uint8Array([37, 80, 68, 70]), {
      signer,
      level: "B-B",
      artifactDigest: "sha256:fixture",
    })).rejects.toThrow("DSS sidecar returned HTTP 400: {\"error\":\"signer_identity_mismatch\"}");
  });

  it("rejects a qualified-signature claim and any unsupported PAdES level", async () => {
    const qualifiedResponse = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      fetchImpl: async () => response({
        status: "signed",
        signedPdfBase64: Buffer.from([4]).toString("base64"),
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        signatureLevel: "B-B",
        qualifiedSignature: true,
      }),
    });
    await expect(qualifiedResponse.sign(new Uint8Array([37, 80, 68, 70]), {
      signer,
      level: "B-B",
      artifactDigest: "sha256:fixture",
    })).rejects.toThrow(/qualified electronic-signature/);

    const engine = new DssPdfSignatureEngine({ endpoint: "http://127.0.0.1:8080", fetchImpl: async () => response({}) });
    await expect(engine.sign(new Uint8Array([37, 80, 68, 70]), {
      signer,
      level: "B-T",
      artifactDigest: "sha256:fixture",
    })).rejects.toThrow(/RFC 3161 TSA/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import { DssPdfSignatureEngine } from "../src/dss-engine.js";

// Tests assert capability defaults without depending on the developer's ambient
// environment; `DSS_TSA_URL` is explicitly stubbed and always restored.
afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("normalizes DSS validation and reports the artifact-derived identity, never qualified", async () => {
    const artifactIssuerId = "Credaryn Demo Issuer";
    const artifactKeyId = `sha256:${"a".repeat(64)}`;
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080/",
      fetchImpl: async () => response({
        cryptographicValidity: "VALID",
        artifactIntegrity: "INVALID",
        issuerId: artifactIssuerId,
        keyId: artifactKeyId,
        signatureLevel: "B-B",
        qualifiedSignature: false,
      }),
    });
    const trustStore: TrustStore = { resolve: async () => keyInfo };

    await expect(engine.verify(new Uint8Array([9]), { trustStore })).resolves.toEqual({
      cryptographicValidity: "VALID",
      artifactIntegrity: "INVALID",
      issuerId: artifactIssuerId,
      keyId: artifactKeyId,
    });
  });

  it("declares B-T capability only when a TSA URL is configured", () => {
    vi.stubEnv("DSS_TSA_URL", "");
    const withoutTsa = new DssPdfSignatureEngine({ endpoint: "http://127.0.0.1:8080" });
    const withOption = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      timestampAuthorityUrl: "http://127.0.0.1:3181/tsa",
    });
    vi.stubEnv("DSS_TSA_URL", "http://127.0.0.1:3181/tsa");
    const withEnv = new DssPdfSignatureEngine({ endpoint: "http://127.0.0.1:8080" });

    expect(withoutTsa.supportsTimestamping).toBe(false);
    expect(withOption.supportsTimestamping).toBe(true);
    expect(withEnv.supportsTimestamping).toBe(true);
  });

  it("rejects a TSA URL that is not HTTP(S)", () => {
    expect(() => new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      timestampAuthorityUrl: "ldap://tsa.example.test",
    })).toThrow(/TSA URL/);
  });

  it("accepts B-T at the boundary when a TSA URL is configured", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      timestampAuthorityUrl: "http://127.0.0.1:3181/tsa",
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return response({
          status: "signed",
          signedPdfBase64: Buffer.from([7, 8, 9]).toString("base64"),
          cryptographicValidity: "VALID",
          artifactIntegrity: "VALID",
          issuerId: keyInfo.issuerId,
          keyId: keyInfo.keyId,
          signatureLevel: "B-T",
          qualifiedSignature: false,
        });
      },
    });

    const signed = await engine.sign(new Uint8Array([1, 2, 3]), {
      signer,
      level: "B-T",
      artifactDigest: "sha256:fixture",
    });

    expect(signed).toEqual(new Uint8Array([7, 8, 9]));
    expect(requests[0]).toMatchObject({ signatureRequest: { level: "B-T" } });
  });

  it("rejects a signed response whose PAdES level does not match the request", async () => {
    const engine = new DssPdfSignatureEngine({
      endpoint: "http://127.0.0.1:8080",
      timestampAuthorityUrl: "http://127.0.0.1:3181/tsa",
      fetchImpl: async () => response({
        status: "signed",
        signedPdfBase64: Buffer.from([4]).toString("base64"),
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
        signatureLevel: "B-B",
        qualifiedSignature: false,
      }),
    });

    await expect(engine.sign(new Uint8Array([1]), {
      signer,
      level: "B-T",
      artifactDigest: "sha256:fixture",
    })).rejects.toThrow(/PAdES Baseline B-T/);
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

  it("rejects a qualified-signature claim and B-T without a configured TSA", async () => {
    vi.stubEnv("DSS_TSA_URL", "");
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

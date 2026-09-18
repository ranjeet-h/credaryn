import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SignerKeyInfo, SignerProvider } from "@credaryn/core";
import { createPdfKitInvoiceRenderer } from "@credaryn/pdf";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { loadInvoiceFixture } from "../src/seal.js";

/**
 * Real PAdES Baseline B-T integration.
 *
 * This is the only test that asks DSS to fetch an actual RFC 3161 timestamp. It
 * requires BOTH:
 *
 *   1. a reachable DSS 6.5 sidecar (`DSS_URL`, default http://127.0.0.1:8080)
 *      that is itself configured with `DSS_TSA_URL` and reports
 *      `"supportsTimestamping": true` from `GET /health`, and
 *   2. an RFC 3161 TSA at `DSS_TSA_URL` reachable from this host.
 *
 * When either dependency is missing the test is skipped, so the normal
 * `pnpm test` run stays offline. The timestamp is never faked: DSS itself fails
 * the signing request when it cannot obtain a token, which is exactly the
 * behaviour this test relies on. A successful B-T sign is therefore evidence
 * that a real timestamp was applied.
 */

const dssEndpoint = process.env.DSS_URL ?? "http://127.0.0.1:8080";
const tsaUrl = process.env.DSS_TSA_URL?.trim() ?? "";

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function dssSupportsTimestamping(): Promise<boolean> {
  try {
    const response = await fetch(`${dssEndpoint}/health`);
    if (!response.ok) return false;
    const health = await response.json() as { status?: unknown; supportsTimestamping?: unknown };
    return health.status === "ready" && health.supportsTimestamping === true;
  } catch {
    return false;
  }
}

const dssReady = await dssSupportsTimestamping();
const tsaReachable = tsaUrl !== "" && await probe(tsaUrl);

function dssSignerIdentity(): SignerProvider {
  const keyInfo: SignerKeyInfo = {
    issuerId: process.env.DSS_ISSUER_ID ?? "acme-retail",
    keyId: process.env.DSS_KEY_ID ?? "dss-demo-key",
    algorithm: "ES256",
    publicKey: new Uint8Array(),
  };
  return {
    getKeyInfo: async () => ({ ...keyInfo, publicKey: new Uint8Array(keyInfo.publicKey) }),
    sign: async () => {
      throw new Error("DSS owns the PDF private key; application code cannot sign locally");
    },
  };
}

describe("PAdES Baseline B-T via the real DSS boundary", () => {
  it.skipIf(!dssReady || !tsaReachable)(
    "produces and verifies a B-T signature when DSS and an RFC 3161 TSA are reachable",
    async () => {
      const fixture = await loadInvoiceFixture();
      const pdf = await createPdfKitInvoiceRenderer()(fixture.descriptor, fixture.paperSealTransport);
      const artifactDigest = `sha256:${createHash("sha256").update(pdf).digest("hex")}`;
      const engine = new DssPdfSignatureEngine({ endpoint: dssEndpoint, timestampAuthorityUrl: tsaUrl });

      const signed = await engine.sign(pdf, {
        signer: dssSignerIdentity(),
        level: "B-T",
        artifactDigest,
      });

      // The engine boundary does not surface the level on verification, so read
      // the normalized sidecar response directly to prove the artifact is B-T.
      const verifyResponse = await fetch(`${dssEndpoint}/v1/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "verify",
          pdfBase64: Buffer.from(signed).toString("base64"),
        }),
      });
      expect(verifyResponse.ok).toBe(true);
      expect(await verifyResponse.json()).toMatchObject({ signatureLevel: "B-T" });

      await expect(engine.verify(signed, { trustStore: { resolve: async () => undefined } })).resolves.toMatchObject({
        cryptographicValidity: "VALID",
        artifactIntegrity: "VALID",
      });
    },
  );
});

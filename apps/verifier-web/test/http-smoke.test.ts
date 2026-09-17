import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import type { ClientRequest } from "node:http";
import type { VerificationResult } from "@credaryn/core";
import { createVerifierServer, MAX_WEB_REQUEST_BYTES } from "../src/server.js";

const result: VerificationResult = {
  verdict: "VALID_TRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "TRUSTED",
  lifecycleStatus: "UNCHECKED",
  issuerId: "acme-retail",
  keyId: "phase-4-test",
  trustSource: "phase-4-test-trust",
  securityMode: "DIGITAL_ARTIFACT_SIGNED",
  artifactIntegrity: "VALID",
  evidence: [{ code: "PDF_VALID", message: "PDF cryptographic validity is valid" }],
};

const servers: ReturnType<typeof createVerifierServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

describe("verifier web HTTP surface", () => {
  it("serves health, static UI and normalized PDF/paper verification responses", async () => {
    const calls: Uint8Array[] = [];
    const server = createVerifierServer({
      verifier: {
        verifyInput: async ({ bytes }) => {
          calls.push(bytes);
          return result;
        },
        verifyPdf: async () => result,
        verifyPaperText: async () => result,
        verifyPaperImage: async () => result,
      },
    });
    servers.push(server);
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ready", service: "credaryn-verifier" });

    const page = await fetch(`${baseUrl}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    const pageHtml = await page.text();
    expect(pageHtml).toContain("Credaryn verifier");
    expect(pageHtml).toContain("/style.css");
    expect(pageHtml).toContain("Cryptographic validity");
    expect(pageHtml).toContain("Issuer trust");
    expect(pageHtml).toContain("Artifact integrity");
    expect(pageHtml).toContain("Signed claims");
    expect(pageHtml).toContain("Lifecycle status");
    expect(pageHtml).toContain("Security mode");
    const script = await fetch(`${baseUrl}/app.js`);
    expect(script.status).toBe(200);
    expect(await script.text()).not.toMatch(/authentic/i);

    const pdf = await fetch(`${baseUrl}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: "%PDF-1.7",
    });
    expect(pdf.status).toBe(200);
    expect(await pdf.json()).toEqual(result);

    const paper = await fetch(`${baseUrl}/v1/verify/paper`, {
      method: "POST",
      headers: { "content-type": "text/vnd.credaryn.crd1" },
      body: "CRD1:!",
    });
    expect(paper.status).toBe(200);
    expect(await paper.json()).toEqual(result);
    expect(calls).toHaveLength(2);
  });

  it("rejects unsupported media and oversized bodies before verifier dispatch", async () => {
    let verifyCalls = 0;
    const server = createVerifierServer({
      verifier: {
        verifyInput: async () => {
          verifyCalls += 1;
          return result;
        },
        verifyPdf: async () => result,
        verifyPaperText: async () => result,
        verifyPaperImage: async () => result,
      },
    });
    servers.push(server);
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const unsupported = await fetch(`${baseUrl}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: "not supported",
    });
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toMatchObject({ error: { code: "UNSUPPORTED_CONTENT_TYPE" } });

    const oversized = await fetch(`${baseUrl}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(MAX_WEB_REQUEST_BYTES + 1),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: "INPUT_TOO_LARGE" } });
    expect(verifyCalls).toBe(0);
  });

  it("times out a request that never completes its body", async () => {
    const server = createVerifierServer({
      requestTimeoutMs: 10,
      verifier: {
        verifyInput: async () => result,
        verifyPdf: async () => result,
        verifyPaperText: async () => result,
        verifyPaperImage: async () => result,
      },
    });
    servers.push(server);
    const address = await listen(server);

    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      let client: ClientRequest;
      client = httpRequest({
        host: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: "/v1/verify",
        headers: { "content-type": "application/pdf" },
      }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
          client.destroy();
        });
      });
      client.on("error", reject);
      client.write("%PDF-1.7");
    });

    expect(response.status).toBe(408);
    expect(response.body).toContain("REQUEST_TIMEOUT");
  });
});

async function listen(server: ReturnType<typeof createVerifierServer>): Promise<{ port: number }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server did not expose a TCP address");
  return { port: address.port };
}

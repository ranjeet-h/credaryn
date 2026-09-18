import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { TrustStore } from "@credaryn/core";
import { createJsonLogger } from "@credaryn/observability";
import { createVerifier } from "@credaryn/verifier";
import { vectorKeyInfo, vectorSigner } from "../../../packages/paper/scripts/vector-fixture.js";
import { createStatusResolverFromEnv, createVerifierServer, startConfiguredTelemetry } from "../src/server.js";

const servers: Array<{ close(callback?: (error?: Error) => void): void }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe("createStatusResolverFromEnv", () => {
  it("is undefined when CREDARYN_STATUS_URL is unset", () => {
    expect(createStatusResolverFromEnv({})).toBeUndefined();
    expect(createStatusResolverFromEnv({ CREDARYN_STATUS_URL: "   " })).toBeUndefined();
  });

  it("queries the configured service with the document reference and parses its projection", async () => {
    const queries: URL[] = [];
    const service = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      queries.push(url);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ lifecycleStatus: "REVOKED", record: { updatedAt: new Date().toISOString() } }));
    });
    servers.push(service);
    const serviceBase = await listen(service);

    const resolver = createStatusResolverFromEnv({ CREDARYN_STATUS_URL: `${serviceBase}/v1/status` });
    expect(resolver).toBeDefined();

    const resolution = await resolver!({
      issuerId: "acme-retail",
      documentId: "INV-1",
      // A verifier configured with its own service must not follow a document-supplied URL.
      statusUrl: "https://attacker.example/status",
    });

    expect(resolution).toMatchObject({ status: "REVOKED", freshness: "FRESH" });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.pathname).toBe("/v1/status");
    expect(queries[0]?.searchParams.get("issuerId")).toBe("acme-retail");
    expect(queries[0]?.searchParams.get("documentId")).toBe("INV-1");
  });
});

describe("startConfiguredTelemetry", () => {
  it("does not enable telemetry without an OTLP endpoint", async () => {
    const handle = await startConfiguredTelemetry({});
    expect(handle.tracer).toBeUndefined();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it("never throws when telemetry cannot initialize", async () => {
    const handle = await startConfiguredTelemetry({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1" });
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});

describe("verifier-web status resolver wiring", () => {
  it("applies an injected resolver without changing cryptographic validity", async () => {
    const transport = (await readFile(new URL("../../../test-vectors/paper-v1/transport.txt", import.meta.url), "utf8")).trim();
    const pdfEngine: Parameters<typeof createVerifier>[0]["pdfEngine"] = {
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
    const seen: Array<{ issuerId: string; documentId: string }> = [];
    const verifier = createVerifier({
      pdfEngine,
      paperSigner: vectorSigner,
      trustStore,
      statusResolver: async (input) => {
        seen.push({ issuerId: input.issuerId, documentId: input.documentId });
        return { status: "REVOKED", freshness: "FRESH" };
      },
    });
    const server = createVerifierServer({ verifier, logger: createJsonLogger({ write: () => undefined }) });
    servers.push(server);
    const base = await listen(server);

    const response = await fetch(`${base}/v1/verify/paper`, {
      method: "POST",
      headers: { "content-type": "text/vnd.credaryn.crd1" },
      body: transport,
    });

    expect(response.status).toBe(200);
    const result = await response.json() as {
      verdict: string;
      cryptographicValidity: string;
      trustDecision: string;
      lifecycleStatus: string;
    };
    expect(result).toMatchObject({
      lifecycleStatus: "REVOKED",
      verdict: "VALID_TRUSTED",
      cryptographicValidity: "VALID",
      trustDecision: "TRUSTED",
    });
    expect(seen).toEqual([{ issuerId: "acme-retail", documentId: "INV-2026-82919" }]);
  });
});

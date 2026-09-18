import { afterEach, describe, expect, it } from "vitest";
import { createVerifierServer } from "../src/server.js";

const servers: ReturnType<typeof createVerifierServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("V2 verifier API metadata", () => {
  it("serves versioned health/version metadata and correlation IDs", async () => {
    const server = createVerifierServer({
      allowedOrigins: ["https://admin.example.test"],
      verifier: {
        verifyInput: async () => { throw new Error("not used"); },
        verifyPdf: async () => { throw new Error("not used"); },
        verifyPaperText: async () => { throw new Error("not used"); },
        verifyPaperImage: async () => { throw new Error("not used"); },
      },
    });
    servers.push(server);
    const address = await listen(server);
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/v1/health`, { headers: { origin: "https://admin.example.test" } });
    expect(health.status).toBe(200);
    expect(health.headers.get("x-correlation-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(await health.json()).toMatchObject({ status: "ready", service: "credaryn-verifier", apiVersion: "v1" });

    const version = await fetch(`${base}/v1/version`);
    expect(version.status).toBe(200);
    const versionPayload = await version.json() as { apiVersion: string; securityMode: string; build: unknown };
    expect(versionPayload).toMatchObject({ apiVersion: "v1", securityMode: "PAPER_CLAIMS_ONLY" });
    expect(versionPayload.build).toBeTypeOf("string");

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.status).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: "Credaryn verifier", display: "standalone" });
    const serviceWorker = await fetch(`${base}/service-worker.js`);
    expect(serviceWorker.status).toBe(200);
    expect(await serviceWorker.text()).toContain("credaryn-verifier-static-v1");

    const denied = await fetch(`${base}/v1/health`, { headers: { origin: "https://evil.example.test" } });
    expect(denied.status).toBe(403);
  });

  it("allows the same-origin browser request when no explicit CORS allowlist is configured", async () => {
    const server = createVerifierServer({
      verifier: {
        verifyInput: async () => { throw new Error("not used"); },
        verifyPdf: async () => { throw new Error("not used"); },
        verifyPaperText: async () => { throw new Error("not used"); },
        verifyPaperImage: async () => { throw new Error("not used"); },
      },
    });
    servers.push(server);
    const address = await listen(server);
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/v1/health`, {
      headers: { origin: base },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(base);
  });

  it("allows the same-origin UI even when an explicit allowlist is configured", async () => {
    const server = createVerifierServer({
      allowedOrigins: ["https://admin.example.test"],
      verifier: {
        verifyInput: async () => { throw new Error("not used"); },
        verifyPdf: async () => { throw new Error("not used"); },
        verifyPaperText: async () => { throw new Error("not used"); },
        verifyPaperImage: async () => { throw new Error("not used"); },
      },
    });
    servers.push(server);
    const address = await listen(server);
    const base = `http://127.0.0.1:${address.port}`;

    const sameOrigin = await fetch(`${base}/v1/health`, { headers: { origin: base } });
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe(base);

    const forwarded = await fetch(`${base}/v1/health`, {
      headers: { origin: `https://127.0.0.1:${address.port}`, "x-forwarded-proto": "https" },
    });
    expect(forwarded.status).toBe(200);
    expect(forwarded.headers.get("access-control-allow-origin")).toBe(`https://127.0.0.1:${address.port}`);

    const crossOrigin = await fetch(`${base}/v1/health`, { headers: { origin: "https://evil.example.test" } });
    expect(crossOrigin.status).toBe(403);
  });
});

async function listen(server: ReturnType<typeof createVerifierServer>): Promise<{ port: number }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Server did not expose a TCP address");
  return { port: address.port };
}

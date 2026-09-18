import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, createRequestHandler } from "../src/server.js";

describe("browser-print runtime security headers", () => {
  let server: Server | undefined;

  afterEach(async () => {
    const running = server;
    server = undefined;
    if (running === undefined) return;
    await new Promise<void>((resolve, reject) => {
      running.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  });

  async function start(): Promise<string> {
    const instance = createServer(createRequestHandler());
    await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
    server = instance;
    const address = instance.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  it("serves a strict CSP without unsafe-eval on the HTML shell", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy");
    expect(csp).toBe(CONTENT_SECURITY_POLICY);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("applies the same headers to JSON and error responses", async () => {
    const origin = await start();
    const notFound = await fetch(`${origin}/missing`);

    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(notFound.headers.get("x-content-type-options")).toBe("nosniff");
    expect(notFound.headers.get("referrer-policy")).toBe("no-referrer");
    await expect(notFound.json()).resolves.toMatchObject({ error: "Not found" });
  });

  it("serves the external stylesheet so style-src 'self' keeps the page styled", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/invoice.css`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(response.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    await expect(response.text()).resolves.toContain(".invoice");
  });
});

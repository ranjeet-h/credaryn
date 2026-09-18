import { describe, expect, it } from "vitest";
import { createHttpStatusResolver } from "../src/index.js";

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean; body?: ReadableStream<Uint8Array> | null } = {}): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: init.body === undefined ? new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) : init.body,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

describe("createHttpStatusResolver", () => {
  it("returns unavailable when no status URL is configured", async () => {
    const resolver = createHttpStatusResolver();
    expect(await resolver({ issuerId: "acme", documentId: "doc" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });
  });

  it("refuses non-HTTPS remote URLs without fetching", async () => {
    let called = 0;
    const resolver = createHttpStatusResolver({ fetchImpl: async () => { called += 1; return jsonResponse({ status: "ACTIVE" }); } });
    expect(await resolver({ issuerId: "acme", documentId: "doc", statusUrl: "http://issuer.example/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });
    expect(called).toBe(0);
  });

  it("resolves an HTTPS status with bounded, redirect-free fetch and freshness", async () => {
    const options: Array<Record<string, unknown>> = [];
    const resolver = createHttpStatusResolver({
      now: () => Date.parse("2026-09-17T00:05:00.000Z"),
      maxAgeMs: 60_000,
      fetchImpl: async (_url, init) => {
        options.push((init ?? {}) as Record<string, unknown>);
        return jsonResponse({ status: "REVOKED", updatedAt: "2026-09-17T00:04:30.000Z", reason: "operator" });
      },
    });
    const resolution = await resolver({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status/doc" });
    expect(resolution).toEqual({ status: "REVOKED", freshness: "FRESH" });
    expect(options[0]?.redirect).toBe("error");
  });

  it("marks old status projections stale", async () => {
    const resolver = createHttpStatusResolver({
      now: () => Date.parse("2026-09-17T01:00:00.000Z"),
      maxAgeMs: 60_000,
      fetchImpl: async () => jsonResponse({ status: "ACTIVE", updatedAt: "2026-09-17T00:00:00.000Z" }),
    });
    expect(await resolver({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status" })).toEqual({ status: "ACTIVE", freshness: "STALE" });
  });

  it("queries a configured service URL and parses the Credaryn status projection", async () => {
    const urls: string[] = [];
    const resolver = createHttpStatusResolver({
      serviceUrl: "https://status.example.test/v1/status",
      now: () => Date.parse("2026-09-17T00:05:00.000Z"),
      maxAgeMs: 60_000,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return jsonResponse({ lifecycleStatus: "REVOKED", record: { updatedAt: "2026-09-17T00:04:30.000Z" } });
      },
    });

    const resolution = await resolver({
      issuerId: "acme",
      documentId: "doc",
      // The configured service wins over a document-supplied URL.
      statusUrl: "https://attacker.example/status",
    });

    expect(resolution).toEqual({ status: "REVOKED", freshness: "FRESH" });
    expect(urls[0]).toBe("https://status.example.test/v1/status?issuerId=acme&documentId=doc");
  });

  it("allows an explicitly insecure http service URL only when opted in", async () => {
    let called = 0;
    const blocked = createHttpStatusResolver({ fetchImpl: async () => { called += 1; return jsonResponse({ status: "ACTIVE" }); } });
    expect(await blocked({ issuerId: "acme", documentId: "doc", statusUrl: "http://status.internal/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });
    expect(called).toBe(0);

    const allowed = createHttpStatusResolver({ allowInsecure: true, fetchImpl: async () => jsonResponse({ status: "ACTIVE" }) });
    expect(await allowed({ issuerId: "acme", documentId: "doc", statusUrl: "http://status.internal/status" })).toEqual({ status: "ACTIVE", freshness: "FRESH" });
  });

  it("degrades to unavailable on redirects, oversized bodies, errors and timeouts", async () => {
    const redirect = createHttpStatusResolver({ fetchImpl: async () => jsonResponse({}, { status: 302, ok: false }) });
    expect(await redirect({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });

    const oversized = createHttpStatusResolver({ maxBytes: 4, fetchImpl: async () => jsonResponse({ status: "ACTIVE", padding: "xxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(await oversized({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });

    const failing = createHttpStatusResolver({ fetchImpl: async () => { throw new Error("network down"); } });
    expect(await failing({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });

    const timingOut = createHttpStatusResolver({
      timeoutMs: 5,
      fetchImpl: async (_url, init) => {
        const signal = (init as { signal?: AbortSignal }).signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });
    expect(await timingOut({ issuerId: "acme", documentId: "doc", statusUrl: "https://issuer.example/status" })).toEqual({ status: "UNCHECKED", freshness: "UNAVAILABLE" });
  });
});

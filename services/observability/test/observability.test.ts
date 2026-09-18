import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createCorrelationId, createJsonLogger, createStructuredLog } from "../src/logging.js";
import { createNoopSpanExporter, createSpanRecorder, createTracer } from "../src/telemetry.js";

const CORRELATION_ID = "00000000-0000-4000-8000-000000000000";

describe("observability redaction", () => {
  it("creates correlation IDs and removes credentials, private material, documents and sensitive preimages", () => {
    const correlationId = createCorrelationId(undefined);
    expect(correlationId).toMatch(/^[a-f0-9-]{36}$/);
    const log = createStructuredLog("info", "verification complete", {
      token: "secret-token",
      privateKey: "secret-key",
      uploadedDocument: "%PDF-private",
      rawPreimage: "sensitive",
      issuerId: "acme-retail",
      correlationId,
    });

    expect(log).toMatchObject({ level: "info", message: "verification complete", correlationId });
    expect(JSON.stringify(log)).not.toContain("secret-token");
    expect(JSON.stringify(log)).not.toContain("secret-key");
    expect(JSON.stringify(log)).not.toContain("%PDF-private");
    expect(log.fields.issuerId).toBe("acme-retail");
  });

  it("emits redacted structured JSON lines with correlation ids", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({ write: (line) => { lines.push(line); }, now: () => "2026-09-18T00:00:00.000Z" });
    const entry = logger.warn("verification.parser.rejected", {
      correlationId: CORRELATION_ID,
      authorization: "Bearer secret-token",
      documentBytes: "%PDF-private",
      issuerId: "acme-retail",
    });

    expect(entry.correlationId).toBe(CORRELATION_ID);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "warn", message: "verification.parser.rejected", correlationId: CORRELATION_ID, time: "2026-09-18T00:00:00.000Z" });
    expect(lines[0]).not.toContain("secret-token");
    expect(lines[0]).not.toContain("%PDF-private");
    expect((parsed.fields as Record<string, unknown>).issuerId).toBe("acme-retail");
  });
});

describe("observability span recorder (pluggable exporter)", () => {
  it("records spans through a pluggable exporter and exports each span once", () => {
    const exported: string[] = [];
    const recorder = createSpanRecorder({ exporter: { export: (span) => { exported.push(`${span.name}:${span.traceId}`); } }, now: () => 42 });
    const span = recorder.startSpan("verify.parse", { correlationId: CORRELATION_ID });
    span.end();
    span.end();
    expect(exported).toEqual([`verify.parse:${CORRELATION_ID}`]);
    expect(span.endedAt).toBe(42);
  });

  it("defaults to a no-op exporter", () => {
    const exporter = createNoopSpanExporter();
    expect(() => exporter.export({ name: "x", traceId: "y", correlationId: "y", startedAt: 0, end: () => undefined })).not.toThrow();
  });
});

describe("createTracer (OpenTelemetry)", () => {
  it("returns a usable no-op tracer and resolves shutdown when no endpoint is configured", async () => {
    const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    try {
      const handle = createTracer({ serviceName: "credaryn-test" });
      const span = handle.tracer.startSpan("verify.offline");
      expect(span).toBeDefined();
      expect(span.isRecording()).toBe(false);
      span.end();
      await expect(handle.shutdown()).resolves.toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
    }
  });

  it("constructs a provider for a loopback OTLP endpoint and shuts down cleanly", async () => {
    // No collector is required: construction is lazy and the unended span is
    // never exported, so this only exercises provider build/register/shutdown.
    const handle = createTracer({ serviceName: "credaryn-test", otlpEndpoint: "http://127.0.0.1:59999" });
    const span = handle.tracer.startSpan("verify.loopback");
    expect(span).toBeDefined();
    expect(span.isRecording()).toBe(true);
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it("honors OTEL_EXPORTER_OTLP_ENDPOINT when no option is supplied", async () => {
    const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:59998";
    try {
      const handle = createTracer({ serviceName: "credaryn-env-test" });
      expect(handle.tracer.startSpan("verify.env").isRecording()).toBe(true);
      await expect(handle.shutdown()).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
    }
  });

  it("falls back to a no-op tracer for a malformed endpoint instead of throwing", async () => {
    const handle = createTracer({ serviceName: "credaryn-test", otlpEndpoint: "not a url" });
    expect(handle.tracer.startSpan("verify.bad-endpoint").isRecording()).toBe(false);
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it("exports ended spans to the OTLP/HTTP collector path over loopback", async () => {
    // In-test loopback sink: a real collector is not required, but the request
    // must actually be delivered to `${endpoint}/v1/traces` on shutdown.
    const requests: Array<{ method?: string; url?: string; body: Buffer }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({ method: request.method, url: request.url, body: Buffer.concat(chunks) });
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    try {
      const handle = createTracer({ serviceName: "credaryn-loopback", otlpEndpoint: `http://127.0.0.1:${port}` });
      handle.tracer.startSpan("verify.exported").end();
      await handle.shutdown();

      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.url).toBe("/v1/traces");
      expect(requests[0]?.body.toString("utf8")).toContain("credaryn-loopback");
      expect(requests[0]?.body.toString("utf8")).toContain("verify.exported");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

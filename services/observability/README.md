# @credaryn/observability

Structured JSON logging, correlation IDs and an OpenTelemetry tracing seam shared by Credaryn
services.

## Logging

`createJsonLogger()` emits one redacted JSON line per event to stdout. Redaction runs in
`createStructuredLog()` before serialization, so tokens, private material, uploaded documents
and raw sensitive preimages never reach the sink.

```ts
import { createJsonLogger } from "@credaryn/observability";

const logger = createJsonLogger();
logger.info("status.transition.accepted", { correlationId, issuerId, documentId, status });
```

Every entry carries `time`, `level`, `message`, `correlationId` and `fields`. Services accept an
optional logger so they can be pointed at an operator-owned sink in tests.

## Tracing (OpenTelemetry)

`createTracer()` returns `{ tracer, shutdown }`. Tracing is **off unless configured**:

- If neither the `otlpEndpoint` option nor `OTEL_EXPORTER_OTLP_ENDPOINT` is set, it returns a
  genuine no-op tracer from `@opentelemetry/api` and a no-op `shutdown`. Nothing is sampled,
  exported or registered, so an unconfigured service pays nothing.
- If an endpoint is present, it builds a `NodeTracerProvider` with a `BatchSpanProcessor` and an
  OTLP/HTTP `OTLPTraceExporter`, tags spans with a `service.name` resource, registers the
  provider, and returns its tracer. The exporter posts to `${endpoint}/v1/traces` (a URL that
  already ends in `/v1/traces` is used verbatim).
- It never throws: a malformed endpoint falls back to the no-op tracer, and `shutdown()` resolves
  even if the final flush fails.

The service name comes from the `serviceName` option, then `OTEL_SERVICE_NAME`, then `credaryn`.

```ts
import { createTracer } from "@credaryn/observability";

const { tracer, shutdown } = createTracer({ serviceName: "credaryn-verifier" });
const span = tracer.startSpan("verify.paper");
try {
  // ... work ...
} finally {
  span.end();
}
await shutdown(); // flush the batch processor on graceful exit
```

### Operator wiring

```bash
# OTLP/HTTP base endpoint (collector, Jaeger, Tempo, Honeycomb, ...). Omit to disable tracing.
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
export OTEL_SERVICE_NAME="credaryn-verifier"

# Optional: extra exporter headers/targets are honored by the underlying SDK.
# export OTEL_EXPORTER_OTLP_HEADERS="api-key=..."
# export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://api.honeycomb.io/v1/traces"
```

Common collector targets:

- OpenTelemetry Collector `otlp` receiver over HTTP: `http://<collector-host>:4318`.
- Grafana Agent / Tempo, Jaeger (OTLP HTTP), or a vendor endpoint such as
  `https://otlp.nr-data.net:4318` (New Relic) — credentials via `OTEL_EXPORTER_OTLP_HEADERS`.

The exporter and batch processor also honor the standard `OTEL_*` knobs
(`OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_MAX_QUEUE_SIZE`, `OTEL_BSP_EXPORT_TIMEOUT`,
`OTEL_EXPORTER_OTLP_HEADERS`, ...). Call `shutdown()` during graceful termination so buffered
spans are flushed.

> Privacy: span names and attributes are chosen by the caller. Do **not** attach credentials,
> raw documents or sensitive preimages as span attributes; redaction applies to the JSON logger,
> not to spans.

### Pluggable span exporter (tests)

For unit tests that want to capture spans without booting the SDK, `createSpanRecorder()` returns
a lightweight recorder that forwards each ended `Span` to an injectable `SpanExporter`
(`createNoopSpanExporter()` is the default):

```ts
import { createSpanRecorder, type SpanExporter } from "@credaryn/observability";

const exporter: SpanExporter = { export: (span) => captured.push(span.name) };
const recorder = createSpanRecorder({ exporter });
const span = recorder.startSpan("verify.parse", { correlationId });
span.end();
```

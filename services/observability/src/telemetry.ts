import {
  ProxyTracerProvider,
  type AttributeValue,
  type Attributes,
  type Tracer as OtelTracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { createCorrelationId } from "./logging.js";

export interface TraceContext {
  correlationId: string;
  traceId: string;
  sampled: boolean;
}

export function createTraceContext(correlationId: string, traceId = correlationId): TraceContext {
  return { correlationId, traceId, sampled: false };
}

const DEFAULT_SERVICE_NAME = "credaryn";

/**
 * Pluggable span sink used by the lightweight recorder below. The default is a
 * no-op placeholder. This seam exists so unit tests (and any future operator
 * adapter) can capture spans without booting a real exporter, independent of
 * the OpenTelemetry provider returned by {@link createTracer}.
 */
export interface Span {
  name: string;
  traceId: string;
  correlationId: string;
  startedAt: number;
  endedAt?: number;
  end(): void;
}

export interface SpanExporter {
  export(span: Span): void | Promise<void>;
}

export function createNoopSpanExporter(): SpanExporter {
  return { export: () => undefined };
}

export interface SpanRecorderOptions {
  exporter?: SpanExporter;
  now?: () => number;
}

export interface SpanRecorder {
  startSpan(name: string, fields?: { correlationId?: string }): Span;
}

/**
 * Lightweight, dependency-free span recorder. It is the test seam for the
 * tracer abstraction: records start/end timestamps and forwards each span to a
 * {@link SpanExporter} exactly once. Not connected to the OpenTelemetry SDK.
 */
export function createSpanRecorder(options: SpanRecorderOptions = {}): SpanRecorder {
  const exporter = options.exporter ?? createNoopSpanExporter();
  const now = options.now ?? Date.now;
  return {
    startSpan: (name, fields = {}) => {
      const correlationId = createCorrelationId(fields.correlationId);
      let ended = false;
      const span: Span = {
        name,
        traceId: correlationId,
        correlationId,
        startedAt: now(),
        end: () => {
          if (ended) return;
          ended = true;
          span.endedAt = now();
          void exporter.export(span);
        },
      };
      return span;
    },
  };
}

export interface CreateTracerOptions {
  /** Value for the `service.name` resource attribute (falls back to `OTEL_SERVICE_NAME`). */
  serviceName?: string;
  /** OTLP/HTTP base endpoint (falls back to `OTEL_EXPORTER_OTLP_ENDPOINT`). */
  otlpEndpoint?: string;
}

export interface TracerHandle {
  tracer: OtelTracer;
  shutdown(): Promise<void>;
}

/**
 * Shape of the OpenTelemetry `Resource` the provider needs. `@opentelemetry/resources`
 * is a transitive dependency (not a direct one), so the minimal `service.name`
 * resource is built here against the structural interface instead of importing it.
 */
interface ServiceResource {
  readonly attributes: Attributes;
  merge(other: ServiceResource | null): ServiceResource;
  getRawAttributes(): Array<[string, AttributeValue | undefined]>;
}

function resourceFrom(attributes: Attributes): ServiceResource {
  const resource: ServiceResource = {
    attributes,
    merge: (other) => (other === null ? resource : resourceFrom({ ...attributes, ...other.attributes })),
    getRawAttributes: () => Object.entries(attributes),
  };
  return resource;
}

/**
 * Build a tracer backed by a real OpenTelemetry `NodeTracerProvider` and an
 * OTLP/HTTP `BatchSpanProcessor` exporter, gated on configuration.
 *
 * - Without an endpoint (`options.otlpEndpoint` or `OTEL_EXPORTER_OTLP_ENDPOINT`)
 *   this returns a genuine no-op tracer from `@opentelemetry/api` and a no-op
 *   `shutdown`, so tracing stays off by default and costs nothing.
 * - With an endpoint it registers a provider exporting to
 *   `${endpoint}/v1/traces` (a full `/v1/traces` URL is used verbatim) and
 *   tags spans with the `service.name` resource.
 *
 * Never throws: a malformed endpoint falls back to the no-op tracer.
 */
export function createTracer(options: CreateTracerOptions = {}): TracerHandle {
  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME;
  const otlpEndpoint = options.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!otlpEndpoint) {
    return { tracer: createNoopTracer(serviceName), shutdown: async () => undefined };
  }

  try {
    const exporter = new OTLPTraceExporter({ url: toTracesEndpoint(otlpEndpoint) });
    const processor = new BatchSpanProcessor(exporter);
    const provider = new NodeTracerProvider({
      resource: resourceFrom({ [ATTR_SERVICE_NAME]: serviceName }),
      spanProcessors: [processor],
    });
    provider.register();
    return {
      tracer: provider.getTracer(serviceName),
      shutdown: async () => {
        try {
          await provider.shutdown();
        } catch {
          // A failed flush during shutdown must not take the process down.
        }
      },
    };
  } catch {
    // Misconfigured endpoint (for example an unparseable URL): fail open to a
    // no-op tracer rather than throwing from the factory.
    return { tracer: createNoopTracer(serviceName), shutdown: async () => undefined };
  }
}

function createNoopTracer(name: string): OtelTracer {
  // A private ProxyTracerProvider never delegates to the globally registered
  // provider, so this is a true no-op even after another createTracer() has
  // registered a real one in the same process.
  return new ProxyTracerProvider().getTracer(name);
}

function toTracesEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/v1/traces") ? trimmed : `${trimmed}/v1/traces`;
}

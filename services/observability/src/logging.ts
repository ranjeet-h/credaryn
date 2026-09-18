import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  level: LogLevel;
  message: string;
  correlationId: string;
  fields: Record<string, unknown>;
}

const SENSITIVE_KEY = /(token|password|secret|private|preimage|uploaded(document|file)|document(bytes|content)|authorization|cookie|pin)/i;

export function createCorrelationId(candidate: string | undefined): string {
  return candidate !== undefined && /^[a-f0-9-]{36}$/.test(candidate) ? candidate : randomUUID();
}

export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(value)]));
}

export function createStructuredLog(level: LogLevel, message: string, fields: Record<string, unknown> = {}): StructuredLog {
  const correlationId = createCorrelationId(typeof fields.correlationId === "string" ? fields.correlationId : undefined);
  return { level, message, correlationId, fields: redactFields(fields) };
}

export interface JsonLoggerOptions {
  /** Sink for one already-serialized JSON line. Defaults to stdout. */
  write?: (line: string) => void;
  /** Clock used for the `time` field. Injectable for deterministic tests. */
  now?: () => string;
}

export interface JsonLogger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): StructuredLog;
  debug(message: string, fields?: Record<string, unknown>): StructuredLog;
  info(message: string, fields?: Record<string, unknown>): StructuredLog;
  warn(message: string, fields?: Record<string, unknown>): StructuredLog;
  error(message: string, fields?: Record<string, unknown>): StructuredLog;
}

/**
 * Emits one redacted structured JSON log line per event. Redaction is applied by
 * {@link createStructuredLog} before serialization, so credentials, private material,
 * uploaded documents and sensitive preimages never reach the sink.
 */
export function createJsonLogger(options: JsonLoggerOptions = {}): JsonLogger {
  const write = options.write ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const now = options.now ?? (() => new Date().toISOString());
  const log = (level: LogLevel, message: string, fields: Record<string, unknown> = {}): StructuredLog => {
    const entry = createStructuredLog(level, message, fields);
    write(JSON.stringify({ time: now(), ...entry }));
    return entry;
  };
  return {
    log,
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}

function redactValue(value: unknown): unknown {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object" && value !== null) return redactFields(value as Record<string, unknown>);
  return value;
}

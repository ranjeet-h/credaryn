import { randomUUID } from "node:crypto";

export type StatusLogLevel = "debug" | "info" | "warn" | "error";

export interface StatusLogEntry {
  level: StatusLogLevel;
  message: string;
  correlationId: string;
  fields: Record<string, unknown>;
}

/**
 * Structural twin of `JsonLogger` from `@credaryn/observability`. Declared locally so the
 * status service does not add a workspace build dependency; operators can inject the
 * observability logger (or any exporter-backed logger) directly.
 */
export interface StatusLogger {
  log(level: StatusLogLevel, message: string, fields?: Record<string, unknown>): StatusLogEntry;
  debug(message: string, fields?: Record<string, unknown>): StatusLogEntry;
  info(message: string, fields?: Record<string, unknown>): StatusLogEntry;
  warn(message: string, fields?: Record<string, unknown>): StatusLogEntry;
  error(message: string, fields?: Record<string, unknown>): StatusLogEntry;
}

export interface StatusLoggerOptions {
  write?: (line: string) => void;
  now?: () => string;
}

const SENSITIVE_KEY = /(token|password|secret|private|preimage|authorization|cookie|uploaded(document|file)|document(bytes|content))/i;

export function createStatusLogger(options: StatusLoggerOptions = {}): StatusLogger {
  const write = options.write ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const now = options.now ?? (() => new Date().toISOString());
  const log = (level: StatusLogLevel, message: string, fields: Record<string, unknown> = {}): StatusLogEntry => {
    const correlationId = statusCorrelationId(typeof fields.correlationId === "string" ? fields.correlationId : undefined);
    const entry: StatusLogEntry = { level, message, correlationId, fields: redactFields(fields) };
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

export function statusCorrelationId(candidate: string | undefined): string {
  return candidate !== undefined && /^[a-f0-9-]{36}$/.test(candidate) ? candidate : randomUUID();
}

export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(value)]));
}

function redactValue(value: unknown): unknown {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object" && value !== null) return redactFields(value as Record<string, unknown>);
  return value;
}

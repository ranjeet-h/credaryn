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

function redactValue(value: unknown): unknown {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object" && value !== null) return redactFields(value as Record<string, unknown>);
  return value;
}

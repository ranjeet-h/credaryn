import type { LifecycleStatus } from "@credaryn/core";
import type { StatusFreshness, StatusState } from "./status-repository.js";

export interface StatusResolverInput {
  issuerId: string;
  keyId?: string;
  documentId: string;
  statusUrl?: string;
}

export interface StatusResolution {
  status: LifecycleStatus;
  freshness: StatusFreshness;
}

export type StatusResolver = (input: StatusResolverInput) => Promise<StatusResolution>;

export interface HttpStatusResolverOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxAgeMs?: number;
  now?: () => number;
  /**
   * Base URL of a Credaryn status service. When set it takes precedence over any per-document
   * `statusUrl`, so a verifier queries only the operator-configured service (issuerId/documentId
   * are appended as query parameters). This is the URL `CREDARYN_STATUS_URL` maps to.
   */
  serviceUrl?: string;
  /**
   * Explicitly allow plain `http:` service URLs on non-loopback hosts (for example a Compose
   * internal network). Defaults to `false`; HTTPS is required everywhere else.
   */
  allowInsecure?: boolean;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const STATES: readonly StatusState[] = ["ACTIVE", "REVOKED", "CANCELLED", "SUPERSEDED", "EXPIRED"];

/**
 * Builds a {@link StatusResolver} that reads an optional Credaryn-native HTTPS status URL.
 * Fetches are bounded (timeout + response size), follow no redirects, and require HTTPS
 * outside local development. Any failure degrades to `UNCHECKED`/`UNAVAILABLE` and never
 * invalidates an otherwise valid historical signature on its own.
 */
export function createHttpStatusResolver(options: HttpStatusResolverOptions = {}): StatusResolver {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.now ?? Date.now;
  const serviceUrl = options.serviceUrl;
  const allowInsecure = options.allowInsecure ?? false;
  return async (input) => {
    const target = serviceUrl === undefined ? input.statusUrl : buildServiceLookupUrl(serviceUrl, input);
    if (target === undefined) return unavailable();
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return unavailable();
    }
    const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (localDevelopment || allowInsecure))) return unavailable();

    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(target, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (response.status >= 300 && response.status < 400) return unavailable();
      if (!response.ok) return unavailable();
      const payload = JSON.parse(await readBounded(response, maxBytes)) as StatusPayload;
      // Accept both a bare status endpoint (`status`/`updatedAt`) and the Credaryn status
      // service projection (`lifecycleStatus` plus a nested `record.updatedAt`).
      const status = parseState(payload.status) ?? parseState(payload.lifecycleStatus);
      if (status === undefined) return unavailable();
      const updatedAt = firstString(payload.updatedAt, payload.record?.updatedAt);
      return { status, freshness: freshnessFor(updatedAt, now(), maxAgeMs) };
    } catch {
      return unavailable();
    } finally {
      clearTimeout(timer);
    }
  };
}

interface StatusPayload {
  status?: unknown;
  lifecycleStatus?: unknown;
  updatedAt?: unknown;
  record?: { updatedAt?: unknown } | null;
}

function buildServiceLookupUrl(serviceUrl: string, input: StatusResolverInput): string | undefined {
  try {
    const url = new URL(serviceUrl);
    url.searchParams.set("issuerId", input.issuerId);
    url.searchParams.set("documentId", input.documentId);
    if (input.keyId !== undefined) url.searchParams.set("keyId", input.keyId);
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return undefined;
}

function parseState(value: unknown): StatusState | undefined {
  return typeof value === "string" && (STATES as readonly string[]).includes(value) ? value as StatusState : undefined;
}

function freshnessFor(updatedAt: string | undefined, current: number, maxAgeMs: number): StatusFreshness {
  if (updatedAt === undefined) return "FRESH";
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return "UNAVAILABLE";
  return current - parsed > maxAgeMs ? "STALE" : "FRESH";
}

function unavailable(): StatusResolution {
  return { status: "UNCHECKED", freshness: "UNAVAILABLE" };
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error("Status response exceeds the maximum size");
    return new TextDecoder().decode(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Status response exceeds the maximum size");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

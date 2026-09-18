import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { createStatusLogger, statusCorrelationId, type StatusLogger } from "./logger.js";
import { StatusService, StatusServiceUnavailableError } from "./status-service.js";
import type { StatusState } from "./status-repository.js";

export interface StatusHttpOptions {
  service: StatusService;
  logger?: StatusLogger;
  /**
   * Authorization hook for status transitions. When omitted, transitions are denied: a status
   * write endpoint must be explicitly wired behind workload/OIDC auth by the operator.
   */
  authorizeTransition?: (request: IncomingMessage) => boolean | Promise<boolean>;
  maxBodyBytes?: number;
}

export const MAX_STATUS_BODY_BYTES = 64 * 1024;
const STATES = ["ACTIVE", "REVOKED", "CANCELLED", "SUPERSEDED", "EXPIRED"] as const;

export function createStatusHttpHandler(options: StatusHttpOptions): RequestListener {
  const service = options.service;
  const logger = options.logger ?? createStatusLogger();
  const maxBodyBytes = options.maxBodyBytes ?? MAX_STATUS_BODY_BYTES;
  return (request, response) => {
    void handle(request, response, service, logger, options.authorizeTransition, maxBodyBytes);
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  service: StatusService,
  logger: StatusLogger,
  authorizeTransition: ((request: IncomingMessage) => boolean | Promise<boolean>) | undefined,
  maxBodyBytes: number,
): Promise<void> {
  const correlationId = statusCorrelationId(headerValue(request.headers["x-correlation-id"]));
  response.setHeader("x-correlation-id", correlationId);
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/health") {
      respondJson(response, 200, { status: "ready", service: "credaryn-status" });
      return;
    }
    if (method === "GET" && path === "/v1/status") {
      const issuerId = url.searchParams.get("issuerId");
      const documentId = url.searchParams.get("documentId");
      if (issuerId === null || documentId === null) {
        throw new HttpError(400, "INVALID_STATUS_REFERENCE", "issuerId and documentId query parameters are required");
      }
      const lookup = await service.get({ issuerId, documentId });
      respondJson(response, 200, lookup);
      return;
    }
    if (method === "POST" && path === "/v1/status/transition") {
      if (authorizeTransition === undefined || !(await authorizeTransition(request))) {
        logger.warn("status.transition.rejected", { correlationId, reason: "unauthorized" });
        throw new HttpError(403, "STATUS_TRANSITION_FORBIDDEN", "Status transitions require authentication");
      }
      const body = await readJsonBody(request, maxBodyBytes);
      const parsed = parseTransition(body);
      if (parsed === undefined) {
        logger.warn("status.transition.rejected", { correlationId, reason: "invalid_payload" });
        throw new HttpError(400, "INVALID_STATUS_TRANSITION", "issuerId, documentId, status and reason are required");
      }
      let record;
      try {
        record = await service.transition(parsed);
      } catch (error) {
        if (error instanceof StatusServiceUnavailableError) throw error;
        logger.warn("status.transition.rejected", { correlationId, reason: "invalid_transition" });
        throw new HttpError(409, "INVALID_STATUS_TRANSITION", error instanceof Error ? error.message : "Invalid status transition");
      }
      logger.info("status.transition.accepted", { correlationId, issuerId: record.issuerId, documentId: record.documentId, status: record.status });
      respondJson(response, 201, record);
      return;
    }
    respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    if (error instanceof StatusServiceUnavailableError) {
      respondJson(response, 503, { error: { code: "STATUS_UNAVAILABLE", message: error.message } });
      return;
    }
    if (error instanceof HttpError) {
      respondJson(response, error.status, { error: { code: error.code, message: error.message } });
      return;
    }
    respondJson(response, 500, { error: { code: "STATUS_ERROR", message: error instanceof Error ? error.message : "Status request failed" } });
  }
}

function parseTransition(body: unknown): { issuerId: string; documentId: string; keyId?: string; status: StatusState; reason: string } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = body as Record<string, unknown>;
  if (typeof value.issuerId !== "string" || typeof value.documentId !== "string" || typeof value.reason !== "string") return undefined;
  if (typeof value.status !== "string" || !(STATES as readonly string[]).includes(value.status)) return undefined;
  const keyId = value.keyId;
  if (keyId !== undefined && typeof keyId !== "string") return undefined;
  return {
    issuerId: value.issuerId,
    documentId: value.documentId,
    ...(keyId === undefined ? {} : { keyId }),
    status: value.status as StatusState,
    reason: value.reason,
  };
}

function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    request.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += bytes.byteLength;
      if (total > maxBytes) {
        settled = true;
        request.resume();
        reject(new HttpError(413, "STATUS_BODY_TOO_LARGE", "Status request body exceeds the maximum size"));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "INVALID_STATUS_JSON", "Status request body is not valid JSON"));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new HttpError(400, "STATUS_READ_FAILED", error.message));
    });
  });
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

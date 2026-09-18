import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createCorrelationId, createJsonLogger, type JsonLogger } from "@credaryn/observability";
import {
  authorizeAdmin,
  authorizeRemoteSigning,
  authenticateOidcToken,
  createCsrfCookie,
  createSecureSessionCookie,
  validateCorsOrigin,
  type OidcClaims,
  type OidcTokenVerifier,
  type RemoteSigningScope,
} from "./auth/oidc.js";
import { createOidcTokenVerifierFromEnv, type OidcEnvironment } from "./auth/jwks.js";
import { createAuditEvent, type AuditEvent } from "./audit.js";

export type AdminStatusState = "ACTIVE" | "REVOKED" | "CANCELLED" | "SUPERSEDED" | "EXPIRED";

export interface AdminStatusRecord {
  issuerId: string;
  documentId: string;
  keyId?: string;
  status: AdminStatusState;
  reason: string;
  updatedAt: string;
}

export interface AdminStatusTransition {
  issuerId: string;
  documentId: string;
  keyId?: string;
  status: AdminStatusState;
  reason: string;
}

/**
 * Structural port for lifecycle status persistence. The admin app keeps this local so it has
 * no hard build dependency; operators wire it to `@credaryn/status` (or their own store).
 */
export interface AdminStatusRepository {
  transition(input: AdminStatusTransition): Promise<AdminStatusRecord>;
  get(reference: { issuerId: string; documentId: string }): Promise<AdminStatusRecord | undefined>;
}

export interface AdminServerOptions {
  /**
   * Injected verifier used by tests and embedders. When omitted, the server builds a real
   * JWKS verifier from `CREDARYN_OIDC_ISSUER`/`CREDARYN_OIDC_JWKS_URI` (and optional
   * `CREDARYN_OIDC_AUDIENCE`). With neither, authenticated routes fail closed with 501.
   */
  tokenVerifier?: OidcTokenVerifier;
  statusRepository: AdminStatusRepository;
  allowedOrigins?: readonly string[];
  signingScopes?: readonly RemoteSigningScope[];
  auditSink?: (event: AuditEvent) => void;
  logger?: JsonLogger;
  now?: () => string;
  /** Environment used to resolve OIDC configuration. Defaults to `process.env`. */
  env?: OidcEnvironment;
}

const MAX_BODY_BYTES = 64 * 1024;

export function createAdminServer(options: AdminServerOptions): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  const signingScopes = options.signingScopes ?? [];
  const logger = options.logger ?? createJsonLogger();
  const auditSink = options.auditSink ?? (() => undefined);
  const now = options.now ?? (() => new Date().toISOString());
  const tokenVerifier = options.tokenVerifier ?? createOidcTokenVerifierFromEnv(options.env ?? process.env);
  return createServer((request, response) => {
    const correlationId = createCorrelationId(headerValue(request.headers["x-correlation-id"]));
    response.setHeader("x-correlation-id", correlationId);
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    void handle(request, response, { ...options, tokenVerifier, allowedOrigins, signingScopes, logger, auditSink, now }, correlationId);
  });
}

interface ResolvedOptions {
  tokenVerifier: OidcTokenVerifier | undefined;
  statusRepository: AdminStatusRepository;
  allowedOrigins: readonly string[];
  signingScopes: readonly RemoteSigningScope[];
  auditSink: (event: AuditEvent) => void;
  logger: JsonLogger;
  now: () => string;
}

async function handle(request: IncomingMessage, response: ServerResponse, options: ResolvedOptions, correlationId: string): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  try {
    applyCors(request, response, options.allowedOrigins);
    if (method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (method === "GET" && path === "/health") {
      respondJson(response, 200, { status: "ready", service: "credaryn-admin" });
      return;
    }
    if (method === "POST" && path === "/v1/session") {
      const claims = await authenticate(request, options.tokenVerifier);
      if (!claims.roles.includes("admin")) throw new HttpError(403, "ADMIN_ROLE_REQUIRED", "Admin role is required");
      const csrfToken = randomUUID();
      response.setHeader("set-cookie", [createSecureSessionCookie(claims.subject), createCsrfCookie(csrfToken)]);
      options.logger.info("admin.session.created", { correlationId, subject: claims.subject });
      respondJson(response, 200, { subject: claims.subject, csrfToken });
      return;
    }
    if (method === "POST" && path === "/v1/status/transition") {
      const claims = await authorizeAdminRequest(request, options.tokenVerifier, method);
      const body = await readJsonBody(request);
      const transition = parseTransition(body);
      if (transition === undefined) throw new HttpError(400, "INVALID_STATUS_TRANSITION", "issuerId, documentId, status and reason are required");
      const record = await options.statusRepository.transition(transition);
      options.auditSink(createAuditEvent({ actor: claims.subject, action: "status.transition", metadata: { ...transition, correlationId }, now: options.now }));
      options.logger.info("admin.status.transition", { correlationId, subject: claims.subject, issuerId: record.issuerId, documentId: record.documentId, status: record.status });
      respondJson(response, 201, record);
      return;
    }
    if (method === "GET" && path.startsWith("/v1/status/")) {
      const claims = await authorizeAdminRequest(request, options.tokenVerifier, method);
      const segments = path.slice("/v1/status/".length).split("/").map((segment) => decodeURIComponent(segment));
      const issuerId = segments[0];
      const documentId = segments[1];
      if (issuerId === undefined || documentId === undefined || issuerId === "" || documentId === "") {
        throw new HttpError(400, "INVALID_STATUS_REFERENCE", "issuerId and documentId are required");
      }
      const record = await options.statusRepository.get({ issuerId, documentId });
      options.auditSink(createAuditEvent({ actor: claims.subject, action: "status.read", metadata: { issuerId, documentId, correlationId }, now: options.now }));
      respondJson(response, 200, record ?? { issuerId, documentId, status: "UNCHECKED" });
      return;
    }
    if (method === "POST" && path === "/v1/signing/authorize") {
      const claims = await authenticate(request, options.tokenVerifier);
      assertCsrf(request);
      const body = await readJsonBody(request);
      const value = body as Record<string, unknown>;
      if (typeof value.issuerId !== "string" || typeof value.keyId !== "string") {
        throw new HttpError(400, "INVALID_SIGNING_REQUEST", "issuerId and keyId are required");
      }
      let authorization;
      try {
        authorization = authorizeRemoteSigning({
          subject: claims.subject,
          roles: claims.roles,
          issuerId: value.issuerId,
          keyId: value.keyId,
          allowedScopes: options.signingScopes,
        });
      } catch (error) {
        throw new HttpError(403, "REMOTE_SIGNING_FORBIDDEN", error instanceof Error ? error.message : "Remote signing is not authorized");
      }
      options.auditSink(createAuditEvent({ actor: claims.subject, action: "signing.authorize", metadata: { issuerId: value.issuerId, keyId: value.keyId, correlationId }, now: options.now }));
      options.logger.info("admin.signing.authorized", { correlationId, subject: claims.subject, issuerId: value.issuerId, keyId: value.keyId });
      respondJson(response, 200, authorization);
      return;
    }
    respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    if (error instanceof HttpError) {
      options.logger.warn("admin.request.rejected", { correlationId, code: error.code, path });
      respondJson(response, error.status, { error: { code: error.code, message: error.message } });
      return;
    }
    options.logger.error("admin.request.failed", { correlationId, path, message: error instanceof Error ? error.message : "Admin request failed" });
    respondJson(response, 500, { error: { code: "ADMIN_ERROR", message: "Admin request failed" } });
  }
}

async function authenticate(request: IncomingMessage, verifier: OidcTokenVerifier | undefined): Promise<OidcClaims> {
  if (verifier === undefined) {
    // No injected verifier and no OIDC env configuration: fail closed rather than
    // silently accepting or rejecting without ever validating a token.
    throw new HttpError(501, "ADMIN_OIDC_NOT_CONFIGURED", "Admin OIDC verification is not configured");
  }
  const token = bearerToken(request);
  if (token === undefined) throw new HttpError(401, "ADMIN_AUTHENTICATION_REQUIRED", "Admin bearer token is required");
  try {
    return await authenticateOidcToken(token, verifier);
  } catch {
    throw new HttpError(401, "ADMIN_AUTHENTICATION_FAILED", "Admin bearer token is invalid");
  }
}

async function authorizeAdminRequest(request: IncomingMessage, verifier: OidcTokenVerifier | undefined, method: string): Promise<OidcClaims> {
  const claims = await authenticate(request, verifier);
  try {
    authorizeAdmin({
      method,
      claims,
      csrfToken: headerValue(request.headers["x-csrf-token"]),
      expectedCsrfToken: cookieValue(request, "credaryn_csrf"),
    });
  } catch (error) {
    throw new HttpError(403, "ADMIN_FORBIDDEN", error instanceof Error ? error.message : "Admin authorization failed");
  }
  return claims;
}

function assertCsrf(request: IncomingMessage): void {
  const header = headerValue(request.headers["x-csrf-token"]);
  const cookie = cookieValue(request, "credaryn_csrf");
  if (header === undefined || cookie === undefined || header !== cookie) {
    throw new HttpError(403, "CSRF_VALIDATION_FAILED", "CSRF validation failed");
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[]): void {
  const origin = headerValue(request.headers.origin);
  if (origin === undefined) return;
  if (!validateCorsOrigin(origin, allowedOrigins)) {
    throw new HttpError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed");
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type,x-correlation-id,x-csrf-token");
  response.setHeader("vary", "origin");
}

function parseTransition(body: unknown): AdminStatusTransition | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = body as Record<string, unknown>;
  if (typeof value.issuerId !== "string" || typeof value.documentId !== "string" || typeof value.reason !== "string") return undefined;
  if (typeof value.status !== "string" || !["ACTIVE", "REVOKED", "CANCELLED", "SUPERSEDED", "EXPIRED"].includes(value.status)) return undefined;
  const keyId = value.keyId;
  if (keyId !== undefined && typeof keyId !== "string") return undefined;
  return {
    issuerId: value.issuerId,
    documentId: value.documentId,
    ...(keyId === undefined ? {} : { keyId }),
    status: value.status as AdminStatusState,
    reason: value.reason,
  };
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    request.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += bytes.byteLength;
      if (total > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(new HttpError(413, "ADMIN_BODY_TOO_LARGE", "Admin request body exceeds the maximum size"));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(Buffer.concat(chunks).length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "INVALID_ADMIN_JSON", "Admin request body is not valid JSON"));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new HttpError(400, "ADMIN_READ_FAILED", error.message));
    });
  });
}

function bearerToken(request: IncomingMessage): string | undefined {
  const header = headerValue(request.headers.authorization);
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token === "" ? undefined : token;
}

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  const header = headerValue(request.headers.cookie);
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

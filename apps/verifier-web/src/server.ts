import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import type { TrustStore } from "@credaryn/core";
import { Credaryn } from "@credaryn/node";
import { LocalSigner } from "@credaryn/provider-local";
import {
  MAX_PAPER_IMAGE_BYTES,
  MAX_PAPER_TEXT_BYTES,
  MAX_PDF_BYTES,
  VerificationInputError,
  createVerifier,
  loadTrustStore,
  type Verifier,
} from "@credaryn/verifier";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_WEB_REQUEST_BYTES = MAX_PDF_BYTES;
export const MAX_WEB_REQUEST_DURATION_MS = 30_000;

export interface VerifierWebOptions {
  verifier: Verifier;
  uiDirectory?: string;
  requestTimeoutMs?: number;
}

export interface StartVerifierWebOptions {
  verifier?: Verifier;
  host?: string;
  port?: number;
  uiDirectory?: string;
  requestTimeoutMs?: number;
}

export function createVerifierServer(options: VerifierWebOptions): Server {
  const uiDirectory = options.uiDirectory ?? fileURLToPath(new URL("./ui/", import.meta.url));
  const requestTimeoutMs = options.requestTimeoutMs ?? MAX_WEB_REQUEST_DURATION_MS;
  return createServer((request, response) => {
    void handleRequest(request, response, options.verifier, uiDirectory, requestTimeoutMs);
  });
}

export async function startVerifierServer(options: StartVerifierWebOptions = {}): Promise<Server> {
  const verifier = options.verifier ?? await createDefaultVerifier();
  const server = createVerifierServer(options.uiDirectory === undefined
    ? options.requestTimeoutMs === undefined
      ? { verifier }
      : { verifier, requestTimeoutMs: options.requestTimeoutMs }
    : options.requestTimeoutMs === undefined
      ? { verifier, uiDirectory: options.uiDirectory }
      : { verifier, uiDirectory: options.uiDirectory, requestTimeoutMs: options.requestTimeoutMs });
  await new Promise<void>((resolve) => server.listen(options.port ?? 4173, options.host ?? "127.0.0.1", resolve));
  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  verifier: Verifier,
  uiDirectory: string,
  requestTimeoutMs: number,
): Promise<void> {
  try {
    setSecurityHeaders(response);
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (method === "GET" && path === "/health") {
      respondJson(response, 200, { status: "ready", service: "credaryn-verifier" });
      return;
    }
    if (method === "GET" && (path === "/" || path === "/app.js" || path === "/style.css")) {
      const fileName = path === "/" ? "index.html" : path.slice(1);
      await respondStatic(response, uiDirectory, fileName);
      return;
    }
    if (method === "POST" && (path === "/v1/verify" || path === "/v1/verify/pdf" || path === "/v1/verify/paper")) {
      await verifyRequest(request, response, verifier, path, requestTimeoutMs);
      return;
    }
    respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    const webError = asWebError(error);
    respondJson(response, webError.status, { error: { code: webError.code, message: webError.message } });
  }
}

async function verifyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  verifier: Verifier,
  path: string,
  requestTimeoutMs: number,
): Promise<void> {
  const contentType = normalizeContentType(request.headers["content-type"]);
  validateRouteContentType(path, contentType);
  const bytes = await readBody(request, requestLimit(contentType), requestTimeoutMs);
  const input = contentType === undefined ? { bytes } : { bytes, contentType };
  const result = await verifier.verifyInput(input);
  respondJson(response, 200, result);
}

function validateRouteContentType(path: string, contentType: string | undefined): void {
  if (contentType !== undefined && !isSupportedContentType(contentType)) {
    throw new WebError(415, "UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${contentType}`);
  }
  if (path === "/v1/verify/pdf" && contentType !== "application/pdf") {
    throw new WebError(415, "UNSUPPORTED_CONTENT_TYPE", "The PDF route requires application/pdf");
  }
  if (path === "/v1/verify/paper" && contentType !== "image/png" && contentType !== "text/plain" && contentType !== "text/vnd.credaryn.crd1") {
    throw new WebError(415, "UNSUPPORTED_CONTENT_TYPE", "The paper route requires image/png or CRD1 text");
  }
}

function requestLimit(contentType: string | undefined): number {
  if (contentType === "image/png") return MAX_PAPER_IMAGE_BYTES;
  if (contentType === "text/plain" || contentType === "text/vnd.credaryn.crd1") return MAX_PAPER_TEXT_BYTES;
  return MAX_WEB_REQUEST_BYTES;
}

function readBody(request: IncomingMessage, maximumBytes: number, timeoutMs: number): Promise<Uint8Array> {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new WebError(400, "INVALID_CONTENT_LENGTH", "Content-Length must be a non-negative integer");
    }
    if (parsedLength > maximumBytes) {
      request.resume();
      throw new WebError(413, "INPUT_TOO_LARGE", `Request exceeds the maximum size of ${formatBytes(maximumBytes)}`);
    }
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.resume();
      reject(new WebError(408, "REQUEST_TIMEOUT", "Request body did not complete before the timeout"));
    }, timeoutMs);
    const cleanup = () => clearTimeout(timeout);
    request.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      totalBytes += bytes.byteLength;
      if (totalBytes > maximumBytes) {
        settled = true;
        cleanup();
        request.resume();
        reject(new WebError(413, "INPUT_TOO_LARGE", `Request exceeds the maximum size of ${formatBytes(maximumBytes)}`));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(new Uint8Array(Buffer.concat(chunks)));
      }
    });
    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new WebError(400, "REQUEST_READ_FAILED", error.message));
      }
    });
  });
}

async function respondStatic(response: ServerResponse, uiDirectory: string, fileName: string): Promise<void> {
  try {
    const body = await readFile(join(uiDirectory, fileName));
    const contentType = fileName.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : fileName.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
    response.setHeader("content-type", contentType);
    response.end(body);
  } catch {
    respondJson(response, 500, { error: { code: "UI_UNAVAILABLE", message: "Verifier UI is unavailable" } });
  }
}

async function createDefaultVerifier(): Promise<Verifier> {
  const trustStore = process.env.CREDARYN_TRUST_STORE === undefined
    ? emptyTrustStore()
    : await loadTrustStore(process.env.CREDARYN_TRUST_STORE);
  const endpoint = process.env.DSS_URL ?? "http://127.0.0.1:8080";
  const pdfEngine = new DssPdfSignatureEngine({ endpoint });
  const paperSigner = new LocalSigner({ issuerId: "local-development", keyId: "web-ephemeral-key" });
  return createVerifier({ pdfEngine, paperSigner, trustStore });
}

function emptyTrustStore(): TrustStore {
  return { resolve: async () => undefined, trustSource: "no-trust-material" };
}

function normalizeContentType(contentType: string | string[] | undefined): string | undefined {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized === undefined || normalized === "" ? undefined : normalized;
}

function isSupportedContentType(contentType: string): boolean {
  return contentType === "application/pdf"
    || contentType === "image/png"
    || contentType === "text/plain"
    || contentType === "text/vnd.credaryn.crd1";
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function asWebError(error: unknown): WebError {
  if (error instanceof WebError) return error;
  if (error instanceof VerificationInputError) {
    const status = error.code === "INPUT_TOO_LARGE" ? 413 : error.code === "UNSUPPORTED_CONTENT_TYPE" ? 415 : 400;
    return new WebError(status, error.code, error.message);
  }
  return new WebError(500, "VERIFICATION_FAILED", error instanceof Error ? error.message : "Verification failed");
}

class WebError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "WebError";
  }
}

function formatBytes(bytes: number): string {
  return bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MiB` : `${bytes / 1024} KiB`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST;
  await startVerifierServer(host === undefined
    ? { port: Number(process.env.PORT ?? 4173) }
    : { host, port: Number(process.env.PORT ?? 4173) });
  console.log(`Credaryn verifier listening on http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? "4173"}`);
}

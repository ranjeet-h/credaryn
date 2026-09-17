import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { createVerifier, type Verifier } from "@credaryn/verifier";
import { LocalSigner } from "@credaryn/provider-local";
import {
  createInvoiceArtifacts,
  createTamperedInvoicePreview,
  writeGeneratedArtifacts,
  type InvoiceArtifacts,
} from "../../../examples/invoice-puppeteer/src/seal.js";
import { createDemoTrustStore, describeTamperResult } from "./demo.js";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const artifactDirectory = fileURLToPath(new URL("../../../artifacts/invoice-11800/", import.meta.url));
const MAX_API_BODY_BYTES = 16 * 1024;

export interface PlaygroundServerOptions {
  endpoint?: string;
  host?: string;
  port?: number;
}

interface DemoSession {
  artifacts: InvoiceArtifacts;
  tamperedPdf?: Uint8Array;
  verifier: Verifier;
}

export function createPlaygroundServer(options: PlaygroundServerOptions = {}): Server {
  const endpoint = options.endpoint ?? process.env.DSS_URL ?? "http://127.0.0.1:8080";
  let session: DemoSession | undefined;

  return createServer((request, response) => {
    void handleRequest(request, response, endpoint, () => session, (next) => {
      session = next;
    });
  });
}

export async function startPlaygroundServer(options: PlaygroundServerOptions = {}): Promise<Server> {
  const server = createPlaygroundServer(options);
  await new Promise<void>((resolve) => server.listen(options.port ?? Number(process.env.PORT ?? 3000), options.host ?? "127.0.0.1", resolve));
  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  endpoint: string,
  getSession: () => DemoSession | undefined,
  setSession: (session: DemoSession) => void,
): Promise<void> {
  setSecurityHeaders(response);
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", "http://localhost").pathname;

  try {
    if (method === "GET" && path === "/health") {
      respondJson(response, 200, { status: "ready", service: "credaryn-playground" });
      return;
    }
    if (method === "GET" && ["/", "/demo.js", "/style.css"].includes(path)) {
      await respondStatic(response, path === "/" ? "index.html" : path.slice(1));
      return;
    }
    if (method === "GET" && path.startsWith("/artifacts/invoice-11800/")) {
      await respondArtifact(response, path.slice("/artifacts/invoice-11800/".length));
      return;
    }
    if (method === "POST" && path === "/api/generate") {
      const artifacts = await createInvoiceArtifacts(endpoint);
      await writeGeneratedArtifacts(artifacts);
      const verifier = createVerifier({
        pdfEngine: new DssPdfSignatureEngine({ endpoint }),
        paperSigner: new LocalSigner({ issuerId: "acme-retail", keyId: "playground-ephemeral-key" }),
        trustStore: createDemoTrustStore(artifacts.paperSeal.keyInfo),
      });
      setSession({ artifacts, verifier });
      respondJson(response, 200, {
        status: "generated",
        invoiceNumber: artifacts.paperSeal.keyInfo.issuerId === "acme-retail" ? "INV-2026-82919" : "unknown",
        total: "INR 11,800.00",
        paperSeal: { transport: artifacts.paperSeal.transport, url: "/artifacts/invoice-11800/paper-seal.png" },
        pdf: "/artifacts/invoice-11800/sealed.pdf",
      });
      return;
    }
    if (method === "POST" && path === "/api/tamper") {
      const current = requireSession(getSession());
      const tamperedPdf = await createTamperedInvoicePreview(current.artifacts.paperSeal.transport);
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(join(artifactDirectory, "tampered-preview.pdf"), tamperedPdf);
      setSession({ ...current, tamperedPdf });
      respondJson(response, 200, {
        status: "tampered",
        ...describeTamperResult(),
        pdf: "/artifacts/invoice-11800/tampered-preview.pdf",
      });
      return;
    }
    if (method === "POST" && path === "/api/verify") {
      const current = requireSession(getSession());
      const body = await readJsonBody(request);
      const artifact = body.artifact;
      if (artifact === "paper") {
        const result = await current.verifier.verifyPaperText(current.artifacts.paperSeal.transport);
        respondJson(response, 200, result);
        return;
      }
      if (artifact === "original") {
        const result = await current.verifier.verifyPdf(current.artifacts.signedPdf);
        respondJson(response, 200, result);
        return;
      }
      if (artifact === "tampered" && current.tamperedPdf !== undefined) {
        const result = await current.verifier.verifyPdf(current.tamperedPdf);
        respondJson(response, 200, result);
        return;
      }
      throw new PlaygroundError(400, "UNKNOWN_ARTIFACT", "Generate the invoice and choose a supported artifact");
    }
    respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    const playgroundError = asPlaygroundError(error);
    respondJson(response, playgroundError.status, { error: { code: playgroundError.code, message: playgroundError.message } });
  }
}

async function respondStatic(response: ServerResponse, fileName: string): Promise<void> {
  const content = await readFile(join(publicDirectory, fileName));
  const contentType = fileName.endsWith(".js") ? "text/javascript; charset=utf-8" : fileName.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
  response.statusCode = 200;
  response.setHeader("content-type", contentType);
  response.end(content);
}

async function respondArtifact(response: ServerResponse, fileName: string): Promise<void> {
  const allowed = new Map([
    ["sealed.pdf", "application/pdf"],
    ["tampered-preview.pdf", "application/pdf"],
    ["paper-seal.png", "image/png"],
    ["paper-seal.txt", "text/plain; charset=utf-8"],
  ]);
  const contentType = allowed.get(fileName);
  if (contentType === undefined) throw new PlaygroundError(404, "NOT_FOUND", "Artifact not found");
  const content = await readFile(join(artifactDirectory, fileName));
  response.statusCode = 200;
  response.setHeader("content-type", contentType);
  response.setHeader("content-disposition", fileName.endsWith(".pdf") ? `inline; filename="${fileName}"` : "inline");
  response.end(content);
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += bytes.byteLength;
      if (total > MAX_API_BODY_BYTES) {
        request.resume();
        reject(new PlaygroundError(413, "INPUT_TOO_LARGE", "Request body is too large"));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("object required");
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new PlaygroundError(400, "INVALID_JSON", "Request body must be a JSON object"));
      }
    });
    request.on("error", (error) => reject(new PlaygroundError(400, "REQUEST_READ_FAILED", error.message)));
  });
}

function requireSession(session: DemoSession | undefined): DemoSession {
  if (session === undefined) throw new PlaygroundError(409, "DEMO_NOT_GENERATED", "Generate and seal the invoice first");
  return session;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function asPlaygroundError(error: unknown): PlaygroundError {
  if (error instanceof PlaygroundError) return error;
  return new PlaygroundError(500, "PLAYGROUND_FAILED", error instanceof Error ? error.message : "Playground request failed");
}

class PlaygroundError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "PlaygroundError";
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startPlaygroundServer();
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  console.log(`Credaryn playground listening on http://127.0.0.1:${port}`);
}

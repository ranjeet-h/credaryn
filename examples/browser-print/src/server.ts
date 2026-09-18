import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";
import type { DocumentDescriptor } from "@credaryn/core";
import { Credaryn } from "@credaryn/node";
import { renderPaperSealQr } from "@credaryn/paper";
import { DemoTrustStore } from "@credaryn/provider-local/demo-trust-store";
import { LocalSigner } from "@credaryn/provider-local";

const port = Number(process.env.PORT ?? 3010);
const webSourceDirectory = fileURLToPath(new URL("../../../packages/web/src/", import.meta.url));
const maxBodyBytes = 64 * 1024;

// Runtime hardening for every response. The inline <style> in invoice.html is served as an
// external stylesheet so the policy can stay strict (`style-src 'self'`, no `unsafe-inline`).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
}

const signer = new LocalSigner({ issuerId: "acme-retail", keyId: "browser-print-demo-key" });
const credaryn = new Credaryn({
  paperSigner: signer,
  trustStore: new DemoTrustStore([]),
  pdfEngine: {
    sign: async (input) => input,
    verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
  },
  environment: "development",
});

export function createRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    applySecurityHeaders(response);
    try {
      await route(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      sendJson(response, 500, { error: message });
    }
  };
}

export function startServer(): void {
  const server = createServer(createRequestHandler());
  server.listen(port, "127.0.0.1", () => {
    console.log(`Browser print example: http://127.0.0.1:${port}/`);
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) startServer();

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`).pathname;

  if (method === "POST" && path === "/issue-seal") {
    await issueSeal(request, response);
    return;
  }
  if (method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (path === "/web/index.js") {
    await sendWebModule(response, "index.ts");
    return;
  }
  if (path === "/web/prepare-print.js") {
    await sendWebModule(response, "prepare-print.ts");
    return;
  }
  if (path === "/web/print-css.js") {
    await sendWebModule(response, "print-css.ts");
    return;
  }
  if (path === "/web/seal-element.js") {
    await sendWebModule(response, "seal-element.ts");
    return;
  }
  if (path === "/client.js") {
    await sendClient(response);
    return;
  }
  if (path === "/invoice.css") {
    await sendFile(response, new URL("./public/invoice.css", import.meta.url), "text/css; charset=utf-8");
    return;
  }
  if (path === "/" || path === "/invoice.html") {
    await sendFile(response, new URL("./public/invoice.html", import.meta.url), "text/html; charset=utf-8");
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function issueSeal(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let descriptor: DocumentDescriptor;
  try {
    descriptor = JSON.parse(await readBody(request)) as DocumentDescriptor;
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON" });
    return;
  }

  try {
    const transportBytes = await credaryn.createPaperSeal(descriptor);
    const qrText = new TextDecoder().decode(transportBytes);
    const qrBytes = await renderPaperSealQr(qrText, { width: 384 });
    const invoiceNumber = claimString(descriptor, "invoiceNumber", descriptor.documentId);
    const currency = claimString(descriptor, "currency", "INR");
    const totalMinor = claimInteger(descriptor, "totalMinor", 0);
    sendJson(response, 200, {
      qrText,
      qrDataUrl: `data:image/png;base64,${Buffer.from(qrBytes).toString("base64")}`,
      verificationText: `${invoiceNumber} · ${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(totalMinor / 100)}`,
      securityMode: "PAPER_CLAIMS_ONLY",
    });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Seal issuance failed" });
  }
}

async function sendWebModule(response: ServerResponse, fileName: string): Promise<void> {
  const source = await readFile(`${webSourceDirectory}/${fileName}`, "utf8");
  const output = await compileBrowserModule(source, fileName);
  response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
  response.end(output);
}

async function sendClient(response: ServerResponse): Promise<void> {
  const source = await readFile(new URL("./public/client.ts", import.meta.url), "utf8");
  const output = await compileBrowserModule(source, "client.ts");
  response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
  response.end(output);
}

async function compileBrowserModule(source: string, sourceFile: string): Promise<string> {
  return (await transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
    sourcefile: sourceFile,
    sourcemap: false,
  })).code;
}

async function sendFile(response: ServerResponse, url: URL, contentType: string): Promise<void> {
  const body = await readFile(url);
  response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) throw new Error("Request body exceeds the 64 KiB limit");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function claimString(descriptor: DocumentDescriptor, key: string, fallback: string): string {
  const value = descriptor.claims[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function claimInteger(descriptor: DocumentDescriptor, key: string, fallback: number): number {
  const value = descriptor.claims[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

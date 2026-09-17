import type { DocumentDescriptor } from "@credaryn/core";
import { applyPrintCss } from "./print-css.js";
import { injectSeal, type SealIssueResponse } from "./seal-element.js";

const MAX_RESPONSE_BYTES = 64 * 1024;

export interface PreparePrintOptions {
  descriptor: DocumentDescriptor;
  issueSealUrl: string;
  target: string | Element;
  fetchImpl?: typeof fetch;
}

export interface PreparedPrint {
  securityMode: "PAPER_CLAIMS_ONLY";
  qrText: string;
  verificationText: string;
  print(): void;
}

export async function preparePrint(options: PreparePrintOptions): Promise<PreparedPrint> {
  const target = resolveTarget(options.target);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  const response = await fetchImpl(options.issueSealUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(options.descriptor),
  });
  if (!response.ok) throw new Error(`Seal issuance failed with HTTP ${response.status}`);

  const issue = validateIssueResponse(await readJson(response));
  applyPrintCss();
  injectSeal(target, issue);

  return {
    securityMode: "PAPER_CLAIMS_ONLY",
    qrText: issue.qrText,
    verificationText: issue.verificationText,
    print: () => {
      if (typeof globalThis.window?.print !== "function") throw new Error("window.print is unavailable");
      globalThis.window.print();
    },
  };
}

export async function prepareAndPrint(options: PreparePrintOptions): Promise<PreparedPrint> {
  const prepared = await preparePrint(options);
  prepared.print();
  return prepared;
}

function resolveTarget(target: string | Element): Element {
  if (typeof target === "string") {
    if (typeof globalThis.document === "undefined") throw new Error("An explicit print target requires a browser document");
    const selected = globalThis.document.querySelector(target);
    if (selected === null) throw new Error(`Print target was not found: ${target}`);
    return selected;
  }
  if (!isElementLike(target)) throw new Error("An explicit print target element is required");
  return target;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("Seal issuance response exceeds the 64 KiB limit");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Seal issuance response was not valid JSON");
  }
}

function validateIssueResponse(value: unknown): SealIssueResponse {
  if (!isRecord(value)) throw new Error("Seal issuance response must be an object");
  if (typeof value.qrText !== "string" || !value.qrText.startsWith("CRD1:") || value.qrText.length > 16_384) {
    throw new Error("Seal issuance response has an invalid qrText");
  }
  if (typeof value.verificationText !== "string" || value.verificationText.trim() === "" || value.verificationText.length > 4_096) {
    throw new Error("Seal issuance response has an invalid verificationText");
  }
  if (value.securityMode !== "PAPER_CLAIMS_ONLY") {
    throw new Error("Seal issuance response must use securityMode PAPER_CLAIMS_ONLY");
  }
  if (typeof value.qrDataUrl !== "string" || !value.qrDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Seal issuance response has an invalid qrDataUrl");
  }
  return {
    qrText: value.qrText,
    verificationText: value.verificationText,
    securityMode: "PAPER_CLAIMS_ONLY",
    qrDataUrl: value.qrDataUrl,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isElementLike(value: unknown): value is Element {
  return typeof value === "object"
    && value !== null
    && typeof (value as { setAttribute?: unknown }).setAttribute === "function"
    && typeof (value as { append?: unknown }).append === "function";
}

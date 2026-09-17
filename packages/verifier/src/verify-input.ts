import type {
  SignerProvider,
  TrustStore,
  VerificationResult,
} from "@credaryn/core";
import { Credaryn } from "@credaryn/node";
import { MAX_PDF_BYTES as PDF_MAX_BYTES, type PdfSignatureEngine } from "@credaryn/pdf";
import { verifyPaperImage, verifyPaperText } from "./verify-paper.js";
import { verifyPdf } from "./verify-pdf.js";

export const MAX_PAPER_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PAPER_TEXT_BYTES = 64 * 1024;
export const MAX_PDF_BYTES = PDF_MAX_BYTES;

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type DetectedInputKind = "pdf" | "paper-text" | "paper-image";

export interface VerificationInput {
  bytes: Uint8Array;
  contentType?: string;
}

export interface VerifierDependencies {
  pdfEngine: PdfSignatureEngine;
  paperSigner: SignerProvider;
  trustStore: TrustStore;
}

export interface Verifier {
  verifyInput(input: VerificationInput): Promise<VerificationResult>;
  verifyPdf(input: Uint8Array, trustStore?: TrustStore): Promise<VerificationResult>;
  verifyPaperText(input: string, trustStore?: TrustStore): Promise<VerificationResult>;
  verifyPaperImage(input: Uint8Array, trustStore?: TrustStore): Promise<VerificationResult>;
}

export class VerificationInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VerificationInputError";
    this.code = code;
  }
}

export function createVerifier(dependencies: VerifierDependencies): Verifier {
  const sdk = new Credaryn(dependencies);
  return {
    verifyInput: async (input) => {
      const kind = detectInput(input.bytes, input.contentType);
      if (kind === "pdf") return verifyPdf(input.bytes, sdk);
      if (kind === "paper-text") return verifyPaperText(decodeText(input.bytes).trim(), sdk);
      return verifyPaperImage(input.bytes, sdk);
    },
    verifyPdf: async (input, trustStore) => {
      assertSize(input, "application/pdf");
      return verifyPdf(input, sdk, trustStore);
    },
    verifyPaperText: async (input, trustStore) => {
      assertSize(new TextEncoder().encode(input), "text/vnd.credaryn.crd1");
      return verifyPaperText(input, sdk, trustStore);
    },
    verifyPaperImage: async (input, trustStore) => {
      assertSize(input, "image/png");
      return verifyPaperImage(input, sdk, trustStore);
    },
  };
}

export function detectInput(input: Uint8Array, contentType?: string): DetectedInputKind {
  if (!(input instanceof Uint8Array)) {
    throw new VerificationInputError("INVALID_INPUT", "Verification input must be a Uint8Array");
  }
  const normalizedContentType = normalizeContentType(contentType);
  const magicKind = detectMagic(input);

  if (normalizedContentType !== undefined) {
    assertSize(input, normalizedContentType);
    const requestedKind = contentTypeKind(normalizedContentType);
    if (requestedKind === undefined) {
      throw new VerificationInputError("UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${normalizedContentType}`);
    }
    if (magicKind !== undefined && magicKind !== requestedKind) {
      throw new VerificationInputError(
        "AMBIGUOUS_INPUT",
        `Content type ${normalizedContentType} does not match detected ${magicKind} input`,
      );
    }
    if (requestedKind === "pdf" || requestedKind === "paper-image") {
      if (magicKind !== requestedKind) {
        throw new VerificationInputError(
          "AMBIGUOUS_INPUT",
          `Content type ${normalizedContentType} does not match the required ${requestedKind} signature`,
        );
      }
      return requestedKind;
    }
    const text = decodeText(input).trim();
    if (!text.startsWith("CRD1:")) {
      throw new VerificationInputError("AMBIGUOUS_INPUT", "Text input does not start with CRD1:");
    }
    return requestedKind;
  }

  if (magicKind !== undefined) {
    assertSize(input, undefined, magicKind);
    return magicKind;
  }
  assertSize(input, undefined, "paper-text");
  const text = decodeText(input).trim();
  if (text.startsWith("CRD1:")) return "paper-text";
  throw new VerificationInputError("UNKNOWN_INPUT", "Unable to identify a supported PDF, CRD1 text or PNG image");
}

function assertSize(input: Uint8Array, contentType: string | undefined, detectedKind?: DetectedInputKind): void {
  const normalized = normalizeContentType(contentType);
  const maximum = normalized === "image/png" || detectedKind === "paper-image"
    ? MAX_PAPER_IMAGE_BYTES
    : normalized === "text/plain" || normalized === "text/vnd.credaryn.crd1" || detectedKind === "paper-text"
      ? MAX_PAPER_TEXT_BYTES
      : PDF_MAX_BYTES;
  if (input.byteLength > maximum) {
    const label = maximum === MAX_PAPER_IMAGE_BYTES ? "4 MiB" : maximum === MAX_PAPER_TEXT_BYTES ? "64 KiB" : "16 MiB";
    throw new VerificationInputError("INPUT_TOO_LARGE", `Verification input exceeds the maximum size of ${label}`);
  }
}

function normalizeContentType(contentType: string | undefined): string | undefined {
  if (contentType === undefined) return undefined;
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return normalized === undefined || normalized === "" ? undefined : normalized;
}

function contentTypeKind(contentType: string): DetectedInputKind | undefined {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "paper-image";
  if (contentType === "text/plain" || contentType === "text/vnd.credaryn.crd1") return "paper-text";
  return undefined;
}

function detectMagic(input: Uint8Array): DetectedInputKind | undefined {
  if (startsWith(input, PDF_MAGIC)) return "pdf";
  if (startsWith(input, PNG_MAGIC)) return "paper-image";
  return undefined;
}

function startsWith(input: Uint8Array, prefix: Uint8Array): boolean {
  if (input.byteLength < prefix.byteLength) return false;
  return prefix.every((byte, index) => input[index] === byte);
}

function decodeText(input: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new VerificationInputError("INVALID_TEXT", "Text verification input is not valid UTF-8");
  }
}

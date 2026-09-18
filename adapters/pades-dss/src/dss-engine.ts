import type { SignerKeyInfo } from "@credaryn/core";
import type {
  PdfSignatureEngine,
  PdfSigningRequest,
  PdfVerificationRequest,
  PdfVerificationResult,
} from "@credaryn/pdf";
import { assertPdfBytes, toBase64 } from "@credaryn/pdf";
import { normalizePdfVerificationResponse, normalizeSignedPdfResponse } from "./normalizers.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const TSA_REQUIRED = "PAdES B-T requires an explicitly configured RFC 3161 TSA";

export interface DssPdfSignatureEngineOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /**
   * RFC 3161 TSA URL. When set (or when the `DSS_TSA_URL` environment variable is
   * set), this boundary advertises B-T capability and accepts `B-T` signing
   * requests; otherwise only `B-B` is allowed.
   *
   * This is capability declaration only. The Java sidecar must be configured with
   * the same `DSS_TSA_URL`; if it is not, a `B-T` request fails closed with an
   * HTTP 400 rather than silently downgrading to B-B.
   */
  timestampAuthorityUrl?: string;
}

export class DssPdfSignatureEngine implements PdfSignatureEngine {
  /**
   * True only when this engine was told about an RFC 3161 TSA (option or
   * `DSS_TSA_URL`). The DSS boundary can only produce B-T when its Java sidecar
   * has a TSA configured, so an unconfigured boundary must never be asked for B-T.
   */
  readonly supportsTimestamping: boolean;

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DssPdfSignatureEngineOptions) {
    if (!/^https?:\/\//.test(options.endpoint)) throw new Error("DSS endpoint must use HTTP(S)");
    if (!Number.isInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) || (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) < 1) {
      throw new Error("DSS timeout must be a positive integer");
    }
    const configuredTsaUrl = options.timestampAuthorityUrl ?? process.env["DSS_TSA_URL"];
    const tsaUrl = configuredTsaUrl === undefined || configuredTsaUrl.trim() === "" ? undefined : configuredTsaUrl;
    if (tsaUrl !== undefined && !/^https?:\/\//.test(tsaUrl)) throw new Error("DSS TSA URL must use HTTP(S)");
    this.supportsTimestamping = tsaUrl !== undefined;
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async sign(input: Uint8Array, request: PdfSigningRequest): Promise<Uint8Array> {
    assertPdfBytes(input);
    if (request.level === "B-T" && !this.supportsTimestamping) throw new Error(TSA_REQUIRED);
    const signer = await request.signer.getKeyInfo();
    const response = await this.post("/v1/sign", {
      operation: "sign",
      pdfBase64: toBase64(input),
      signatureRequest: { level: request.level, artifactDigest: request.artifactDigest },
      signer: publicSignerMetadata(signer),
    });
    return normalizeSignedPdfResponse(response, request.level);
  }

  async verify(input: Uint8Array, _request: PdfVerificationRequest): Promise<PdfVerificationResult> {
    assertPdfBytes(input);
    const response = await this.post("/v1/verify", {
      operation: "verify",
      pdfBase64: toBase64(input),
    });
    return normalizePdfVerificationResponse(response);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.text();
          if (body.length > 0) detail = `: ${body.slice(0, 512)}`;
        } catch {
          // Preserve the HTTP status when the error response cannot be read.
        }
        throw new Error(`DSS sidecar returned HTTP ${response.status}${detail}`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error("DSS sidecar returned invalid JSON");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("DSS sidecar request timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function publicSignerMetadata(keyInfo: SignerKeyInfo): Record<string, string> {
  return {
    issuerId: keyInfo.issuerId,
    keyId: keyInfo.keyId,
    algorithm: keyInfo.algorithm,
  };
}

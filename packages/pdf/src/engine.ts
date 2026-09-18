import type { SignerProvider } from "../../core/src/signer.js";
import type { TrustStore } from "../../core/src/trust.js";

export const V1_PDF_SIGNATURE_LEVEL = "B-B" as const;

export interface PdfSigningRequest {
  signer: SignerProvider;
  level: "B-B" | "B-T";
  artifactDigest: string;
}

export interface PdfVerificationRequest {
  trustStore: TrustStore;
}

export interface PdfVerificationResult {
  cryptographicValidity: "VALID" | "INVALID" | "UNVERIFIABLE";
  artifactIntegrity: "VALID" | "INVALID" | "UNKNOWN";
  keyId?: string;
  issuerId?: string;
}

export interface PdfSignatureEngine {
  /**
   * Whether this engine can produce RFC 3161 timestamped (B-T) signatures.
   * Absent means the engine makes no claim, so callers must not select B-T.
   */
  readonly supportsTimestamping?: boolean;
  sign(input: Uint8Array, request: PdfSigningRequest): Promise<Uint8Array>;
  verify(input: Uint8Array, request: PdfVerificationRequest): Promise<PdfVerificationResult>;
}

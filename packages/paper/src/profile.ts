import type { DocumentDescriptor } from "../../core/src/document.js";
import type { VerificationResult } from "../../core/src/result.js";
import type { TrustStore } from "../../core/src/trust.js";

export interface PaperVerificationOptions {
  trustStore: TrustStore;
}

export interface PaperSealProfile {
  create(descriptor: DocumentDescriptor): Promise<Uint8Array>;
  verify(payload: Uint8Array, options: PaperVerificationOptions): Promise<VerificationResult>;
}

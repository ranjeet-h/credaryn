import type { DocumentDescriptor, VerificationResult } from "@credaryn/core";
import type { PaperVerificationOptions } from "./verify.js";

export interface PaperSealProfile {
  create(descriptor: DocumentDescriptor): Promise<Uint8Array>;
  verify(payload: Uint8Array, options: PaperVerificationOptions): Promise<VerificationResult>;
}

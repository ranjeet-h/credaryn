import type { DocumentDescriptor, TrustStore } from "@credaryn/core";
import type { Credaryn } from "@credaryn/node";
import type { Verifier } from "@credaryn/verifier";

export interface CliSdk {
  sealPdf(
    pdfBytes: Uint8Array,
    descriptor: DocumentDescriptor,
    options?: { includePaperSeal?: boolean; timestampAuthorityUrl?: string },
  ): Promise<Uint8Array>;
}

export interface CliDependencies {
  sdk: Pick<Credaryn, "sealPdf"> | CliSdk;
  verifier: Verifier;
  withTrustStore?: (trustStore: TrustStore) => Promise<Verifier> | Verifier;
}

export class CliInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CliInputError";
    this.code = code;
  }
}

import { createHash } from "node:crypto";
import {
  assertValidDescriptor,
  createVerificationResult,
  decideTrust,
  type DescriptorEnvironment,
  type DocumentDescriptor,
  type SecurityMode,
  type SignerProvider,
  type TrustStore,
  type VerificationInput,
} from "@credaryn/core";
import { encodePaperSeal, verifyPaperSeal as verifyPaperSealPayload, type PaperVerificationOptions } from "@credaryn/paper";
import type { PdfSignatureEngine, PdfVerificationResult } from "@credaryn/pdf";

export interface SealPdfOptions {
  includePaperSeal?: boolean;
  timestampAuthorityUrl?: string;
}

export interface VerifyPdfOptions {
  trustStore?: TrustStore;
}

export interface CredarynConfig {
  pdfEngine: PdfSignatureEngine;
  paperSigner: SignerProvider;
  trustStore: TrustStore;
  environment?: DescriptorEnvironment;
}

const PAPER_PLACEMENT_REQUIRES_CONTROLLED_PIPELINE = "Paper Seal placement inside a PDF requires a controlled PDF pipeline with an explicit renderer and placement step";

export class Credaryn {
  private readonly pdfEngine: PdfSignatureEngine;
  private readonly paperSigner: SignerProvider;
  private readonly trustStore: TrustStore;
  private readonly environment: DescriptorEnvironment;

  constructor(config: CredarynConfig) {
    this.pdfEngine = config.pdfEngine;
    this.paperSigner = config.paperSigner;
    this.trustStore = config.trustStore;
    this.environment = config.environment ?? "production";
  }

  async sealPdf(
    pdfBytes: Uint8Array,
    descriptor: DocumentDescriptor,
    options: SealPdfOptions = {},
  ): Promise<Uint8Array> {
    assertValidDescriptor(descriptor, { environment: this.environment });
    if (options.includePaperSeal === true) throw new Error(PAPER_PLACEMENT_REQUIRES_CONTROLLED_PIPELINE);

    const artifactDigest = createHash("sha256").update(pdfBytes).digest("hex");
    return this.pdfEngine.sign(pdfBytes, {
      signer: this.paperSigner,
      level: options.timestampAuthorityUrl === undefined ? "B-B" : "B-T",
      artifactDigest: `sha256:${artifactDigest}`,
    });
  }

  async verifyPdf(pdfBytes: Uint8Array, options: VerifyPdfOptions = {}) {
    const trustStore = options.trustStore ?? this.trustStore;
    const engineResult = await this.pdfEngine.verify(pdfBytes, { trustStore });
    const trustDecision = await this.resolveTrust(engineResult, trustStore);
    const securityMode: SecurityMode = "DIGITAL_ARTIFACT_SIGNED";

    const verificationInput: VerificationInput = {
      cryptographicValidity: engineResult.cryptographicValidity,
      trustDecision,
      lifecycleStatus: "UNCHECKED",
      securityMode,
      artifactIntegrity: engineResult.artifactIntegrity,
      evidence: [{
        code: `PDF_${engineResult.cryptographicValidity}`,
        message: `PDF cryptographic validity is ${engineResult.cryptographicValidity.toLowerCase()}`,
      }],
    };
    if (engineResult.issuerId !== undefined) verificationInput.issuerId = engineResult.issuerId;
    if (engineResult.keyId !== undefined) verificationInput.keyId = engineResult.keyId;
    return createVerificationResult(verificationInput);
  }

  async createPaperSeal(descriptor: DocumentDescriptor): Promise<Uint8Array> {
    assertValidDescriptor(descriptor, { environment: this.environment });
    const encoded = await encodePaperSeal(descriptor, this.paperSigner);
    return new TextEncoder().encode(encoded.transport);
  }

  async verifyPaperSeal(
    payload: Uint8Array,
    options: PaperVerificationOptions = {},
  ) {
    return verifyPaperSealPayload(payload, { trustStore: options.trustStore ?? this.trustStore });
  }

  private async resolveTrust(
    engineResult: PdfVerificationResult,
    trustStore: TrustStore,
  ) {
    if (engineResult.cryptographicValidity !== "VALID") return "MISSING" as const;
    if (engineResult.keyId === undefined || engineResult.issuerId === undefined) return "MISSING" as const;
    const matchingKey = await trustStore.resolve(engineResult.keyId, engineResult.issuerId);
    return decideTrust({ trustStoreAvailable: true, matchingKey: matchingKey !== undefined });
  }
}

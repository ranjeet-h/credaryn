import { createHash } from "node:crypto";
import {
  assertValidDescriptor,
  createVerificationResult,
  decideTrust,
  KeyLifecycleError,
  versionedKeyId,
  type DescriptorEnvironment,
  type DocumentDescriptor,
  type KeyLifecycleRegistry,
  type KeyLifecycleState,
  type SecurityMode,
  type SignerProvider,
  type TrustStore,
  type VerificationInput,
} from "@credaryn/core";
import { encodePaperSeal, verifyPaperSeal as verifyPaperSealPayload, type PaperVerificationOptions } from "@credaryn/paper";
import type { PdfSignatureEngine, PdfVerificationResult } from "@credaryn/pdf";

/**
 * The V1 PDF boundary only requires sign/verify. Timestamping (PAdES B-T) is an
 * engine capability, advertised optionally so the SDK can fail fast instead of
 * asking an engine to sign a level it cannot produce.
 */
type TimestampCapablePdfEngine = PdfSignatureEngine & { supportsTimestamping?: boolean };

export interface SealPdfOptions {
  includePaperSeal?: boolean;
  timestampAuthorityUrl?: string;
}

export interface VerifyPdfOptions {
  trustStore?: TrustStore;
}

export interface CredarynConfig {
  pdfEngine: TimestampCapablePdfEngine;
  paperSigner: SignerProvider;
  trustStore: TrustStore;
  environment?: DescriptorEnvironment;
  /**
   * Optional key lifecycle registry. When configured, only keys whose registry
   * record is ACTIVE may sign, and verification results expose the resolved
   * key's lifecycle state.
   */
  keyLifecycle?: KeyLifecycleRegistry;
}

const PAPER_PLACEMENT_REQUIRES_CONTROLLED_PIPELINE = "Paper Seal placement inside a PDF requires a controlled PDF pipeline with an explicit renderer and placement step";
const TIMESTAMPING_REQUIRES_CAPABLE_ENGINE = "PAdES B-T requires a timestamp-authority-capable PDF engine (supportsTimestamping === true); the configured engine does not support timestamping. Omit timestampAuthorityUrl to sign at B-B.";

export class Credaryn {
  private readonly pdfEngine: TimestampCapablePdfEngine;
  private readonly paperSigner: SignerProvider;
  private readonly trustStore: TrustStore;
  private readonly environment: DescriptorEnvironment;
  private readonly keyLifecycle: KeyLifecycleRegistry | undefined;

  constructor(config: CredarynConfig) {
    this.pdfEngine = config.pdfEngine;
    this.paperSigner = config.paperSigner;
    this.trustStore = config.trustStore;
    this.environment = config.environment ?? "production";
    this.keyLifecycle = config.keyLifecycle;
  }

  async sealPdf(
    pdfBytes: Uint8Array,
    descriptor: DocumentDescriptor,
    options: SealPdfOptions = {},
  ): Promise<Uint8Array> {
    assertValidDescriptor(descriptor, { environment: this.environment, requireExplicitCurrency: true });
    if (options.includePaperSeal === true) throw new Error(PAPER_PLACEMENT_REQUIRES_CONTROLLED_PIPELINE);
    this.assertTimestampCapability(options.timestampAuthorityUrl);
    await this.assertSigningKeyIsActive();

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
    if (trustStore.trustSource !== undefined) verificationInput.trustSource = trustStore.trustSource;
    if (engineResult.issuerId !== undefined) verificationInput.issuerId = engineResult.issuerId;
    if (engineResult.keyId !== undefined) verificationInput.keyId = engineResult.keyId;
    const keyLifecycleState = this.lookupKeyLifecycleState(engineResult.issuerId, engineResult.keyId);
    if (keyLifecycleState !== undefined) verificationInput.keyLifecycleState = keyLifecycleState;
    return createVerificationResult(verificationInput);
  }

  async createPaperSeal(descriptor: DocumentDescriptor): Promise<Uint8Array> {
    assertValidDescriptor(descriptor, { environment: this.environment, requireExplicitCurrency: true });
    await this.assertSigningKeyIsActive();
    const encodeOptions: { environment: DescriptorEnvironment } = { environment: this.environment };
    const encoded = await encodePaperSeal(descriptor, this.paperSigner, encodeOptions);
    return new TextEncoder().encode(encoded.transport);
  }

  async verifyPaperSeal(
    payload: Uint8Array,
    options: PaperVerificationOptions = {},
  ) {
    const result = await verifyPaperSealPayload(payload, {
      ...options,
      trustStore: options.trustStore ?? this.trustStore,
    });
    const keyLifecycleState = this.lookupKeyLifecycleState(result.issuerId, result.keyId);
    return keyLifecycleState === undefined ? result : { ...result, keyLifecycleState };
  }

  private async resolveTrust(
    engineResult: PdfVerificationResult,
    trustStore: TrustStore,
  ) {
    if (engineResult.cryptographicValidity !== "VALID") return "MISSING" as const;
    if (engineResult.keyId === undefined || engineResult.issuerId === undefined) return "MISSING" as const;
    if (trustStore.trustSource === "no-trust-material") return "MISSING" as const;
    const matchingKey = await trustStore.resolve(engineResult.keyId, engineResult.issuerId);
    if (matchingKey === undefined) {
      return decideTrust({ trustStoreAvailable: true, matchingKey: false });
    }
    try {
      const trusted = trustStore.isTrusted === undefined
        ? false
        : await trustStore.isTrusted(matchingKey);
      return decideTrust({ trustStoreAvailable: true, matchingKey: trusted });
    } catch {
      return decideTrust({ trustStoreAvailable: false, matchingKey: false });
    }
  }

  private assertTimestampCapability(timestampAuthorityUrl: string | undefined): void {
    if (timestampAuthorityUrl === undefined) return;
    if (this.pdfEngine.supportsTimestamping === true) return;
    throw new Error(TIMESTAMPING_REQUIRES_CAPABLE_ENGINE);
  }

  private async assertSigningKeyIsActive(): Promise<void> {
    const registry = this.keyLifecycle;
    if (registry === undefined) return;
    const keyInfo = await this.paperSigner.getKeyInfo();
    const active = registry.getActive(keyInfo.issuerId);
    if (active === undefined || !sameKeyId(active.identity.keyId, active.identity.version, keyInfo.keyId)) {
      throw new KeyLifecycleError(
        `Signing key ${keyInfo.issuerId}/${keyInfo.keyId} is not ACTIVE; only ACTIVE keys may sign`,
      );
    }
  }

  private lookupKeyLifecycleState(issuerId?: string, keyId?: string): KeyLifecycleState | undefined {
    const registry = this.keyLifecycle;
    if (registry === undefined || issuerId === undefined || keyId === undefined) return undefined;
    for (const record of registry.list(issuerId)) {
      if (!sameKeyId(record.identity.keyId, record.identity.version, keyId)) continue;
      switch (record.status) {
        case "ACTIVE":
        case "RETIRED":
        case "REVOKED":
        case "COMPROMISED":
          return record.status;
        default:
          return undefined;
      }
    }
    return undefined;
  }
}

function sameKeyId(identityKeyId: string, version: string, keyId: string): boolean {
  if (identityKeyId === keyId) return true;
  try {
    return versionedKeyId(identityKeyId, version) === keyId;
  } catch {
    return false;
  }
}

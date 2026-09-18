import type { Claims } from "./document.js";
import type {
  ArtifactIntegrity,
  CryptographicValidity,
  KeyLifecycleState,
  LifecycleStatus,
  SecurityMode,
  VerificationEvidence,
  VerificationResult,
  Verdict,
} from "./result.js";
import { decideTrust, type TrustDecision } from "./policy.js";

export interface VerificationInput {
  cryptographicValidity: CryptographicValidity;
  trustDecision: TrustDecision;
  lifecycleStatus: LifecycleStatus;
  securityMode: SecurityMode;
  artifactIntegrity?: ArtifactIntegrity;
  issuerId?: string;
  keyId?: string;
  trustSource?: string;
  keyLifecycleState?: KeyLifecycleState;
  documentId?: string;
  statusUrl?: string;
  signedClaims?: Claims;
  evidence?: readonly VerificationEvidence[];
}

export function createVerificationResult(input: VerificationInput): VerificationResult {
  const result: VerificationResult = {
    verdict: input.artifactIntegrity === "INVALID"
      ? "INVALID"
      : input.securityMode === "DIGITAL_ARTIFACT_SIGNED" && input.artifactIntegrity !== "VALID"
        ? "UNVERIFIABLE"
      : determineVerdict(input.cryptographicValidity, input.trustDecision, input.artifactIntegrity),
    cryptographicValidity: input.cryptographicValidity,
    trustDecision: input.trustDecision,
    lifecycleStatus: input.lifecycleStatus,
    securityMode: input.securityMode,
    evidence: input.evidence ?? [],
  };
  if (input.issuerId !== undefined) result.issuerId = input.issuerId;
  if (input.keyId !== undefined) result.keyId = input.keyId;
  if (input.trustSource !== undefined) result.trustSource = input.trustSource;
  if (input.artifactIntegrity !== undefined) result.artifactIntegrity = input.artifactIntegrity;
  if (input.keyLifecycleState !== undefined) result.keyLifecycleState = input.keyLifecycleState;
  if (input.documentId !== undefined) result.documentId = input.documentId;
  if (input.statusUrl !== undefined) result.statusUrl = input.statusUrl;
  if (input.signedClaims !== undefined) result.signedClaims = input.signedClaims;
  return result;
}

export function determineVerdict(
  cryptographicValidity: CryptographicValidity,
  trustDecision: TrustDecision,
  artifactIntegrity?: ArtifactIntegrity,
): Verdict {
  if (artifactIntegrity === "INVALID") return "INVALID";
  if (cryptographicValidity === "INVALID") return "INVALID";
  if (cryptographicValidity === "UNVERIFIABLE") return "UNVERIFIABLE";
  return decideTrust({
    trustStoreAvailable: trustDecision !== "MISSING",
    matchingKey: trustDecision === "TRUSTED",
  }) === "TRUSTED"
    ? "VALID_TRUSTED"
    : trustDecision === "UNTRUSTED"
      ? "VALID_UNTRUSTED"
      : "UNVERIFIABLE";
}

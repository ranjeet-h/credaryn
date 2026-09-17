import type { Claims } from "./document.js";
import type {
  ArtifactIntegrity,
  CryptographicValidity,
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
  signedClaims?: Claims;
  evidence?: readonly VerificationEvidence[];
}

export function createVerificationResult(input: VerificationInput): VerificationResult {
  const result: VerificationResult = {
    verdict: determineVerdict(input.cryptographicValidity, input.trustDecision),
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
  if (input.signedClaims !== undefined) result.signedClaims = input.signedClaims;
  return result;
}

export function determineVerdict(
  cryptographicValidity: CryptographicValidity,
  trustDecision: TrustDecision,
): Verdict {
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

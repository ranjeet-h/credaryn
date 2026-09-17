import type { Claims } from "./document.js";

export type Verdict = "VALID_TRUSTED" | "VALID_UNTRUSTED" | "INVALID" | "UNVERIFIABLE";
export type LifecycleStatus = "ACTIVE" | "REVOKED" | "CANCELLED" | "SUPERSEDED" | "EXPIRED" | "UNCHECKED";
export type SecurityMode = "DIGITAL_ARTIFACT_SIGNED" | "PAPER_CLAIMS_ONLY";
export type ArtifactIntegrity = "VALID" | "INVALID" | "NOT_APPLICABLE" | "UNKNOWN";

export interface VerificationEvidence {
  code: string;
  message: string;
}

export interface VerificationResult {
  verdict: Verdict;
  lifecycleStatus: LifecycleStatus;
  issuerId?: string;
  keyId?: string;
  trustSource?: string;
  securityMode: SecurityMode;
  artifactIntegrity?: ArtifactIntegrity;
  signedClaims?: Claims;
  evidence: readonly VerificationEvidence[];
}

import type { VerificationResult } from "@credaryn/core";

export function normalizeVerificationResult(result: VerificationResult): VerificationResult {
  const normalized: VerificationResult = {
    verdict: result.verdict,
    cryptographicValidity: result.cryptographicValidity,
    trustDecision: result.trustDecision,
    lifecycleStatus: result.lifecycleStatus,
    securityMode: result.securityMode,
    evidence: result.evidence.map(({ code, message }) => ({ code, message })),
  };
  if (result.issuerId !== undefined) normalized.issuerId = result.issuerId;
  if (result.keyId !== undefined) normalized.keyId = result.keyId;
  if (result.trustSource !== undefined) normalized.trustSource = result.trustSource;
  if (result.artifactIntegrity !== undefined) normalized.artifactIntegrity = result.artifactIntegrity;
  if (result.signedClaims !== undefined) {
    normalized.signedClaims = Object.fromEntries(
      Object.entries(result.signedClaims).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
    );
  }
  return normalized;
}

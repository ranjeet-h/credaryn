import type { PdfVerificationResult } from "./engine.js";

export function isArtifactIntegrityValid(result: PdfVerificationResult): boolean {
  return result.cryptographicValidity === "VALID" && result.artifactIntegrity === "VALID";
}

export function isQualifiedSignatureClaimed(result: unknown): boolean {
  return isRecord(result) && result.qualifiedSignature === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

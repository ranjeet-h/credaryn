import type { PdfVerificationResult } from "@credaryn/pdf";

export function normalizeSignedPdfResponse(value: unknown): Uint8Array {
  const response = asRecord(value, "DSS signing response");
  if (response.status !== "signed") throw new Error("DSS signing response status must be signed");
  if (response.signatureLevel !== "B-B") throw new Error("DSS signing response must use PAdES Baseline B-B");
  if (response.qualifiedSignature !== false) {
    throw new Error("DSS PAdES response cannot claim qualified electronic-signature status");
  }
  if (response.cryptographicValidity !== "VALID" || response.artifactIntegrity !== "VALID") {
    throw new Error("DSS signing response must report valid cryptography and artifact integrity");
  }
  return decodeBase64(response.signedPdfBase64, "signedPdfBase64");
}

export function normalizePdfVerificationResponse(value: unknown): PdfVerificationResult {
  const response = asRecord(value, "DSS verification response");
  if (response.qualifiedSignature !== false) {
    throw new Error("DSS PAdES response cannot claim qualified electronic-signature status");
  }
  if (!isCryptographicValidity(response.cryptographicValidity)) {
    throw new Error("DSS verification response has an invalid cryptographic validity");
  }
  if (!isArtifactIntegrity(response.artifactIntegrity)) {
    throw new Error("DSS verification response has an invalid artifact integrity");
  }
  const unknownLevelInvalid = response.signatureLevel !== "B-B"
    && response.cryptographicValidity === "INVALID"
    && response.artifactIntegrity === "INVALID";
  if (response.signatureLevel !== "B-B" && !unknownLevelInvalid) {
    throw new Error("DSS verification response must identify PAdES Baseline B-B");
  }
  const result: PdfVerificationResult = {
    cryptographicValidity: response.cryptographicValidity,
    artifactIntegrity: response.artifactIntegrity,
  };
  if (typeof response.issuerId === "string") result.issuerId = response.issuerId;
  if (typeof response.keyId === "string") result.keyId = response.keyId;
  return result;
}

function decodeBase64(value: unknown, field: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`DSS response field ${field} must be valid base64`);
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function isCryptographicValidity(value: unknown): value is PdfVerificationResult["cryptographicValidity"] {
  return value === "VALID" || value === "INVALID" || value === "UNVERIFIABLE";
}

function isArtifactIntegrity(value: unknown): value is PdfVerificationResult["artifactIntegrity"] {
  return value === "VALID" || value === "INVALID" || value === "UNKNOWN";
}

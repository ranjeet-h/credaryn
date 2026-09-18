import type { DocumentDescriptor, TrustStore, VerificationResult } from "@credaryn/core";
import { createVerificationResult } from "@credaryn/core";
import { decodePaperSeal, type DecodedPaperSeal } from "./decode.js";
import { verifyCoseSign1 } from "./cose.js";

export interface PaperVerificationOptions {
  trustStore?: TrustStore;
  expectedDescriptor?: DocumentDescriptor;
}

export async function verifyPaperSeal(
  input: string | Uint8Array,
  options: PaperVerificationOptions = {},
): Promise<VerificationResult> {
  let decoded: DecodedPaperSeal;
  try {
    decoded = decodePaperSeal(input);
  } catch (error) {
    return createVerificationResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      evidence: [{
        code: "PAPER_INPUT_INVALID",
        message: error instanceof Error ? error.message : "Paper Seal input is invalid",
      }],
    });
  }

  const cose = await verifyCoseSign1(decoded.cose, {
    issuerId: decoded.profile.issuerId,
    ...(decoded.profile.certificateFingerprint === undefined
      ? {}
      : { certificateFingerprint: decoded.profile.certificateFingerprint }),
    ...(options.trustStore === undefined ? {} : { trustStore: options.trustStore }),
  });
  if (cose.keyId !== decoded.profile.keyId) {
    return createPaperResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: decoded.profile.issuerId,
      keyId: decoded.profile.keyId,
      evidence: [{ code: "PAPER_KEY_ID_MISMATCH", message: "COSE key ID does not match the signed payload" }],
    }, decoded.profile);
  }
  if (options.expectedDescriptor !== undefined && !matchesDescriptor(decoded.profile, options.expectedDescriptor)) {
    return createPaperResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: decoded.profile.issuerId,
      keyId: decoded.profile.keyId,
      evidence: [{ code: "PAPER_DOCUMENT_MISMATCH", message: "Paper Seal claims do not match the expected document" }],
    }, decoded.profile);
  }
  if (cose.cryptographicValidity === "VALID"
    && decoded.profile.certificateFingerprint !== undefined
    && cose.certificateFingerprint !== decoded.profile.certificateFingerprint) {
    return createPaperResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: decoded.profile.issuerId,
      keyId: decoded.profile.keyId,
      evidence: [{
        code: "PAPER_CERTIFICATE_FINGERPRINT_MISMATCH",
        message: "Paper Seal certificate fingerprint does not match the trusted signing key",
      }],
    }, decoded.profile);
  }

  const verificationInput = {
    cryptographicValidity: cose.cryptographicValidity,
    trustDecision: cose.trustDecision,
    lifecycleStatus: "UNCHECKED",
    securityMode: "PAPER_CLAIMS_ONLY",
    artifactIntegrity: "NOT_APPLICABLE",
    issuerId: decoded.profile.issuerId,
    keyId: decoded.profile.keyId,
    ...(cose.cryptographicValidity === "VALID" ? { signedClaims: decoded.profile.claims } : {}),
    evidence: [{
      code: `PAPER_${cose.cryptographicValidity}`,
      message: `Paper Seal cryptographic validity is ${cose.cryptographicValidity.toLowerCase()}`,
    }],
  } as const;
  if (options.trustStore?.trustSource !== undefined) {
    return createPaperResult({ ...verificationInput, trustSource: options.trustStore.trustSource }, decoded.profile);
  }
  return createPaperResult(verificationInput, decoded.profile);
}

function createPaperResult(
  input: Parameters<typeof createVerificationResult>[0],
  profile?: DecodedPaperSeal["profile"],
): VerificationResult {
  if (profile === undefined) return createVerificationResult(input);
  return createVerificationResult({
    ...input,
    documentId: profile.documentId,
    ...(profile.statusUrl === undefined ? {} : { statusUrl: profile.statusUrl }),
  });
}

function matchesDescriptor(
  profile: DecodedPaperSeal["profile"],
  descriptor: DocumentDescriptor,
): boolean {
  if (profile.issuerId !== descriptor.issuerId
    || profile.documentId !== descriptor.documentId
    || profile.documentType !== descriptor.documentType
    || profile.issuedAt !== descriptor.issuedAt
    || profile.statusUrl !== descriptor.statusUrl) {
    return false;
  }
  const expectedClaimKeys = Object.keys(descriptor.claims);
  const actualClaimKeys = Object.keys(profile.claims);
  if (expectedClaimKeys.length !== actualClaimKeys.length) return false;
  return expectedClaimKeys.every((key) => profile.claims[key] === descriptor.claims[key]);
}

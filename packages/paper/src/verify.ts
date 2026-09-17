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

  const cose = await verifyCoseSign1(
    decoded.cose,
    options.trustStore === undefined
      ? { issuerId: decoded.profile.issuerId }
      : { issuerId: decoded.profile.issuerId, trustStore: options.trustStore },
  );
  if (cose.keyId !== decoded.profile.keyId) {
    return createVerificationResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: decoded.profile.issuerId,
      keyId: decoded.profile.keyId,
      signedClaims: decoded.profile.claims,
      evidence: [{ code: "PAPER_KEY_ID_MISMATCH", message: "COSE key ID does not match the signed payload" }],
    });
  }
  if (options.expectedDescriptor !== undefined && !matchesDescriptor(decoded.profile, options.expectedDescriptor)) {
    return createVerificationResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      issuerId: decoded.profile.issuerId,
      keyId: decoded.profile.keyId,
      signedClaims: decoded.profile.claims,
      evidence: [{ code: "PAPER_DOCUMENT_MISMATCH", message: "Paper Seal claims do not match the expected document" }],
    });
  }

  const verificationInput = {
    cryptographicValidity: cose.cryptographicValidity,
    trustDecision: cose.trustDecision,
    lifecycleStatus: "UNCHECKED",
    securityMode: "PAPER_CLAIMS_ONLY",
    artifactIntegrity: "NOT_APPLICABLE",
    issuerId: decoded.profile.issuerId,
    keyId: decoded.profile.keyId,
    signedClaims: decoded.profile.claims,
    evidence: [{
      code: `PAPER_${cose.cryptographicValidity}`,
      message: `Paper Seal cryptographic validity is ${cose.cryptographicValidity.toLowerCase()}`,
    }],
  } as const;
  if (options.trustStore?.trustSource !== undefined) {
    return createVerificationResult({ ...verificationInput, trustSource: options.trustStore.trustSource });
  }
  return createVerificationResult(verificationInput);
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

import type { TrustStore, VerificationResult } from "@credaryn/core";
import { createVerificationResult } from "@credaryn/core";
import { decodePaperSeal, type DecodedPaperSeal } from "./decode.js";
import { verifyCoseSign1 } from "./cose.js";

export interface PaperVerificationOptions {
  trustStore?: TrustStore;
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

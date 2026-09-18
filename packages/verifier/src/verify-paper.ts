import { createVerificationResult, type DocumentDescriptor, type TrustStore, type VerificationResult } from "@credaryn/core";
import type { Credaryn } from "@credaryn/node";
import { decodePaperSealQr } from "@credaryn/paper";
import { normalizeVerificationResult } from "./result-normalizer.js";

export async function verifyPaperText(
  input: string,
  sdk: Credaryn,
  trustStore?: TrustStore,
  expectedDescriptor?: DocumentDescriptor,
): Promise<VerificationResult> {
  const result = await sdk.verifyPaperSeal(
    new TextEncoder().encode(input),
    {
      ...(trustStore === undefined ? {} : { trustStore }),
      ...(expectedDescriptor === undefined ? {} : { expectedDescriptor }),
    },
  );
  return normalizeVerificationResult(result);
}

export async function verifyPaperImage(
  input: Uint8Array,
  sdk: Credaryn,
  trustStore?: TrustStore,
  expectedDescriptor?: DocumentDescriptor,
): Promise<VerificationResult> {
  let transport: string;
  try {
    transport = decodePaperSealQr(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paper Seal QR image is invalid";
    return normalizeVerificationResult(createVerificationResult({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      lifecycleStatus: "UNCHECKED",
      securityMode: "PAPER_CLAIMS_ONLY",
      artifactIntegrity: "NOT_APPLICABLE",
      evidence: [{ code: "PAPER_IMAGE_INVALID", message }],
    }));
  }
  return verifyPaperText(transport, sdk, trustStore, expectedDescriptor);
}

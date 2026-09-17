import type { TrustStore, VerificationResult } from "@credaryn/core";
import type { Credaryn } from "@credaryn/node";
import { normalizeVerificationResult } from "./result-normalizer.js";

export async function verifyPdf(
  input: Uint8Array,
  sdk: Credaryn,
  trustStore?: TrustStore,
): Promise<VerificationResult> {
  const result = await sdk.verifyPdf(input, trustStore === undefined ? {} : { trustStore });
  return normalizeVerificationResult(result);
}

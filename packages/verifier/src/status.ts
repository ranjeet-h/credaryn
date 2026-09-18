import type { LifecycleStatus, VerificationResult } from "@credaryn/core";

export type StatusFreshness = "FRESH" | "STALE" | "UNAVAILABLE";

export type StatusResolver = (input: {
  issuerId: string;
  keyId?: string;
  documentId: string;
  statusUrl?: string;
}) => Promise<{ status: LifecycleStatus; freshness: StatusFreshness }>;

/**
 * Applies an optional lifecycle-status lookup to an already-computed verification result.
 *
 * Status is descriptive only: it never changes the cryptographic validity, trust decision or
 * verdict. Any missing reference, resolver failure or UNAVAILABLE freshness leaves the result
 * `UNCHECKED`.
 */
export async function applyStatusResolver(
  result: VerificationResult,
  statusResolver: StatusResolver | undefined,
): Promise<VerificationResult> {
  if (statusResolver === undefined || result.issuerId === undefined) return result;
  if (result.documentId === undefined) return result;
  let lookup: { status: LifecycleStatus; freshness: StatusFreshness };
  try {
    lookup = await statusResolver({
      issuerId: result.issuerId,
      ...(result.keyId === undefined ? {} : { keyId: result.keyId }),
      documentId: result.documentId,
      ...(result.statusUrl === undefined ? {} : { statusUrl: result.statusUrl }),
    });
  } catch {
    return result;
  }
  if (lookup === undefined || lookup.freshness === "UNAVAILABLE") return result;
  return {
    ...result,
    lifecycleStatus: lookup.status,
    evidence: [
      ...result.evidence,
      {
        code: `STATUS_${lookup.status}`,
        message: `Status service reports ${lookup.status} with ${lookup.freshness} freshness`,
      },
    ],
  };
}

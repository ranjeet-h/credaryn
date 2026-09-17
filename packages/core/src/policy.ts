export type TrustDecision = "TRUSTED" | "UNTRUSTED" | "MISSING";

export interface TrustResolution {
  trustStoreAvailable: boolean;
  matchingKey: boolean;
}

export function decideTrust(resolution: TrustResolution): TrustDecision {
  if (!resolution.trustStoreAvailable) return "MISSING";
  return resolution.matchingKey ? "TRUSTED" : "UNTRUSTED";
}

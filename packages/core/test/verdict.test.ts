import { describe, expect, it } from "vitest";
import { createVerificationResult } from "../src/verdict.js";

const baseInput = {
  cryptographicValidity: "VALID" as const,
  trustDecision: "TRUSTED" as const,
  lifecycleStatus: "ACTIVE" as const,
  issuerId: "acme-retail",
  keyId: "key-1",
  securityMode: "DIGITAL_ARTIFACT_SIGNED" as const,
  artifactIntegrity: "VALID" as const,
};

describe("verification verdict policy", () => {
  it.each([
    ["trusted signature", "TRUSTED", "VALID_TRUSTED"],
    ["valid signature with an untrusted key", "UNTRUSTED", "VALID_UNTRUSTED"],
    ["missing trust material", "MISSING", "UNVERIFIABLE"],
  ] as const)("classifies %s independently of signature validity", (_name, trustDecision, verdict) => {
    expect(createVerificationResult({ ...baseInput, trustDecision }).verdict).toBe(verdict);
  });

  it("classifies a bad signature as invalid regardless of trust", () => {
    expect(createVerificationResult({
      ...baseInput,
      cryptographicValidity: "INVALID",
      trustDecision: "TRUSTED",
    })).toMatchObject({ verdict: "INVALID", lifecycleStatus: "ACTIVE" });
  });

  it("classifies unavailable cryptographic evidence as unverifiable", () => {
    expect(createVerificationResult({
      ...baseInput,
      cryptographicValidity: "UNVERIFIABLE",
      trustDecision: "TRUSTED",
    }).verdict).toBe("UNVERIFIABLE");
  });

  it("keeps lifecycle state separate from the authenticity verdict", () => {
    const result = createVerificationResult({
      ...baseInput,
      lifecycleStatus: "REVOKED",
    });

    expect(result.verdict).toBe("VALID_TRUSTED");
    expect(result).toMatchObject({ cryptographicValidity: "VALID", trustDecision: "TRUSTED" });
    expect(result.lifecycleStatus).toBe("REVOKED");
  });

  it("preserves signed claims and evidence without inventing trust", () => {
    const result = createVerificationResult({
      ...baseInput,
      trustDecision: "UNTRUSTED",
      signedClaims: { totalMinor: 1_180_000, paid: false },
      evidence: [{ code: "SIGNATURE_VALID", message: "Signature verifies" }],
    });

    expect(result).toMatchObject({
      verdict: "VALID_UNTRUSTED",
      signedClaims: { totalMinor: 1_180_000, paid: false },
      evidence: [{ code: "SIGNATURE_VALID" }],
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { VerificationResult } from "@credaryn/core";
import { CredarynVerifierElement, defineCredarynVerifier } from "../src/credaryn-verifier.js";
import { renderResultView, toResultViewModel } from "../src/result-view.js";

const result: VerificationResult = {
  verdict: "VALID_TRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "TRUSTED",
  lifecycleStatus: "ACTIVE",
  issuerId: "acme-retail",
  keyId: "issuer-key@v2",
  trustSource: "configured-public-key",
  securityMode: "PAPER_CLAIMS_ONLY",
  artifactIntegrity: "NOT_APPLICABLE",
  signedClaims: { currency: "INR", totalMinor: 1180000 },
  evidence: [{ code: "PAPER_VALID", message: "Paper Seal is valid" }],
};

describe("Credaryn verifier widget view model", () => {
  it("keeps cryptography, trust, lifecycle, claims and security mode as separate cards", () => {
    expect(toResultViewModel(result)).toEqual({
      verdict: "VALID_TRUSTED",
      cards: [
        { label: "Cryptographic validity", value: "VALID" },
        { label: "Issuer trust", value: "TRUSTED" },
        { label: "Artifact integrity", value: "NOT_APPLICABLE" },
        { label: "Signed claims", value: '{"currency":"INR","totalMinor":1180000}' },
        { label: "Lifecycle status", value: "ACTIVE" },
        { label: "Security mode", value: "PAPER_CLAIMS_ONLY" },
      ],
      evidence: ["PAPER_VALID: Paper Seal is valid"],
    });
  });

  it("escapes result content before placing it in a custom-element template", () => {
    const html = renderResultView({
      ...toResultViewModel(result),
      cards: [{ label: "Issuer trust", value: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("Credaryn verifier widget element", () => {
  const originalCustomElements = (globalThis as { customElements?: unknown }).customElements;

  afterEach(() => {
    if (originalCustomElements === undefined) {
      delete (globalThis as { customElements?: unknown }).customElements;
    } else {
      (globalThis as { customElements?: unknown }).customElements = originalCustomElements;
    }
  });

  it("defines and instantiates the embeddable custom element", () => {
    const registry = new Map<string, unknown>();
    (globalThis as { customElements?: unknown }).customElements = {
      get: (name: string) => registry.get(name),
      define: (name: string, constructor: unknown) => { registry.set(name, constructor); },
    };

    defineCredarynVerifier("credaryn-verifier");
    expect(registry.get("credaryn-verifier")).toBe(CredarynVerifierElement);

    const element = new CredarynVerifierElement() as CredarynVerifierElement & { innerHTML: string };
    element.setResult(result);
    expect(element.innerHTML).toContain("VALID_TRUSTED");
    expect(element.innerHTML).toContain("Lifecycle status");
    expect(element.innerHTML).toContain("PAPER_CLAIMS_ONLY");
    expect(element.innerHTML).toContain("Signed claims");
  });
});

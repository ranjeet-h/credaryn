import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor } from "../src/document.js";
import { normalizeDescriptor, validateDescriptor } from "../src/validate-descriptor.js";

const baseDescriptor = {
  issuerId: "property-issuer",
  documentId: "property-document",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
};

describe("descriptor properties", () => {
  it("normalizes every generated supported claim map deterministically", () => {
    const claimKey = fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/);
    const claimValue = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
    );

    fc.assert(fc.property(fc.dictionary(claimKey, claimValue, { maxKeys: 8 }), (claims) => {
      const descriptor: DocumentDescriptor = { ...baseDescriptor, claims };
      const result = validateDescriptor(descriptor);
      expect(result.valid).toBe(true);
      if (!result.valid) throw new Error("valid descriptor was rejected");

      const reversedClaims = Object.fromEntries(Object.entries(claims).reverse());
      const reversed = validateDescriptor({ ...descriptor, claims: reversedClaims });
      expect(reversed.valid).toBe(true);
      if (!reversed.valid) throw new Error("valid reversed descriptor was rejected");

      expect(JSON.stringify(normalizeDescriptor(result.descriptor))).toBe(
        JSON.stringify(normalizeDescriptor(reversed.descriptor)),
      );
    }), { seed: 20260917, numRuns: 100 });
  });

  it("rejects generated unsupported claim shapes", () => {
    const unsupported = fc.oneof(
      fc.float({ noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 }),
      fc.array(fc.string(), { maxLength: 3 }),
      fc.record({ nested: fc.string() }),
    );

    fc.assert(fc.property(unsupported, (value) => {
      const result = validateDescriptor({ ...baseDescriptor, claims: { unsupported: value } });
      expect(result.valid).toBe(false);
    }), { seed: 20260918, numRuns: 50 });
  });
});

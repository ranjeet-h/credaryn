import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VerificationInputError, detectInput } from "../../src/verify-input.js";

describe("unified verifier bounded fuzz inputs", () => {
  it("never leaks parser exceptions for arbitrary bounded bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 4_096 }), (input) => {
      try {
        detectInput(input);
      } catch (error) {
        expect(error).toBeInstanceOf(VerificationInputError);
      }
    }), { seed: 20260921, numRuns: 250 });
  });
});

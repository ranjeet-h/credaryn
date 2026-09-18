import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodePaperSeal, PaperSealDecodeError } from "../../src/decode.js";

describe("Paper Seal bounded fuzz inputs", () => {
  it("rejects or safely classifies arbitrary bounded transport bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 4_096 }), (input) => {
      try {
        decodePaperSeal(input);
      } catch (error) {
        expect(error).toBeInstanceOf(PaperSealDecodeError);
      }
    }), { seed: 20260920, numRuns: 250 });
  });
});

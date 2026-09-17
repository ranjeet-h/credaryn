import { describe, expect, it } from "vitest";
import {
  Base45Error,
  MAX_BASE45_BINARY_BYTES,
  decodeBase45,
  encodeBase45,
} from "../src/base45.js";

describe("RFC 9285 Base45", () => {
  it.each([
    ["Hello!!", "%69 VD92EX0"],
    ["base-45", "UJCLQE7W581"],
    ["ietf!", "QED8WEX0"],
  ])("encodes the RFC known answer %s", (input, expected) => {
    expect(encodeBase45(new TextEncoder().encode(input))).toBe(expected);
  });

  it("round-trips both two-byte and one-byte groups", () => {
    const input = new Uint8Array([0, 1, 2, 44, 255]);

    expect(decodeBase45(encodeBase45(input))).toEqual(input);
  });

  it.each(["!", "abcde!", "1234"])("rejects malformed Base45 text %s", (input) => {
    expect(() => decodeBase45(input)).toThrow(Base45Error);
  });

  it("rejects oversized binary and encoded inputs before allocating unbounded output", () => {
    expect(() => encodeBase45(new Uint8Array(MAX_BASE45_BINARY_BYTES + 1))).toThrow(/maximum.*bytes/i);
    expect(() => decodeBase45("0".repeat(MAX_BASE45_BINARY_BYTES * 2))).toThrow(/maximum.*(bytes|size)/i);
  });
});

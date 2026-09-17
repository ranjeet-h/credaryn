import { describe, expect, it } from "vitest";
import {
  CborDecodeError,
  CborEncodeError,
  decodeDeterministicCbor,
  encodeDeterministicCbor,
} from "../src/cbor.js";

describe("deterministic CBOR", () => {
  it("sorts map keys by their encoded CBOR bytes", () => {
    const encoded = encodeDeterministicCbor({ b: 2, a: 1 });

    expect(Buffer.from(encoded).toString("hex")).toBe("a2616101616202");
  });

  it("uses compact integer, string and boolean representations", () => {
    const encoded = encodeDeterministicCbor({ active: true, count: 23, label: "ok" });

    expect(Buffer.from(encoded).toString("hex")).toBe(
      "a365636f756e7417656c6162656c626f6b66616374697665f5",
    );
    expect(decodeDeterministicCbor(encoded)).toEqual(new Map<unknown, unknown>([
      ["count", 23],
      ["label", "ok"],
      ["active", true],
    ]));
  });

  it("encodes byte strings and arrays needed by COSE", () => {
    const encoded = encodeDeterministicCbor([new Uint8Array([1, 2]), "payload", false]);

    expect(Buffer.from(encoded).toString("hex")).toBe("83420102677061796c6f6164f4");
  });

  it.each([
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    undefined,
    new Date("2026-01-01T00:00:00Z"),
    () => "not-a-cbor-value",
  ])("rejects unsupported deterministic value %s", (value) => {
    expect(() => encodeDeterministicCbor(value)).toThrow(CborEncodeError);
  });

  it("rejects truncated, indefinite-length and trailing CBOR input", () => {
    expect(() => decodeDeterministicCbor(new Uint8Array([0x18]))).toThrow(CborDecodeError);
    expect(() => decodeDeterministicCbor(new Uint8Array([0x9f, 0x01, 0xff]))).toThrow(CborDecodeError);
    expect(() => decodeDeterministicCbor(new Uint8Array([0x01, 0x01]))).toThrow(CborDecodeError);
  });
});

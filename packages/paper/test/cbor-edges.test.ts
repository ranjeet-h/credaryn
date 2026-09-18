import { describe, expect, it } from "vitest";
import {
  CborDecodeError,
  CborEncodeError,
  decodeDeterministicCbor,
  encodeDeterministicCbor,
  MAX_CBOR_BYTES,
} from "../src/cbor.js";

describe("deterministic CBOR limits and malformed input", () => {
  it("rejects arrays and maps over the configured item limit", () => {
    expect(() => encodeDeterministicCbor(new Array<boolean>(257).fill(true))).toThrow(/item limit/);
    const oversizedMap = new Map<number, boolean>(
      Array.from({ length: 257 }, (_, index) => [index, true] as const),
    );
    expect(() => encodeDeterministicCbor(oversizedMap)).toThrow(/item limit/);
  });

  it("rejects values nested deeper than the configured limit", () => {
    let nested: unknown = true;
    for (let depth = 0; depth < 18; depth += 1) nested = [nested];

    expect(() => encodeDeterministicCbor(nested)).toThrow(/nesting depth/);
  });

  it("encodes and round-trips the 64-bit integer length form", () => {
    const encoded = encodeDeterministicCbor(Number.MAX_SAFE_INTEGER);

    expect(encoded[0]).toBe(0x1b);
    expect(decodeDeterministicCbor(encoded)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects duplicate encoded map keys on encode", () => {
    const duplicate = new Map<number, unknown>([[1, "first"]]);
    Object.defineProperty(duplicate, "entries", {
      value: () => ([[1, "first"], [1, "second"]] as const)[Symbol.iterator](),
    });

    expect(() => encodeDeterministicCbor(duplicate)).toThrow(/duplicate keys/);
  });

  it("wraps unexpected encoding failures as a CBOR encode error", () => {
    const throwing = new Proxy({}, {
      getPrototypeOf: () => Object.prototype,
      ownKeys: () => {
        throw new Error("hostile object");
      },
    });

    expect(() => encodeDeterministicCbor(throwing)).toThrow(CborEncodeError);
  });

  it("rejects non-byte and oversized decode input", () => {
    expect(() => decodeDeterministicCbor(null as unknown as Uint8Array)).toThrow(CborDecodeError);
    expect(() => decodeDeterministicCbor(new Uint8Array(MAX_CBOR_BYTES + 1))).toThrow(/maximum/);
  });

  it.each([
    ["duplicate map keys", [0xa2, 0x01, 0x61, 0x61, 0x01, 0x61, 0x62]],
    ["tags", [0xc0, 0x00]],
    ["floating point", [0xfb, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]],
    ["invalid length encoding", [0x1c]],
    ["non-canonical length", [0x18, 0x17]],
    ["length beyond safe integers", [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
    ["collection over item limit", [0xb9, 0x01, 0x01]],
    ["byte string over remaining input", [0x43, 0x01, 0x02]],
    ["invalid UTF-8 text", [0x61, 0xff]],
  ])("rejects %s", (_name, bytes) => {
    expect(() => decodeDeterministicCbor(new Uint8Array(bytes))).toThrow(CborDecodeError);
  });

  it("rejects input nested deeper than the configured decode limit", () => {
    const bytes = new Uint8Array(18 + 1);
    bytes.fill(0x81, 0, 18);
    bytes[18] = 0xf5;

    expect(() => decodeDeterministicCbor(bytes)).toThrow(/nesting depth/);
  });
});

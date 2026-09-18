import { describe, expect, it } from "vitest";
import { encodeBase45 } from "../src/base45.js";
import { encodeDeterministicCbor } from "../src/cbor.js";
import { encodeCoseSign1Parts } from "../src/cose.js";
import { PaperSealDecodeError, decodePaperSeal } from "../src/decode.js";

function envelope(payload: Uint8Array): string {
  const cose = encodeCoseSign1Parts({
    protectedHeaders: new Map<number, unknown>([[1, -7], [4, new TextEncoder().encode("key-1")]]),
    unprotectedHeaders: new Map(),
    payload,
    signature: new Uint8Array(64),
  });
  return `CRD1:${encodeBase45(cose)}`;
}

function profile(overrides: Record<number, unknown> = {}): Uint8Array {
  const map = new Map<number, unknown>([
    [1, 1],
    [2, "acme-retail"],
    [3, "key-1"],
    [4, "INV-2026-82919"],
    [5, "invoice"],
    [6, "2026-01-01T00:00:00Z"],
    [7, new Map<unknown, unknown>([["invoiceNumber", "INV-2026-82919"]])],
  ]);
  for (const [key, value] of Object.entries(overrides)) map.set(Number(key), value);
  return encodeDeterministicCbor(map);
}

describe("Paper Seal payload decoding failures", () => {
  it("rejects non-byte input and invalid UTF-8 transport bytes", () => {
    expect(() => decodePaperSeal(null as unknown as Uint8Array)).toThrow(PaperSealDecodeError);
    expect(() => decodePaperSeal(new Uint8Array([0x89]))).toThrow(/not valid UTF-8/);
  });

  it("rejects a payload that is not valid CBOR or not a map", () => {
    expect(() => decodePaperSeal(envelope(new Uint8Array([0xff])))).toThrow(/indefinite-length CBOR/);
    expect(() => decodePaperSeal(envelope(encodeDeterministicCbor([1, 2])))).toThrow(/payload must be a CBOR map/);
  });

  it("rejects payloads with unknown fields or an unsupported version", () => {
    expect(() => decodePaperSeal(envelope(profile({ 99: "unknown" })))).toThrow(/unknown field/);
    expect(() => decodePaperSeal(envelope(profile({ 1: 2 })))).toThrow(/version must be 1/);
  });

  it("rejects a payload that fails descriptor validation", () => {
    expect(() => decodePaperSeal(envelope(profile({ 6: "not-a-date" })))).toThrow(PaperSealDecodeError);
  });

  it("rejects malformed claims", () => {
    expect(() => decodePaperSeal(envelope(profile({ 7: "not-a-map" })))).toThrow(/claims must be a flat CBOR map/);
    expect(() => decodePaperSeal(envelope(profile({
      7: new Map<unknown, unknown>([[" padded ", "value"]]),
    })))).toThrow(/claim keys must be non-empty strings/);
    expect(() => decodePaperSeal(envelope(profile({
      7: new Map<unknown, unknown>([["binary", new Uint8Array([1])]]),
    })))).toThrow(/unsupported value/);
  });

  it("rejects wrong scalar field types and empty required strings", () => {
    expect(() => decodePaperSeal(envelope(profile({ 1: "one" })))).toThrow(/field 1 must be an integer/);
    expect(() => decodePaperSeal(envelope(profile({ 2: "" })))).toThrow(/issuerId must not be empty/);
    expect(() => decodePaperSeal(envelope(profile({ 8: 5 })))).toThrow(/statusUrl must be a string/);
  });
});

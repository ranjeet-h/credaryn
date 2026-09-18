export type DeterministicCborValue =
  | boolean
  | number
  | string
  | Uint8Array
  | readonly DeterministicCborValue[]
  | ReadonlyMap<DeterministicCborValue, DeterministicCborValue>
  | { readonly [key: string]: DeterministicCborValue };

export type DecodedCborMap = Map<unknown, unknown>;

export const MAX_CBOR_BYTES = 4_096;
const MAX_CBOR_DEPTH = 16;
const MAX_CBOR_ITEMS = 256;

export class CborEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CborEncodeError";
  }
}

export class CborDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CborDecodeError";
  }
}

export function encodeDeterministicCbor(value: unknown): Uint8Array {
  try {
    return encodeValue(value, 0);
  } catch (error) {
    if (error instanceof CborEncodeError) throw error;
    throw new CborEncodeError(error instanceof Error ? error.message : "unsupported CBOR value");
  }
}

export function decodeDeterministicCbor(input: Uint8Array): unknown {
  if (!(input instanceof Uint8Array)) throw new CborDecodeError("CBOR input must be a Uint8Array");
  if (input.byteLength > MAX_CBOR_BYTES) {
    throw new CborDecodeError(`CBOR input exceeds the maximum of ${MAX_CBOR_BYTES} bytes`);
  }
  const reader = new CborReader(input);
  const value = reader.readValue(0);
  if (!reader.atEnd()) throw new CborDecodeError("CBOR input contains trailing bytes");
  return value;
}

function encodeValue(value: unknown, depth: number): Uint8Array {
  if (depth > MAX_CBOR_DEPTH) throw new CborEncodeError("CBOR nesting depth exceeds the configured limit");
  if (typeof value === "boolean") return Uint8Array.of(value ? 0xf5 : 0xf4);
  if (typeof value === "number") return encodeInteger(value);
  if (typeof value === "string") return encodeText(value);
  if (value instanceof Uint8Array) return encodeBytes(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_CBOR_ITEMS) throw new CborEncodeError("CBOR array exceeds the configured item limit");
    return concatenate([encodeLength(4, value.length), ...value.map((item) => encodeValue(item, depth + 1))]);
  }
  if (value instanceof Map) return encodeMap(value.entries(), value.size, depth);
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return encodeMap(entries.map(([key, item]) => [key, item] as const), entries.length, depth);
  }
  throw new CborEncodeError("unsupported CBOR value; expected integer, text, bytes, boolean, array or map");
}

function encodeInteger(value: number): Uint8Array {
  if (!Number.isSafeInteger(value)) throw new CborEncodeError("CBOR numbers must be safe integers");
  return value >= 0 ? encodeLength(0, value) : encodeLength(1, -1 - value);
}

function encodeText(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatenate([encodeLength(3, bytes.length), bytes]);
}

function encodeBytes(value: Uint8Array): Uint8Array {
  return concatenate([encodeLength(2, value.length), new Uint8Array(value)]);
}

function encodeMap(
  entries: Iterable<readonly [unknown, unknown]>,
  size: number,
  depth: number,
): Uint8Array {
  if (size > MAX_CBOR_ITEMS) throw new CborEncodeError("CBOR map exceeds the configured item limit");
  const encodedEntries = [...entries].map(([key, value]) => ({
    key: encodeValue(key, depth + 1),
    value: encodeValue(value, depth + 1),
  }));
  encodedEntries.sort((left, right) => compareBytes(left.key, right.key));
  for (let index = 1; index < encodedEntries.length; index += 1) {
    if (compareBytes(encodedEntries[index - 1]!.key, encodedEntries[index]!.key) === 0) {
      throw new CborEncodeError("CBOR map contains duplicate keys");
    }
  }
  return concatenate([
    encodeLength(5, encodedEntries.length),
    ...encodedEntries.flatMap(({ key, value }) => [key, value]),
  ]);
}

function encodeLength(majorType: number, value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new CborEncodeError("CBOR length is outside the supported range");
  }
  if (value < 24) return Uint8Array.of((majorType << 5) | value);
  if (value <= 0xff) return Uint8Array.of((majorType << 5) | 24, value);
  if (value <= 0xffff) return Uint8Array.of((majorType << 5) | 25, value >> 8, value & 0xff);
  if (value <= 0xffff_ffff) {
    return Uint8Array.of(
      (majorType << 5) | 26,
      value >>> 24,
      value >>> 16,
      value >>> 8,
      value,
    );
  }
  const bytes = new Uint8Array(8);
  let remaining = BigInt(value);
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return concatenate([Uint8Array.of((majorType << 5) | 27), bytes]);
}

// RFC 8949 core deterministic encoding requires map keys to be sorted by the
// bytewise lexicographic order of their deterministic encodings. This differs
// from the legacy RFC 7049 "length-first" canonical ordering when key types or
// integer widths diverge.
function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index]! !== right[index]!) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array || value instanceof Map) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class CborReader {
  private offset = 0;

  constructor(private readonly input: Uint8Array) {}

  atEnd(): boolean {
    return this.offset === this.input.length;
  }

  readValue(depth: number): unknown {
    if (depth > MAX_CBOR_DEPTH) throw new CborDecodeError("CBOR nesting depth exceeds the configured limit");
    const initial = this.readByte();
    const majorType = initial >> 5;
    const additional = initial & 0x1f;
    if (additional === 31) throw new CborDecodeError("indefinite-length CBOR is not supported");

    switch (majorType) {
      case 0:
        return this.readLength(additional);
      case 1:
        return -1 - this.readLength(additional);
      case 2: {
        const length = this.readByteStringLength(additional);
        return this.readBytes(length);
      }
      case 3: {
        const length = this.readByteStringLength(additional);
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(this.readBytes(length));
        } catch {
          throw new CborDecodeError("CBOR text is not valid UTF-8");
        }
      }
      case 4: {
        const length = this.readItemCount(additional);
        return Array.from({ length }, () => this.readValue(depth + 1));
      }
      case 5: {
        const length = this.readItemCount(additional);
        const map = new Map<unknown, unknown>();
        for (let index = 0; index < length; index += 1) {
          const key = this.readValue(depth + 1);
          const value = this.readValue(depth + 1);
          const encodedKey = bytesToHex(encodeDeterministicCbor(key));
          if ([...map.keys()].some((existing) => bytesToHex(encodeDeterministicCbor(existing)) === encodedKey)) {
            throw new CborDecodeError("CBOR map contains duplicate keys");
          }
          map.set(key, value);
        }
        return map;
      }
      case 6:
        throw new CborDecodeError("CBOR tags are not supported");
      case 7:
        if (additional === 20) return false;
        if (additional === 21) return true;
        throw new CborDecodeError("CBOR floating-point and simple values are not supported");
      default:
        throw new CborDecodeError("unsupported CBOR major type");
    }
  }

  private readLength(additional: number): number {
    if (additional < 24) return additional;
    const byteCount = additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : additional === 27 ? 8 : 0;
    if (byteCount === 0) throw new CborDecodeError("invalid CBOR length encoding");
    if (this.offset + byteCount > this.input.length) throw new CborDecodeError("truncated CBOR length");
    let value = 0n;
    for (let index = 0; index < byteCount; index += 1) value = (value << 8n) | BigInt(this.readByte());
    if (value < BigInt(byteCount === 1 ? 24 : byteCount === 2 ? 0x100 : byteCount === 4 ? 0x1_0000 : 0x1_0000_0000)) {
      throw new CborDecodeError("non-canonical CBOR length encoding");
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new CborDecodeError("CBOR length exceeds safe integer range");
    return Number(value);
  }

  private readByteStringLength(additional: number): number {
    const length = this.readLength(additional);
    if (length > this.input.length - this.offset) throw new CborDecodeError("CBOR collection exceeds remaining input");
    return length;
  }

  private readItemCount(additional: number): number {
    const length = this.readLength(additional);
    if (length > MAX_CBOR_ITEMS) throw new CborDecodeError("CBOR collection exceeds the configured item limit");
    if (length > this.input.length - this.offset) throw new CborDecodeError("CBOR collection exceeds remaining input");
    return length;
  }

  private readBytes(length: number): Uint8Array {
    if (length > this.input.length - this.offset) throw new CborDecodeError("truncated CBOR value");
    const value = this.input.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  private readByte(): number {
    if (this.offset >= this.input.length) throw new CborDecodeError("truncated CBOR input");
    return this.input[this.offset++]!;
  }
}

function bytesToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

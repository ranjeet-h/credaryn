export function derToCoseSignature(signature: Uint8Array): Uint8Array {
  if (!(signature instanceof Uint8Array) || signature[0] !== 0x30) throw new Error("DER ECDSA signature must start with a sequence");
  const sequence = readLength(signature, 1);
  if (sequence.length !== signature.length - sequence.nextOffset) throw new Error("Invalid DER signature length");
  const r = readInteger(signature, sequence.nextOffset);
  const s = readInteger(signature, r.nextOffset);
  if (s.nextOffset !== signature.length) throw new Error("Invalid DER signature trailing bytes");
  return new Uint8Array([...leftPad32(r.value), ...leftPad32(s.value)]);
}

function readInteger(input: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } {
  if (input[offset] !== 0x02) throw new Error("Invalid DER ECDSA integer");
  const length = readLength(input, offset + 1);
  const end = length.nextOffset + length.length;
  if (length.length === 0 || end > input.length) throw new Error("Invalid DER ECDSA integer length");
  const value = input.slice(length.nextOffset, end);
  if ((value[0]! & 0x80) !== 0) throw new Error("DER ECDSA integer must be positive");
  if (value.length > 1 && value[0] === 0 && (value[1]! & 0x80) === 0) throw new Error("DER ECDSA integer is not minimally encoded");
  return { value, nextOffset: end };
}

function readLength(input: Uint8Array, offset: number): { length: number; nextOffset: number } {
  const first = input[offset];
  if (first === undefined) throw new Error("Truncated DER length");
  if ((first & 0x80) === 0) return { length: first, nextOffset: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 2 || offset + count >= input.length) throw new Error("Invalid DER length");
  if (input[offset + 1] === 0) throw new Error("DER length is not minimally encoded");
  let length = 0;
  for (let index = 0; index < count; index += 1) length = length * 256 + input[offset + 1 + index]!;
  return { length, nextOffset: offset + 1 + count };
}

function leftPad32(value: Uint8Array): Uint8Array {
  const normalized = value[0] === 0 ? value.slice(1) : value;
  if (normalized.length > 32) throw new Error("ECDSA integer exceeds 32 bytes");
  return new Uint8Array([...new Uint8Array(32 - normalized.length), ...normalized]);
}

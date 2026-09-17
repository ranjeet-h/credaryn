const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const BASE45_LOOKUP = new Map([...BASE45_ALPHABET].map((character, index) => [character, index]));

export const MAX_BASE45_BINARY_BYTES = 4_096;
const MAX_BASE45_TEXT_CHARS = Math.ceil(MAX_BASE45_BINARY_BYTES / 2) * 3;

export class Base45Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Base45Error";
  }
}

export function encodeBase45(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) {
    throw new Base45Error("Base45 input must be a Uint8Array");
  }
  if (input.byteLength > MAX_BASE45_BINARY_BYTES) {
    throw new Base45Error(`Base45 input exceeds the maximum of ${MAX_BASE45_BINARY_BYTES} bytes`);
  }

  let output = "";
  for (let index = 0; index < input.length; index += 2) {
    if (index + 1 < input.length) {
      const value = input[index]! * 256 + input[index + 1]!;
      output += BASE45_ALPHABET[value % 45];
      output += BASE45_ALPHABET[Math.floor(value / 45) % 45];
      output += BASE45_ALPHABET[Math.floor(value / 2_025)];
      continue;
    }

    const value = input[index]!;
    output += BASE45_ALPHABET[value % 45];
    output += BASE45_ALPHABET[Math.floor(value / 45)];
  }
  return output;
}

export function decodeBase45(input: string): Uint8Array {
  if (typeof input !== "string") {
    throw new Base45Error("Base45 input must be a string");
  }
  if (input.length > MAX_BASE45_TEXT_CHARS) {
    throw new Base45Error(`Base45 input exceeds the maximum encoded size of ${MAX_BASE45_TEXT_CHARS} characters`);
  }
  if (input.length % 3 === 1) {
    throw new Base45Error("Base45 input has an invalid length");
  }

  const output = new Uint8Array(Math.floor(input.length / 3) * 2 + (input.length % 3 === 2 ? 1 : 0));
  let outputOffset = 0;
  for (let index = 0; index < input.length; index += 3) {
    const first = readCharacter(input[index], index);
    const second = readCharacter(input[index + 1], index + 1);
    if (index + 2 < input.length) {
      const third = readCharacter(input[index + 2], index + 2);
      const value = first + second * 45 + third * 2_025;
      if (value > 0xffff) throw new Base45Error(`Base45 value at offset ${index} exceeds two-byte range`);
      output[outputOffset++] = Math.floor(value / 256);
      output[outputOffset++] = value % 256;
    } else {
      const value = first + second * 45;
      if (value > 0xff) throw new Base45Error(`Base45 value at offset ${index} exceeds one-byte range`);
      output[outputOffset++] = value;
    }
  }
  return output;
}

function readCharacter(character: string | undefined, offset: number): number {
  const value = character === undefined ? undefined : BASE45_LOOKUP.get(character);
  if (value === undefined) throw new Base45Error(`Invalid Base45 character at offset ${offset}`);
  return value;
}

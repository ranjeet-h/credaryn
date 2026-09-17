import { createHash, createPublicKey, createVerify } from "node:crypto";
import { decode, Encoder } from "cbor-x";
import type { DocumentDescriptor } from "../../core/src/document.js";
import type { SignerProvider } from "../../core/src/signer.js";
import type { TrustStore } from "../../core/src/trust.js";

const encoder = new Encoder();
const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export interface SpikePaperSeal {
  transport: string;
  payload: Uint8Array;
  payloadHash: string;
}

export async function createSpikePaperSeal(
  descriptor: DocumentDescriptor,
  signer: SignerProvider,
): Promise<SpikePaperSeal> {
  const keyInfo = await signer.getKeyInfo();
  const payload = encoder.encode({
    claims: descriptor.claims,
    documentId: descriptor.documentId,
    documentType: descriptor.documentType,
    issuedAt: descriptor.issuedAt,
    issuerId: descriptor.issuerId,
    keyId: keyInfo.keyId,
    version: 1,
  });
  const protectedHeaders = encoder.encode(new Map([[1, -7]]));
  const signatureInput = encoder.encode(["Signature1", Buffer.from(protectedHeaders), Buffer.alloc(0), Buffer.from(payload)]);
  const derSignature = await signer.sign(signatureInput);
  const signature = derToRaw(derSignature);
  const coseSign1 = encoder.encode([Buffer.from(protectedHeaders), {}, Buffer.from(payload), Buffer.from(signature)]);

  return {
    transport: `CRD1:${base45Encode(coseSign1)}`,
    payload,
    payloadHash: createHash("sha256").update(payload).digest("hex"),
  };
}

export async function verifySpikePaperSeal(
  transport: string,
  trustStore: TrustStore,
): Promise<boolean> {
  try {
    if (!transport.startsWith("CRD1:")) return false;
    const cose = decode(base45Decode(transport.slice(5))) as unknown;
    if (!Array.isArray(cose) || cose.length !== 4) return false;
    const [protectedHeaders, unprotected, payload, signature] = cose;
    if (!(protectedHeaders instanceof Uint8Array) || !(payload instanceof Uint8Array)) return false;
    if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;
    if (typeof unprotected !== "object" || unprotected === null) return false;

    const headers = decode(protectedHeaders) as unknown;
    const algorithm = headers instanceof Map
      ? headers.get(1)
      : isRecord(headers)
        ? headers["1"]
        : undefined;
    if (algorithm !== -7) return false;

    const decodedPayload = decode(payload) as Record<string, unknown>;
    const issuerId = decodedPayload.issuerId;
    const keyId = decodedPayload.keyId;
    if (typeof issuerId !== "string" || typeof keyId !== "string") return false;
    if (decodedPayload.version !== 1) return false;

    const trustedKey = await trustStore.resolve(keyId, issuerId);
    if (!trustedKey || trustedKey.algorithm !== "ES256") return false;

    const signatureInput = encoder.encode(["Signature1", Buffer.from(protectedHeaders), Buffer.alloc(0), Buffer.from(payload)]);
    const verifier = createVerify("SHA256");
    verifier.update(signatureInput);
    verifier.end();
    return verifier.verify(createPublicKey({
      key: Buffer.from(trustedKey.publicKey),
      format: "der",
      type: "spki",
    }), rawToDer(signature));
  } catch {
    return false;
  }
}

function base45Encode(input: Uint8Array): string {
  let output = "";
  for (let index = 0; index < input.length; index += 2) {
    if (index + 1 < input.length) {
      const value = input[index]! * 256 + input[index + 1]!;
      output += BASE45_ALPHABET[value % 45];
      output += BASE45_ALPHABET[Math.floor(value / 45) % 45];
      output += BASE45_ALPHABET[Math.floor(value / 2025)];
    } else {
      const value = input[index]!;
      output += BASE45_ALPHABET[value % 45];
      output += BASE45_ALPHABET[Math.floor(value / 45)];
    }
  }
  return output;
}

function base45Decode(input: string): Uint8Array {
  const output: number[] = [];
  for (let index = 0; index < input.length; index += 3) {
    const first = BASE45_ALPHABET.indexOf(input[index]!);
    const second = BASE45_ALPHABET.indexOf(input[index + 1]!);
    if (first < 0 || second < 0) throw new Error("invalid base45 character");
    if (index + 2 < input.length) {
      const third = BASE45_ALPHABET.indexOf(input[index + 2]!);
      if (third < 0) throw new Error("invalid base45 character");
      const value = first + second * 45 + third * 2025;
      if (value > 0xffff) throw new Error("invalid base45 value");
      output.push(Math.floor(value / 256), value % 256);
    } else {
      const value = first + second * 45;
      if (value > 0xff) throw new Error("invalid base45 value");
      output.push(value);
    }
  }
  return new Uint8Array(output);
}

function derToRaw(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) throw new Error("invalid DER signature");
  let offset = 2;
  if (signature[1]! & 0x80) offset += (signature[1]! & 0x7f);
  const r = readDerInteger(signature, offset);
  const s = readDerInteger(signature, r.nextOffset);
  return new Uint8Array([...leftPad32(r.value), ...leftPad32(s.value)]);
}

function readDerInteger(signature: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } {
  if (signature[offset] !== 0x02) throw new Error("invalid DER integer");
  const length = signature[offset + 1]!;
  const start = offset + 2;
  return { value: signature.slice(start, start + length), nextOffset: start + length };
}

function leftPad32(value: Uint8Array): Uint8Array {
  const normalized = value[0] === 0 ? value.slice(1) : value;
  if (normalized.length > 32) throw new Error("ECDSA integer too large");
  return new Uint8Array([...new Uint8Array(32 - normalized.length), ...normalized]);
}

function rawToDer(signature: Uint8Array): Uint8Array {
  const r = derInteger(signature.slice(0, 32));
  const s = derInteger(signature.slice(32, 64));
  const body = new Uint8Array([0x02, r.length, ...r, 0x02, s.length, ...s]);
  return new Uint8Array([0x30, body.length, ...body]);
}

function derInteger(value: Uint8Array): Uint8Array {
  let first = 0;
  while (first < value.length - 1 && value[first] === 0) first += 1;
  const normalized = value.slice(first);
  return normalized[0]! & 0x80 ? new Uint8Array([0, ...normalized]) : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

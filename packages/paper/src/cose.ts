import { createPublicKey, createVerify } from "node:crypto";
import type { SignerKeyInfo, SignerProvider, TrustStore, TrustDecision } from "@credaryn/core";
import {
  decodeDeterministicCbor,
  encodeDeterministicCbor,
  type DecodedCborMap,
} from "./cbor.js";

export const COSE_ALGORITHM_ES256 = -7 as const;
export const COSE_SIGN1_CONTEXT = "Signature1" as const;
export const MAX_COSE_OBJECT_BYTES = 1_200;

export interface CoseSign1Parts {
  protectedHeaders: Map<number, unknown>;
  unprotectedHeaders: DecodedCborMap;
  payload: Uint8Array;
  signature: Uint8Array;
}

export interface CoseVerificationOptions {
  issuerId: string;
  trustStore?: TrustStore;
}

export interface CoseVerificationResult {
  cryptographicValidity: "VALID" | "INVALID" | "UNVERIFIABLE";
  trustDecision: TrustDecision;
  issuerId: string;
  keyId?: string;
  payload: Uint8Array;
}

export class CoseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoseVerificationError";
  }
}

export async function createCoseSign1(
  payload: Uint8Array,
  signer: SignerProvider,
): Promise<Uint8Array> {
  const keyInfo = await signer.getKeyInfo();
  validateSignerKeyInfo(keyInfo);
  const protectedHeaders = new Map<number, unknown>([
    [1, COSE_ALGORITHM_ES256],
    [4, new TextEncoder().encode(keyInfo.keyId)],
  ]);
  const protectedBytes = encodeDeterministicCbor(protectedHeaders);
  const signatureInput = buildSignatureInput(protectedBytes, payload);
  const derSignature = await signer.sign(signatureInput);
  const signature = derToRaw(derSignature);
  return encodeCoseSign1Parts({
    protectedHeaders,
    unprotectedHeaders: new Map(),
    payload: new Uint8Array(payload),
    signature,
  });
}

export function decodeCoseSign1(input: Uint8Array): CoseSign1Parts {
  if (!(input instanceof Uint8Array)) throw new CoseVerificationError("COSE input must be a Uint8Array");
  if (input.byteLength > MAX_COSE_OBJECT_BYTES) {
    throw new CoseVerificationError(`COSE_Sign1 exceeds the maximum of ${MAX_COSE_OBJECT_BYTES} bytes`);
  }
  let decoded: unknown;
  try {
    decoded = decodeDeterministicCbor(input);
  } catch (error) {
    throw new CoseVerificationError(error instanceof Error ? error.message : "COSE payload is not valid CBOR");
  }
  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new CoseVerificationError("COSE_Sign1 must be a four-item array");
  }
  const [protectedBytes, unprotectedHeaders, payload, signature] = decoded;
  if (!(protectedBytes instanceof Uint8Array)) throw new CoseVerificationError("COSE protected headers must be a byte string");
  if (!(unprotectedHeaders instanceof Map)) throw new CoseVerificationError("COSE unprotected headers must be a map");
  if (!(payload instanceof Uint8Array)) throw new CoseVerificationError("COSE payload must be a byte string");
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new CoseVerificationError("COSE ES256 signature must be exactly 64 bytes");
  }

  let protectedHeaders: unknown;
  try {
    protectedHeaders = decodeDeterministicCbor(protectedBytes);
  } catch (error) {
    throw new CoseVerificationError(error instanceof Error ? error.message : "COSE protected headers are not valid CBOR");
  }
  if (!(protectedHeaders instanceof Map)) throw new CoseVerificationError("COSE protected headers must be a map");
  const numericHeaders = new Map<number, unknown>();
  for (const [key, value] of protectedHeaders.entries()) {
    if (typeof key !== "number" || !Number.isSafeInteger(key)) {
      throw new CoseVerificationError("COSE header labels must be integer labels");
    }
    numericHeaders.set(key, value);
  }
  for (const key of unprotectedHeaders.keys()) {
    if (key === 1 || key === 2 || key === 4) {
      throw new CoseVerificationError("COSE algorithm, critical and key-id headers must be protected");
    }
  }

  return {
    protectedHeaders: numericHeaders,
    unprotectedHeaders,
    payload,
    signature,
  };
}

export function encodeCoseSign1Parts(parts: CoseSign1Parts): Uint8Array {
  if (!(parts.payload instanceof Uint8Array) || !(parts.signature instanceof Uint8Array)) {
    throw new CoseVerificationError("COSE payload and signature must be byte strings");
  }
  if (parts.signature.length !== 64) throw new CoseVerificationError("COSE ES256 signature must be exactly 64 bytes");
  const protectedBytes = encodeDeterministicCbor(parts.protectedHeaders);
  const encoded = encodeDeterministicCbor([
    protectedBytes,
    parts.unprotectedHeaders,
    parts.payload,
    parts.signature,
  ]);
  if (encoded.length > MAX_COSE_OBJECT_BYTES) {
    throw new CoseVerificationError(`COSE_Sign1 exceeds the maximum of ${MAX_COSE_OBJECT_BYTES} bytes`);
  }
  return encoded;
}

export async function verifyCoseSign1(
  input: Uint8Array,
  options: CoseVerificationOptions,
): Promise<CoseVerificationResult> {
  let parts: CoseSign1Parts;
  try {
    parts = decodeCoseSign1(input);
  } catch {
    return {
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      issuerId: options.issuerId,
      payload: new Uint8Array(),
    };
  }

  const keyId = readKeyId(parts.protectedHeaders.get(4));
  const algorithm = parts.protectedHeaders.get(1);
  const critical = parts.protectedHeaders.get(2);
  if (algorithm !== COSE_ALGORITHM_ES256 || keyId === undefined || !isSupportedCriticalHeader(critical)) {
    return invalidResult(options.issuerId, keyId, parts.payload);
  }
  if (options.trustStore === undefined) {
    return unverifiableResult(options.issuerId, keyId, parts.payload);
  }

  let trustedKey: SignerKeyInfo | undefined;
  try {
    trustedKey = await options.trustStore.resolve(keyId, options.issuerId);
  } catch {
    return unverifiableResult(options.issuerId, keyId, parts.payload);
  }
  if (trustedKey === undefined || trustedKey.algorithm !== "ES256") {
    return unverifiableResult(options.issuerId, keyId, parts.payload);
  }

  const signatureInput = buildSignatureInput(encodeDeterministicCbor(parts.protectedHeaders), parts.payload);
  let valid = false;
  try {
    const verifier = createVerify("SHA256");
    verifier.update(signatureInput);
    verifier.end();
    valid = verifier.verify(
      createPublicKey({ key: Buffer.from(trustedKey.publicKey), format: "der", type: "spki" }),
      rawToDer(parts.signature),
    );
  } catch {
    valid = false;
  }
  if (!valid) return invalidResult(options.issuerId, keyId, parts.payload);

  try {
    const trusted = await options.trustStore.isTrusted?.(trustedKey) ?? true;
    return {
      cryptographicValidity: "VALID",
      trustDecision: trusted ? "TRUSTED" : "UNTRUSTED",
      issuerId: options.issuerId,
      keyId,
      payload: parts.payload,
    };
  } catch {
    return unverifiableResult(options.issuerId, keyId, parts.payload);
  }
}

function validateSignerKeyInfo(keyInfo: SignerKeyInfo): void {
  if (keyInfo.algorithm !== "ES256") throw new CoseVerificationError("Paper Seal Profile v1 only supports ES256");
  if (keyInfo.keyId.trim() === "") throw new CoseVerificationError("Paper Seal Profile v1 requires a non-empty key ID");
}

function buildSignatureInput(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeDeterministicCbor([
    COSE_SIGN1_CONTEXT,
    protectedBytes,
    new Uint8Array(),
    payload,
  ]);
}

function readKeyId(value: unknown): string | undefined {
  if (!(value instanceof Uint8Array) || value.length === 0) return undefined;
  try {
    const keyId = new TextDecoder("utf-8", { fatal: true }).decode(value);
    return keyId.trim() === "" ? undefined : keyId;
  } catch {
    return undefined;
  }
}

function isSupportedCriticalHeader(value: unknown): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((item) => item === 1);
}

function invalidResult(issuerId: string, keyId: string | undefined, payload: Uint8Array): CoseVerificationResult {
  return { cryptographicValidity: "INVALID", trustDecision: "MISSING", issuerId, ...(keyId === undefined ? {} : { keyId }), payload };
}

function unverifiableResult(issuerId: string, keyId: string | undefined, payload: Uint8Array): CoseVerificationResult {
  return { cryptographicValidity: "UNVERIFIABLE", trustDecision: "MISSING", issuerId, ...(keyId === undefined ? {} : { keyId }), payload };
}

function derToRaw(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) throw new CoseVerificationError("Signer must return a DER-encoded ECDSA signature");
  let offset = 1;
  const sequenceLength = readDerLength(signature, offset);
  offset = sequenceLength.nextOffset;
  if (sequenceLength.length !== signature.length - offset) throw new CoseVerificationError("Invalid DER signature length");
  const r = readDerInteger(signature, offset);
  const s = readDerInteger(signature, r.nextOffset);
  if (s.nextOffset !== signature.length) throw new CoseVerificationError("Invalid DER signature trailing bytes");
  return new Uint8Array([...leftPad32(r.value), ...leftPad32(s.value)]);
}

function readDerInteger(signature: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } {
  if (signature[offset] !== 0x02) throw new CoseVerificationError("Invalid DER ECDSA integer");
  const length = readDerLength(signature, offset + 1);
  const valueStart = length.nextOffset;
  const valueEnd = valueStart + length.length;
  if (valueEnd > signature.length || length.length === 0) throw new CoseVerificationError("Invalid DER ECDSA integer length");
  return { value: signature.slice(valueStart, valueEnd), nextOffset: valueEnd };
}

function readDerLength(signature: Uint8Array, offset: number): { length: number; nextOffset: number } {
  const first = signature[offset];
  if (first === undefined) throw new CoseVerificationError("Truncated DER signature");
  if ((first & 0x80) === 0) return { length: first, nextOffset: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 2 || offset + count >= signature.length) throw new CoseVerificationError("Invalid DER length");
  let length = 0;
  for (let index = 0; index < count; index += 1) length = length * 256 + signature[offset + 1 + index]!;
  return { length, nextOffset: offset + 1 + count };
}

function leftPad32(value: Uint8Array): Uint8Array {
  const normalized = value[0] === 0 ? value.slice(1) : value;
  if (normalized.length > 32) throw new CoseVerificationError("ECDSA integer exceeds 32 bytes");
  return new Uint8Array([...new Uint8Array(32 - normalized.length), ...normalized]);
}

function rawToDer(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) throw new CoseVerificationError("Raw ES256 signature must be 64 bytes");
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

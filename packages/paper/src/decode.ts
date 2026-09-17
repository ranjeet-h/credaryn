import { decodeBase45 } from "./base45.js";
import { decodeDeterministicCbor, type DecodedCborMap } from "./cbor.js";
import { decodeCoseSign1, type CoseSign1Parts, MAX_COSE_OBJECT_BYTES } from "./cose.js";
import { PAPER_PROFILE_PREFIX, type PaperSealPayload } from "./encode.js";
import { validateDescriptor } from "@credaryn/core";

const MAX_TRANSPORT_BYTES = 5 + Math.ceil(MAX_COSE_OBJECT_BYTES / 2) * 3;

export interface DecodedPaperSeal {
  transport: string;
  cose: Uint8Array;
  payload: Uint8Array;
  coseParts: CoseSign1Parts;
  profile: PaperSealPayload;
}

export class PaperSealDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperSealDecodeError";
  }
}

export function decodePaperSeal(input: string | Uint8Array): DecodedPaperSeal {
  const transport = typeof input === "string" ? input : decodeTransportBytes(input);
  if (!transport.startsWith(PAPER_PROFILE_PREFIX)) throw new PaperSealDecodeError("Paper Seal must start with CRD1:");
  if (new TextEncoder().encode(transport).length > MAX_TRANSPORT_BYTES) {
    throw new PaperSealDecodeError(`Paper Seal transport exceeds the maximum profile size of ${MAX_TRANSPORT_BYTES} bytes`);
  }

  let cose: Uint8Array;
  try {
    cose = decodeBase45(transport.slice(PAPER_PROFILE_PREFIX.length));
  } catch (error) {
    throw new PaperSealDecodeError(error instanceof Error ? error.message : "Paper Seal Base45 is invalid");
  }
  let coseParts: CoseSign1Parts;
  try {
    coseParts = decodeCoseSign1(cose);
  } catch (error) {
    throw new PaperSealDecodeError(error instanceof Error ? error.message : "Paper Seal COSE is invalid");
  }
  const profile = decodeProfilePayload(coseParts.payload);
  return {
    transport,
    cose,
    payload: coseParts.payload,
    coseParts,
    profile,
  };
}

function decodeTransportBytes(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) throw new PaperSealDecodeError("Paper Seal input must be text bytes");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new PaperSealDecodeError("Paper Seal transport is not valid UTF-8");
  }
}

function decodeProfilePayload(input: Uint8Array): PaperSealPayload {
  let decoded: unknown;
  try {
    decoded = decodeDeterministicCbor(input);
  } catch (error) {
    throw new PaperSealDecodeError(error instanceof Error ? error.message : "Paper Seal payload is invalid CBOR");
  }
  if (!(decoded instanceof Map)) throw new PaperSealDecodeError("Paper Seal payload must be a CBOR map");
  const allowedFields = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const key of decoded.keys()) {
    if (typeof key !== "number" || !allowedFields.has(key)) throw new PaperSealDecodeError("Paper Seal payload contains an unknown field");
  }

  const version = readNumber(decoded, 1);
  const issuerId = readNonEmptyString(decoded, 2, "issuerId");
  const keyId = readNonEmptyString(decoded, 3, "keyId");
  const documentId = readNonEmptyString(decoded, 4, "documentId");
  const documentType = readNonEmptyString(decoded, 5, "documentType");
  const issuedAt = readString(decoded, 6, "issuedAt");
  const claims = readClaims(decoded.get(7));
  if (version !== 1) throw new PaperSealDecodeError("Paper Seal version must be 1");

  const profile: PaperSealPayload = {
    version: 1,
    issuerId,
    keyId,
    documentId,
    documentType,
    issuedAt,
    claims,
  };
  const statusUrl = decoded.get(8);
  if (statusUrl !== undefined) profile.statusUrl = readStringValue(statusUrl, "statusUrl");
  const artifactDigest = decoded.get(9);
  if (artifactDigest !== undefined) profile.artifactDigest = readStringValue(artifactDigest, "artifactDigest");
  const descriptorResult = validateDescriptor({
    issuerId: profile.issuerId,
    documentId: profile.documentId,
    documentType: profile.documentType,
    issuedAt: profile.issuedAt,
    claims: profile.claims,
    ...(profile.statusUrl === undefined ? {} : { statusUrl: profile.statusUrl }),
  });
  if (!descriptorResult.valid) {
    throw new PaperSealDecodeError(descriptorResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  }
  return profile;
}

function readClaims(value: unknown): Readonly<Record<string, string | boolean | number>> {
  if (!(value instanceof Map)) throw new PaperSealDecodeError("Paper Seal claims must be a flat CBOR map");
  const claims: Record<string, string | boolean | number> = {};
  for (const [key, claim] of value.entries()) {
    if (typeof key !== "string" || key.trim() === "" || key !== key.trim()) {
      throw new PaperSealDecodeError("Paper Seal claim keys must be non-empty strings");
    }
    if (!isClaimValue(claim)) throw new PaperSealDecodeError(`Paper Seal claim ${key} has an unsupported value`);
    claims[key] = claim;
  }
  return claims;
}

function isClaimValue(value: unknown): value is string | boolean | number {
  return typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isSafeInteger(value));
}

function readNumber(map: DecodedCborMap, key: number): number {
  const value = map.get(key);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new PaperSealDecodeError(`Paper Seal field ${key} must be an integer`);
  return value;
}

function readString(map: DecodedCborMap, key: number, name: string): string {
  return readStringValue(map.get(key), name);
}

function readNonEmptyString(map: DecodedCborMap, key: number, name: string): string {
  const value = readString(map, key, name);
  if (value.trim() === "") throw new PaperSealDecodeError(`Paper Seal ${name} must not be empty`);
  return value;
}

function readStringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new PaperSealDecodeError(`Paper Seal ${name} must be a string`);
  return value;
}

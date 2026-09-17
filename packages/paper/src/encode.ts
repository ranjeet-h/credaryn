import {
  assertValidDescriptor,
  type DocumentDescriptor,
  type SignerKeyInfo,
  type SignerProvider,
} from "@credaryn/core";
import { encodeBase45 } from "./base45.js";
import { encodeDeterministicCbor } from "./cbor.js";
import { createCoseSign1, MAX_COSE_OBJECT_BYTES } from "./cose.js";

export const PAPER_PROFILE_PREFIX = "CRD1:" as const;

export interface PaperSealPayload {
  version: 1;
  issuerId: string;
  keyId: string;
  documentId: string;
  documentType: string;
  issuedAt: string;
  claims: Readonly<Record<string, string | boolean | number>>;
  statusUrl?: string;
  artifactDigest?: string;
}

export interface PaperSealEncodeOptions {
  artifactDigest?: string;
}

export interface PaperSealEncoding {
  transport: string;
  payload: Uint8Array;
  cose: Uint8Array;
  keyInfo: SignerKeyInfo;
}

export class PaperSealSizeError extends Error {
  readonly actualBytes: number;
  readonly maximumBytes = MAX_COSE_OBJECT_BYTES;

  constructor(actualBytes: number) {
    super(`Paper Seal COSE object is ${actualBytes} bytes; the maximum is ${MAX_COSE_OBJECT_BYTES} bytes. Reduce claims; no claims were dropped.`);
    this.name = "PaperSealSizeError";
    this.actualBytes = actualBytes;
  }
}

export async function encodePaperSeal(
  input: DocumentDescriptor,
  signer: SignerProvider,
  options: PaperSealEncodeOptions = {},
): Promise<PaperSealEncoding> {
  const descriptor = assertValidDescriptor(input);
  const keyInfo = await signer.getKeyInfo();
  if (keyInfo.algorithm !== "ES256") throw new Error("Paper Seal Profile v1 only supports ES256 signers");
  if (keyInfo.issuerId !== descriptor.issuerId) {
    throw new Error("Paper Seal signer issuerId must match the descriptor issuerId");
  }
  if (keyInfo.keyId.trim() === "") throw new Error("Paper Seal signer keyId must not be empty");

  const profile = createPaperSealPayload(descriptor, keyInfo.keyId, options);
  const payload = encodeDeterministicCbor(toCborMap(profile));
  let cose: Uint8Array;
  try {
    cose = await createCoseSign1(payload, signer);
  } catch (error) {
    if (error instanceof Error && /maximum of 1200 bytes|exceeds the maximum/i.test(error.message)) {
      throw new PaperSealSizeError(payload.length + 120);
    }
    throw error;
  }
  if (cose.length > MAX_COSE_OBJECT_BYTES) throw new PaperSealSizeError(cose.length);

  return {
    transport: `${PAPER_PROFILE_PREFIX}${encodeBase45(cose)}`,
    payload,
    cose,
    keyInfo,
  };
}

export function createPaperSealPayload(
  descriptor: DocumentDescriptor,
  keyId: string,
  options: PaperSealEncodeOptions = {},
): PaperSealPayload {
  const claims = { ...descriptor.claims };
  const profile: PaperSealPayload = {
    version: 1,
    issuerId: descriptor.issuerId,
    keyId,
    documentId: descriptor.documentId,
    documentType: descriptor.documentType,
    issuedAt: descriptor.issuedAt,
    claims,
  };
  if (descriptor.statusUrl !== undefined) profile.statusUrl = descriptor.statusUrl;
  if (options.artifactDigest !== undefined) profile.artifactDigest = options.artifactDigest;
  return profile;
}

function toCborMap(profile: PaperSealPayload): Map<number, unknown> {
  const map = new Map<number, unknown>([
    [1, profile.version],
    [2, profile.issuerId],
    [3, profile.keyId],
    [4, profile.documentId],
    [5, profile.documentType],
    [6, profile.issuedAt],
    [7, new Map(Object.entries(profile.claims))],
  ]);
  if (profile.statusUrl !== undefined) map.set(8, profile.statusUrl);
  if (profile.artifactDigest !== undefined) map.set(9, profile.artifactDigest);
  return map;
}

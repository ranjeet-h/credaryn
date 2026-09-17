import { readFile, readdir, stat } from "node:fs/promises";
import { createPublicKey } from "node:crypto";
import { resolve } from "node:path";
import type { SignerKeyInfo, TrustStore } from "@credaryn/core";

const MAX_TRUST_FILE_BYTES = 1 * 1024 * 1024;
const MAX_TRUST_FILES = 64;
const MAX_TRUST_BUNDLE_BYTES = 8 * 1024 * 1024;

export class TrustStoreLoadError extends Error {
  readonly code = "TRUST_STORE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "TrustStoreLoadError";
  }
}

export async function loadTrustStore(path: string): Promise<TrustStore> {
  const target = resolve(path);
  let targetStat: Awaited<ReturnType<typeof stat>>;
  try {
    targetStat = await stat(target);
  } catch {
    throw new TrustStoreLoadError(`Trust bundle could not be read: ${path}`);
  }
  const files = targetStat.isDirectory()
    ? (await readdir(target)).filter((file) => file.endsWith(".json")).map((file) => resolve(target, file))
    : [target];
  if (files.length > MAX_TRUST_FILES) {
    throw new TrustStoreLoadError(`Trust bundle contains more than ${MAX_TRUST_FILES} JSON files`);
  }
  let totalBytes = 0;
  for (const file of files) {
    try {
      const fileStat = await stat(file);
      if (!fileStat.isFile() || fileStat.size > MAX_TRUST_FILE_BYTES) throw new Error("file");
      totalBytes += fileStat.size;
      if (totalBytes > MAX_TRUST_BUNDLE_BYTES) throw new Error("bundle");
    } catch {
      throw new TrustStoreLoadError(`Trust bundle file could not be read: ${file}`);
    }
  }
  const keys: SignerKeyInfo[] = [];
  let trustSource = targetStat.isDirectory() ? "trust-directory" : target;
  let developmentOnly = false;
  for (const file of files) {
    const parsed = await readJsonFile(file);
    if (typeof parsed.trustSource === "string") trustSource = parsed.trustSource;
    if (parsed.developmentOnly === true) developmentOnly = true;
    for (const key of readKeys(parsed.keys, file)) keys.push(key);
  }
  return {
    trustSource: developmentOnly ? `${trustSource} (development-only)` : trustSource,
    resolve: async (keyId, issuerId) => keys.find((key) => key.keyId === keyId && key.issuerId === issuerId),
  };
}

async function readJsonFile(file: string): Promise<Record<string, unknown>> {
  let bytes: Uint8Array;
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile() || fileStat.size > MAX_TRUST_FILE_BYTES) throw new Error("size");
    bytes = new Uint8Array(await readFile(file));
  } catch {
    throw new TrustStoreLoadError(`Trust bundle file could not be read: ${file}`);
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new TrustStoreLoadError(`Trust bundle file must contain a JSON object: ${file}`);
  }
}

function readKeys(value: unknown, file: string): SignerKeyInfo[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TrustStoreLoadError(`Trust bundle keys must be an array: ${file}`);
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TrustStoreLoadError(`Trust bundle key ${index} is invalid: ${file}`);
    }
    const key = entry as Record<string, unknown>;
    if (typeof key.issuerId !== "string" || typeof key.keyId !== "string" || key.algorithm !== "ES256" || typeof key.publicKey !== "string") {
      throw new TrustStoreLoadError(`Trust bundle key ${index} has invalid metadata: ${file}`);
    }
    let publicKey: Uint8Array;
    try {
      if (!isBase64(key.publicKey)) throw new Error("base64");
      publicKey = new Uint8Array(Buffer.from(key.publicKey, "base64"));
      createPublicKey({ key: Buffer.from(publicKey), format: "der", type: "spki" });
    } catch {
      throw new TrustStoreLoadError(`Trust bundle key ${index} has invalid public key bytes: ${file}`);
    }
    return { issuerId: key.issuerId, keyId: key.keyId, algorithm: "ES256", publicKey };
  });
}

function isBase64(value: string): boolean {
  return value.length > 0
    && value.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

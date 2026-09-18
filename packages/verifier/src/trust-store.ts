import { readFile, readdir, stat } from "node:fs/promises";
import { createPublicKey } from "node:crypto";
import { resolve } from "node:path";
import {
  TrustPolicy,
  createDidWebResolver,
  type SignerKeyInfo,
  type TrustMaterialSource,
  type TrustResolver,
  type TrustStore,
  type X509TrustAnchor,
} from "@credaryn/core";

const MAX_TRUST_FILE_BYTES = 1 * 1024 * 1024;
const MAX_TRUST_FILES = 64;
const MAX_TRUST_BUNDLE_BYTES = 8 * 1024 * 1024;

export interface PolicyTrustStoreConfig {
  keys?: readonly SignerKeyInfo[];
  x509Anchors?: readonly X509TrustAnchor[];
  didWebDomains?: readonly string[];
  developmentOnly?: boolean;
}

export interface PolicyTrustStoreOptions {
  /** Injected did:web resolver; defaults to the bounded core resolver when domains are configured. */
  didWebResolver?: TrustResolver;
}

export class TrustStoreLoadError extends Error {
  readonly code = "TRUST_STORE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "TrustStoreLoadError";
  }
}

/**
 * Loads a trust bundle (single JSON file or directory of JSON files) into a policy-driven
 * `TrustStore`. The legacy key-array bundle remains supported; `x509Anchors` and did:web
 * domains are layered on top through `TrustPolicy`.
 */
export async function loadTrustStore(path: string): Promise<TrustStore> {
  return createPolicyTrustStore(await readTrustBundle(path));
}

export async function loadTrustPolicyStore(
  path: string,
  options: PolicyTrustStoreOptions = {},
): Promise<TrustStore> {
  return createPolicyTrustStore(await readTrustBundle(path), options);
}

export function createPolicyTrustStore(
  config: PolicyTrustStoreConfig = {},
  options: PolicyTrustStoreOptions = {},
): TrustStore {
  const configuredKeys = [...(config.keys ?? [])];
  const x509Anchors = [...(config.x509Anchors ?? [])];
  const didWebDomains = [...(config.didWebDomains ?? [])];
  let resolver = options.didWebResolver;
  if (resolver === undefined && didWebDomains.length > 0) {
    resolver = createDidWebResolver({ allowedDomains: didWebDomains });
  }
  const policy = new TrustPolicy({
    configuredKeys,
    x509Anchors,
    ...(resolver === undefined ? {} : { resolver }),
    allowedDidWebDomains: didWebDomains,
  });

  const resolved = new Map<string, SignerKeyInfo>();
  const source = trustSourceFor(configuredKeys, x509Anchors, didWebDomains);

  return {
    trustSource: config.developmentOnly === true ? `${source} (development-only)` : source,
    resolve: async (keyId, issuerId) => {
      const configured = configuredKeys.find((key) => key.issuerId === issuerId && key.keyId === keyId);
      if (configured !== undefined) return configured;
      const key = await policy.resolve(keyId, issuerId);
      if (key === undefined) resolved.delete(reference(issuerId, keyId));
      else resolved.set(reference(issuerId, keyId), key);
      return key;
    },
    isTrusted: (keyInfo) => {
      const configured = configuredKeys.find((key) => key.issuerId === keyInfo.issuerId && key.keyId === keyInfo.keyId);
      if (configured !== undefined) return sameKey(configured, keyInfo);
      if (x509Anchors.some((anchor) => anchor.issuerId === keyInfo.issuerId
        && normalizeFingerprint(anchor.certificateFingerprint) === normalizeFingerprint(keyInfo.certificateFingerprint))) {
        return true;
      }
      if (resolver === undefined) return false;
      return policy.isTrusted(keyInfo);
    },
    resolveByFingerprint: async (fingerprint) => {
      const normalized = normalizeFingerprint(fingerprint);
      if (normalized === undefined) return undefined;
      const configured = configuredKeys.find((key) => normalizeFingerprint(key.certificateFingerprint) === normalized);
      if (configured !== undefined) return configured;
      for (const key of resolved.values()) {
        if (normalizeFingerprint(key.certificateFingerprint) === normalized) return key;
      }
      return undefined;
    },
  };
}

interface ParsedTrustBundle {
  keys: SignerKeyInfo[];
  x509Anchors: X509TrustAnchor[];
  didWebDomains: string[];
  developmentOnly: boolean;
}

async function readTrustBundle(path: string): Promise<ParsedTrustBundle> {
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
  const bundle: ParsedTrustBundle = { keys: [], x509Anchors: [], didWebDomains: [], developmentOnly: false };
  for (const file of files) {
    const parsed = await readJsonFile(file);
    if (parsed.developmentOnly === true) bundle.developmentOnly = true;
    bundle.keys.push(...readKeys(parsed.keys, file));
    bundle.x509Anchors.push(...readX509Anchors(parsed.x509Anchors, file));
    bundle.didWebDomains.push(...readDidWebDomains(parsed.didWebDomains ?? parsed.allowedDidWebDomains, file));
  }
  return bundle;
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
    const certificateFingerprint = key.certificateFingerprint;
    if (certificateFingerprint !== undefined && (typeof certificateFingerprint !== "string" || certificateFingerprint.trim() === "")) {
      throw new TrustStoreLoadError(`Trust bundle key ${index} has invalid certificate fingerprint: ${file}`);
    }
    return {
      issuerId: key.issuerId,
      keyId: key.keyId,
      algorithm: "ES256",
      publicKey,
      ...(certificateFingerprint === undefined ? {} : { certificateFingerprint }),
    };
  });
}

function readX509Anchors(value: unknown, file: string): X509TrustAnchor[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TrustStoreLoadError(`Trust bundle X.509 anchors must be an array: ${file}`);
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TrustStoreLoadError(`Trust bundle X.509 anchor ${index} is invalid: ${file}`);
    }
    const anchor = entry as Record<string, unknown>;
    if (typeof anchor.issuerId !== "string" || anchor.issuerId.trim() === ""
      || typeof anchor.certificateFingerprint !== "string" || anchor.certificateFingerprint.trim() === "") {
      throw new TrustStoreLoadError(`Trust bundle X.509 anchor ${index} has invalid metadata: ${file}`);
    }
    return { issuerId: anchor.issuerId, certificateFingerprint: anchor.certificateFingerprint };
  });
}

function readDidWebDomains(value: unknown, file: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TrustStoreLoadError(`Trust bundle did:web domains must be an array: ${file}`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new TrustStoreLoadError(`Trust bundle did:web domain ${index} is invalid: ${file}`);
    }
    return entry;
  });
}

function trustSourceFor(
  keys: readonly SignerKeyInfo[],
  x509Anchors: readonly X509TrustAnchor[],
  didWebDomains: readonly string[],
): TrustMaterialSource {
  if (x509Anchors.length > 0) return "X509_CHAIN";
  if (keys.length > 0) return "ENTERPRISE_ANCHOR";
  if (didWebDomains.length > 0) return "DID_WEB_DOMAIN";
  return "UNCONFIGURED";
}

function sameKey(left: SignerKeyInfo, right: SignerKeyInfo): boolean {
  if (left.issuerId !== right.issuerId
    || left.keyId !== right.keyId
    || left.algorithm !== right.algorithm
    || normalizeFingerprint(left.certificateFingerprint) !== normalizeFingerprint(right.certificateFingerprint)
    || left.publicKey.length !== right.publicKey.length) {
    return false;
  }
  return left.publicKey.every((byte, index) => byte === right.publicKey[index]);
}

function normalizeFingerprint(fingerprint: string | undefined): string | undefined {
  if (fingerprint === undefined || fingerprint.trim() === "") return undefined;
  return fingerprint.trim().toLowerCase().replace(/:/g, "");
}

function reference(issuerId: string, keyId: string): string {
  return `${issuerId}\u0000${keyId}`;
}

function isBase64(value: string): boolean {
  return value.length > 0
    && value.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

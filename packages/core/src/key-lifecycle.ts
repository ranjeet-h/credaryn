import type { SignerKeyInfo, SignerProvider } from "./signer.js";

export type KeyLifecycleState = "AUTHORIZED" | "ACTIVE" | "RETIRED" | "REVOKED" | "COMPROMISED";

export interface KeyVersionIdentity {
  issuerId: string;
  keyId: string;
  version: string;
  certificateFingerprint: string;
}

export interface KeyVersionRecord {
  identity: KeyVersionIdentity;
  keyInfo: SignerKeyInfo;
  status?: KeyLifecycleState;
  authorizedAt: string;
  activatedAt?: string;
  retiredAt?: string;
  revokedAt?: string;
  compromisedAt?: string;
  reason?: string;
}

export interface ProviderKeyMaterial {
  issuerId: string;
  keyId: string;
  keyVersion: string;
  algorithm: "ES256";
  publicKey: Uint8Array;
  certificateChain?: readonly Uint8Array[];
  certificateFingerprint: string;
}

export type ProviderHealthStatus = "HEALTHY" | "UNAVAILABLE";

export interface ProviderHealth {
  provider: string;
  status: ProviderHealthStatus;
  keyId: string;
  checkedAt: string;
  message?: string;
}

export interface ManagedSignerProvider extends SignerProvider {
  getPublicKey(): Promise<SignerKeyInfo>;
  healthCheck(): Promise<ProviderHealth>;
}

export type ProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "ACCESS_DENIED"
  | "KEY_NOT_FOUND"
  | "SIGNING_FAILED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";

export class ProviderError extends Error {
  readonly provider: string;
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;

  constructor(options: {
    provider: string;
    code: ProviderErrorCode;
    message: string;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "ProviderError";
    this.provider = options.provider;
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

export class KeyLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyLifecycleError";
  }
}

export class KeyLifecycleRegistry {
  private readonly records = new Map<string, KeyVersionRecord>();

  authorize(input: KeyVersionRecord): KeyVersionRecord {
    validateRecord(input);
    const reference = recordReference(input.identity);
    const existing = this.records.get(reference);
    if (existing !== undefined) {
      if (!samePublicIdentity(existing, input)) {
        throw new KeyLifecycleError(`Key identity ${reference} was reused with different public material`);
      }
      return cloneRecord(existing);
    }

    const stored: KeyVersionRecord = {
      ...cloneRecord(input),
      status: "AUTHORIZED",
    };
    this.records.set(reference, stored);
    return cloneRecord(stored);
  }

  activate(identity: KeyVersionIdentity, at = new Date().toISOString()): KeyVersionRecord {
    const record = this.require(identity);
    if (record.status !== "AUTHORIZED") {
      throw new KeyLifecycleError(`Only AUTHORIZED keys can become ACTIVE; current state is ${record.status}`);
    }
    for (const candidate of this.records.values()) {
      if (candidate.identity.issuerId === identity.issuerId && candidate.status === "ACTIVE") {
        candidate.status = "RETIRED";
        candidate.retiredAt = at;
      }
    }
    record.status = "ACTIVE";
    record.activatedAt = at;
    return cloneRecord(record);
  }

  retire(identity: KeyVersionIdentity, at = new Date().toISOString(), reason?: string): KeyVersionRecord {
    const record = this.require(identity);
    if (record.status === "REVOKED" || record.status === "COMPROMISED") {
      throw new KeyLifecycleError(`A ${record.status} key cannot be retired`);
    }
    record.status = "RETIRED";
    record.retiredAt = at;
    if (reason !== undefined) record.reason = reason;
    return cloneRecord(record);
  }

  revoke(identity: KeyVersionIdentity, reason: string, at = new Date().toISOString()): KeyVersionRecord {
    return this.changeStatus(identity, "REVOKED", reason, at);
  }

  compromise(identity: KeyVersionIdentity, reason: string, at = new Date().toISOString()): KeyVersionRecord {
    return this.changeStatus(identity, "COMPROMISED", reason, at);
  }

  getActive(issuerId: string): KeyVersionRecord | undefined {
    for (const record of this.records.values()) {
      if (record.identity.issuerId === issuerId && record.status === "ACTIVE") return cloneRecord(record);
    }
    return undefined;
  }

  resolve(identity: KeyVersionIdentity): KeyVersionRecord | undefined {
    const record = this.records.get(recordReference(identity));
    return record === undefined ? undefined : cloneRecord(record);
  }

  list(issuerId?: string): readonly KeyVersionRecord[] {
    return [...this.records.values()]
      .filter((record) => issuerId === undefined || record.identity.issuerId === issuerId)
      .map(cloneRecord);
  }

  getSigningKey(issuerId: string): KeyVersionRecord {
    const active = this.getActive(issuerId);
    if (active === undefined) throw new KeyLifecycleError(`No ACTIVE signing key is configured for issuer ${issuerId}`);
    return active;
  }

  private changeStatus(
    identity: KeyVersionIdentity,
    status: "REVOKED" | "COMPROMISED",
    reason: string,
    at: string,
  ): KeyVersionRecord {
    if (reason.trim() === "") throw new KeyLifecycleError(`${status} keys require a reason`);
    const record = this.require(identity);
    record.status = status;
    record.reason = reason;
    if (status === "REVOKED") record.revokedAt = at;
    if (status === "COMPROMISED") record.compromisedAt = at;
    return cloneRecord(record);
  }

  private require(identity: KeyVersionIdentity): KeyVersionRecord {
    const record = this.records.get(recordReference(identity));
    if (record === undefined) throw new KeyLifecycleError(`Unknown key version ${recordReference(identity)}`);
    return record;
  }
}

export function versionedKeyId(keyId: string, keyVersion: string): string {
  if (keyId.trim() === "" || keyVersion.trim() === "") throw new KeyLifecycleError("keyId and keyVersion must not be empty");
  return `${keyId}@${keyVersion}`;
}

function validateRecord(record: KeyVersionRecord): void {
  if (record.keyInfo.algorithm !== "ES256") throw new KeyLifecycleError("Only ES256 key versions are supported");
  if (record.keyInfo.issuerId !== record.identity.issuerId || record.keyInfo.keyId !== record.identity.keyId) {
    throw new KeyLifecycleError("Key identity does not match key metadata");
  }
  if (record.identity.issuerId.trim() === "" || record.identity.keyId.trim() === "" || record.identity.version.trim() === "") {
    throw new KeyLifecycleError("issuerId, keyId and version must not be empty");
  }
  if (record.identity.certificateFingerprint.trim() === "") throw new KeyLifecycleError("certificateFingerprint must not be empty");
  if (record.keyInfo.publicKey.byteLength === 0) throw new KeyLifecycleError("publicKey must not be empty");
}

function samePublicIdentity(left: KeyVersionRecord, right: KeyVersionRecord): boolean {
  return left.identity.certificateFingerprint === right.identity.certificateFingerprint
    && bytesEqual(left.keyInfo.publicKey, right.keyInfo.publicKey);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function recordReference(identity: KeyVersionIdentity): string {
  return `${identity.issuerId}\u0000${identity.keyId}\u0000${identity.version}`;
}

function cloneRecord(record: KeyVersionRecord): KeyVersionRecord {
  const clone: KeyVersionRecord = {
    identity: { ...record.identity },
    keyInfo: {
      ...record.keyInfo,
      publicKey: new Uint8Array(record.keyInfo.publicKey),
    },
    authorizedAt: record.authorizedAt,
  };
  if (record.status !== undefined) clone.status = record.status;
  if (record.keyInfo.certificateChain !== undefined) {
    clone.keyInfo.certificateChain = record.keyInfo.certificateChain.map((certificate) => new Uint8Array(certificate));
  }
  if (record.activatedAt !== undefined) clone.activatedAt = record.activatedAt;
  if (record.retiredAt !== undefined) clone.retiredAt = record.retiredAt;
  if (record.revokedAt !== undefined) clone.revokedAt = record.revokedAt;
  if (record.compromisedAt !== undefined) clone.compromisedAt = record.compromisedAt;
  if (record.reason !== undefined) clone.reason = record.reason;
  return clone;
}

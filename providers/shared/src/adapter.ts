import {
  ProviderError,
  type ProviderErrorCode,
  type ProviderHealth,
  type ProviderKeyMaterial,
} from "@credaryn/core";
import { versionedKeyId, type SignerKeyInfo } from "@credaryn/core";

export function toSignerKeyInfo(material: ProviderKeyMaterial): SignerKeyInfo {
  if (material.algorithm !== "ES256" || material.publicKey.byteLength === 0 || material.certificateFingerprint.trim() === "") {
    throw new ProviderError({
      provider: "provider-contract",
      code: "INVALID_RESPONSE",
      message: "Provider returned incomplete ES256 public-key metadata",
      retryable: false,
    });
  }
  const info: SignerKeyInfo = {
    issuerId: material.issuerId,
    keyId: versionedKeyId(material.keyId, material.keyVersion),
    algorithm: material.algorithm,
    publicKey: new Uint8Array(material.publicKey),
    certificateFingerprint: material.certificateFingerprint,
  };
  if (material.certificateChain !== undefined) {
    info.certificateChain = material.certificateChain.map((certificate) => new Uint8Array(certificate));
  }
  return info;
}

export function cloneSignerKeyInfo(info: SignerKeyInfo): SignerKeyInfo {
  const clone: SignerKeyInfo = { ...info, publicKey: new Uint8Array(info.publicKey) };
  if (info.certificateChain !== undefined) {
    clone.certificateChain = info.certificateChain.map((certificate) => new Uint8Array(certificate));
  }
  return clone;
}

export function normalizeProviderError(
  provider: string,
  code: ProviderErrorCode,
  retryable: boolean,
  error: unknown,
): ProviderError {
  if (error instanceof ProviderError) {
    if (error.provider === provider) return error;
    return new ProviderError({
      provider,
      code: error.code,
      retryable: error.retryable,
      message: error.message,
    });
  }
  return new ProviderError({
    provider,
    code,
    retryable,
    message: error instanceof Error ? error.message : `${provider} operation failed`,
  });
}

export function healthy(provider: string, keyId: string): ProviderHealth {
  return { provider, status: "HEALTHY", keyId, checkedAt: new Date().toISOString() };
}

export function unavailable(provider: string, keyId: string, error: unknown): ProviderHealth {
  return {
    provider,
    status: "UNAVAILABLE",
    keyId,
    checkedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : `${provider} is unavailable`,
  };
}

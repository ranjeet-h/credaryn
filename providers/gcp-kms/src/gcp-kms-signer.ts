import { createHash } from "node:crypto";
import {
  type ManagedSignerProvider,
  type ProviderKeyMaterial,
  type SignerKeyInfo,
} from "@credaryn/core";
import { cloneSignerKeyInfo, healthy, normalizeProviderError, toSignerKeyInfo, unavailable } from "../../shared/src/adapter.js";

export interface GcpKmsClient {
  getPublicKey(): Promise<ProviderKeyMaterial>;
  asymmetricSign(request: { digest: Uint8Array; algorithm: "EC_SIGN_P256_SHA256" }): Promise<Uint8Array>;
  healthCheck(): Promise<void>;
}

export class GcpKmsSigner implements ManagedSignerProvider {
  private readonly client: GcpKmsClient;
  private keyInfo?: SignerKeyInfo;

  constructor(options: { client: GcpKmsClient }) {
    this.client = options.client;
  }

  async getKeyInfo(): Promise<SignerKeyInfo> {
    if (this.keyInfo !== undefined) return cloneSignerKeyInfo(this.keyInfo);
    try {
      this.keyInfo = toSignerKeyInfo(await this.client.getPublicKey());
      return cloneSignerKeyInfo(this.keyInfo);
    } catch (error) {
      throw normalizeProviderError("gcp-kms", "INVALID_RESPONSE", false, error);
    }
  }

  async getPublicKey(): Promise<SignerKeyInfo> {
    return this.getKeyInfo();
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(await this.client.asymmetricSign({
        digest: new Uint8Array(createHash("sha256").update(input).digest()),
        algorithm: "EC_SIGN_P256_SHA256",
      }));
    } catch (error) {
      throw normalizeProviderError("gcp-kms", "SIGNING_FAILED", false, error);
    }
  }

  async healthCheck() {
    try {
      const keyInfo = await this.getKeyInfo();
      await this.client.healthCheck();
      return healthy("gcp-kms", keyInfo.keyId);
    } catch (error) {
      return unavailable("gcp-kms", this.keyInfo?.keyId ?? "unknown", error);
    }
  }
}

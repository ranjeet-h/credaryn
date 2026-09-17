import { createHash } from "node:crypto";
import {
  type ManagedSignerProvider,
  type ProviderKeyMaterial,
  type SignerKeyInfo,
} from "@credaryn/core";
import { cloneSignerKeyInfo, healthy, normalizeProviderError, toSignerKeyInfo, unavailable } from "../../shared/src/adapter.js";

export interface AzureKeyVaultClient {
  getKey(): Promise<ProviderKeyMaterial>;
  sign(request: { digest: Uint8Array; algorithm: "ES256" }): Promise<Uint8Array>;
  healthCheck(): Promise<void>;
}

export class AzureKeyVaultSigner implements ManagedSignerProvider {
  private readonly client: AzureKeyVaultClient;
  private keyInfo?: SignerKeyInfo;

  constructor(options: { client: AzureKeyVaultClient }) {
    this.client = options.client;
  }

  async getKeyInfo(): Promise<SignerKeyInfo> {
    if (this.keyInfo !== undefined) return cloneSignerKeyInfo(this.keyInfo);
    try {
      this.keyInfo = toSignerKeyInfo(await this.client.getKey());
      return cloneSignerKeyInfo(this.keyInfo);
    } catch (error) {
      throw normalizeProviderError("azure-key-vault", "INVALID_RESPONSE", false, error);
    }
  }

  async getPublicKey(): Promise<SignerKeyInfo> {
    return this.getKeyInfo();
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(await this.client.sign({
        digest: new Uint8Array(createHash("sha256").update(input).digest()),
        algorithm: "ES256",
      }));
    } catch (error) {
      throw normalizeProviderError("azure-key-vault", "SIGNING_FAILED", false, error);
    }
  }

  async healthCheck() {
    try {
      const keyInfo = await this.getKeyInfo();
      await this.client.healthCheck();
      return healthy("azure-key-vault", keyInfo.keyId);
    } catch (error) {
      return unavailable("azure-key-vault", this.keyInfo?.keyId ?? "unknown", error);
    }
  }
}

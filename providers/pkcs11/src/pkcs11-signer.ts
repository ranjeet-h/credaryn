import { createHash } from "node:crypto";
import {
  type ManagedSignerProvider,
  type ProviderKeyMaterial,
  type SignerKeyInfo,
} from "@credaryn/core";
import { cloneSignerKeyInfo, healthy, normalizeProviderError, toSignerKeyInfo, unavailable } from "../../shared/src/adapter.js";

export interface Pkcs11Client {
  getPublicKey(): Promise<ProviderKeyMaterial>;
  sign(request: { digest: Uint8Array; mechanism: "ECDSA_SHA256" }): Promise<Uint8Array>;
  healthCheck(): Promise<void>;
}

export class Pkcs11Signer implements ManagedSignerProvider {
  private readonly client: Pkcs11Client;
  private keyInfo?: SignerKeyInfo;

  constructor(options: { client: Pkcs11Client }) {
    this.client = options.client;
  }

  async getKeyInfo(): Promise<SignerKeyInfo> {
    if (this.keyInfo !== undefined) return cloneSignerKeyInfo(this.keyInfo);
    try {
      this.keyInfo = toSignerKeyInfo(await this.client.getPublicKey());
      return cloneSignerKeyInfo(this.keyInfo);
    } catch (error) {
      throw normalizeProviderError("pkcs11", "INVALID_RESPONSE", false, error);
    }
  }

  async getPublicKey(): Promise<SignerKeyInfo> {
    return this.getKeyInfo();
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(await this.client.sign({
        digest: new Uint8Array(createHash("sha256").update(input).digest()),
        mechanism: "ECDSA_SHA256",
      }));
    } catch (error) {
      throw normalizeProviderError("pkcs11", "SIGNING_FAILED", false, error);
    }
  }

  async healthCheck() {
    try {
      const keyInfo = await this.getKeyInfo();
      await this.client.healthCheck();
      return healthy("pkcs11", keyInfo.keyId);
    } catch (error) {
      return unavailable("pkcs11", this.keyInfo?.keyId ?? "unknown", error);
    }
  }
}

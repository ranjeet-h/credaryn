import { createHash } from "node:crypto";
import {
  type ManagedSignerProvider,
  type ProviderKeyMaterial,
  type SignerKeyInfo,
} from "@credaryn/core";
import {
  cloneSignerKeyInfo,
  healthy,
  normalizeProviderError,
  toSignerKeyInfo,
  unavailable,
} from "../../shared/src/adapter.js";
import { derToCoseSignature } from "./der-to-cose.js";

export interface AwsKmsClient {
  describeKey(): Promise<ProviderKeyMaterial>;
  sign(request: {
    digest: Uint8Array;
    messageType: "DIGEST";
    signingAlgorithm: "ECDSA_SHA_256";
  }): Promise<Uint8Array>;
  healthCheck(): Promise<void>;
}

export interface AwsKmsSignerOptions {
  client: AwsKmsClient;
}

export class AwsKmsSigner implements ManagedSignerProvider {
  private readonly client: AwsKmsClient;
  private keyInfo?: SignerKeyInfo;

  constructor(options: AwsKmsSignerOptions) {
    this.client = options.client;
  }

  async getKeyInfo(): Promise<SignerKeyInfo> {
    if (this.keyInfo !== undefined) return cloneSignerKeyInfo(this.keyInfo);
    try {
      this.keyInfo = toSignerKeyInfo(await this.client.describeKey());
      return cloneSignerKeyInfo(this.keyInfo);
    } catch (error) {
      throw normalizeProviderError("aws-kms", "INVALID_RESPONSE", false, error);
    }
  }

  async getPublicKey(): Promise<SignerKeyInfo> {
    return this.getKeyInfo();
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    try {
      const signature = await this.client.sign({
        digest: new Uint8Array(createHash("sha256").update(input).digest()),
        messageType: "DIGEST",
        signingAlgorithm: "ECDSA_SHA_256",
      });
      return derToCoseSignature(signature);
    } catch (error) {
      throw normalizeProviderError("aws-kms", "SIGNING_FAILED", false, error);
    }
  }

  async healthCheck() {
    try {
      const keyInfo = await this.getKeyInfo();
      await this.client.healthCheck();
      return healthy("aws-kms", keyInfo.keyId);
    } catch (error) {
      return unavailable("aws-kms", this.keyInfo?.keyId ?? "unknown", error);
    }
  }
}

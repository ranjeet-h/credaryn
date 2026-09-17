import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import type { SignerKeyInfo, SignerProvider } from "@credaryn/core";

export interface LocalSignerOptions {
  issuerId: string;
  keyId: string;
}

export class LocalSigner implements SignerProvider {
  readonly isDevelopmentOnly = true;
  readonly trustLabel = "DEVELOPMENT_ONLY" as const;
  private readonly privateKey: KeyObject;
  private readonly keyInfo: SignerKeyInfo;

  constructor(options: LocalSignerOptions) {
    if (options.issuerId.trim() === "" || options.keyId.trim() === "") {
      throw new Error("issuerId and keyId must not be empty");
    }

    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    this.privateKey = privateKey;
    this.keyInfo = {
      issuerId: options.issuerId,
      keyId: options.keyId,
      algorithm: "ES256",
      publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
    };
  }

  async getKeyInfo(): Promise<SignerKeyInfo> {
    return {
      ...this.keyInfo,
      publicKey: new Uint8Array(this.keyInfo.publicKey),
    };
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    const operation = createSign("SHA256");
    operation.update(input);
    return new Uint8Array(operation.sign(this.privateKey));
  }
}

import type { SignerKeyInfo, TrustStore } from "@credaryn/core";

export class DemoTrustStore implements TrustStore {
  readonly isDevelopmentOnly = true;
  readonly trustSource = "local-demo-trust-store" as const;
  private readonly keys: readonly SignerKeyInfo[];

  constructor(keys: readonly SignerKeyInfo[]) {
    this.keys = keys.map(cloneKeyInfo);
  }

  async resolve(keyId: string, issuerId: string): Promise<SignerKeyInfo | undefined> {
    const key = this.keys.find((candidate) => candidate.keyId === keyId && candidate.issuerId === issuerId);
    return key === undefined ? undefined : cloneKeyInfo(key);
  }
}

function cloneKeyInfo(keyInfo: SignerKeyInfo): SignerKeyInfo {
  const clone: SignerKeyInfo = {
    ...keyInfo,
    publicKey: new Uint8Array(keyInfo.publicKey),
  };
  if (keyInfo.certificateChain !== undefined) {
    clone.certificateChain = keyInfo.certificateChain.map((certificate) => new Uint8Array(certificate));
  }
  return clone;
}

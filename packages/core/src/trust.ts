import type { SignerKeyInfo } from "./signer.js";

export interface TrustStore {
  resolve(keyId: string, issuerId: string): Promise<SignerKeyInfo | undefined>;
}

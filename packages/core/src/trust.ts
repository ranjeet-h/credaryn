import type { SignerKeyInfo } from "./signer.js";

export interface TrustStore {
  resolve(keyId: string, issuerId: string): Promise<SignerKeyInfo | undefined>;
  resolveByFingerprint?(certificateFingerprint: string): Promise<SignerKeyInfo | undefined> | SignerKeyInfo | undefined;
  isTrusted?(keyInfo: SignerKeyInfo): Promise<boolean> | boolean;
  trustSource?: string;
}

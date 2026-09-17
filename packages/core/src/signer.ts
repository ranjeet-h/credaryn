export type SigningAlgorithm = "ES256";

export const V1_SIGNING_ALGORITHM: SigningAlgorithm = "ES256";

export interface SignerKeyInfo {
  issuerId: string;
  keyId: string;
  algorithm: SigningAlgorithm;
  publicKey: Uint8Array;
  certificateChain?: readonly Uint8Array[];
  certificateFingerprint?: string;
}

export interface SignerProvider {
  getKeyInfo(): Promise<SignerKeyInfo>;
  sign(input: Uint8Array): Promise<Uint8Array>;
}

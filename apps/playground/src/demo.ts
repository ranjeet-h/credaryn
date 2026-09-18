import type { SignerKeyInfo, TrustStore } from "@credaryn/core";

export const DEMO_INVOICE_TOTAL_MINOR = 1_180_000;
export const TAMPERED_INVOICE_TOTAL_MINOR = 8_180_000;

export interface TamperResultDescription {
  visibleTotalMinor: number;
  signedPaperTotalMinor: number;
  expectedPdfVerdict: "INVALID";
  expectedPaperVerdict: "VALID_TRUSTED";
}

export function describeTamperResult(): TamperResultDescription {
  return {
    visibleTotalMinor: TAMPERED_INVOICE_TOTAL_MINOR,
    signedPaperTotalMinor: DEMO_INVOICE_TOTAL_MINOR,
    expectedPdfVerdict: "INVALID",
    expectedPaperVerdict: "VALID_TRUSTED",
  };
}

export function createDemoTrustStore(paperKey: SignerKeyInfo): TrustStore {
  const pdfKey: SignerKeyInfo = {
    issuerId: "acme-retail",
    keyId: "dss-demo-key",
    algorithm: "ES256",
    publicKey: new Uint8Array(),
  };
  const keys = [pdfKey, paperKey].map((key) => ({
    ...key,
    publicKey: new Uint8Array(key.publicKey),
  }));
  return {
    trustSource: "local-demo-trust-store",
    resolve: async (keyId, issuerId) => keys.find((key) => key.keyId === keyId && key.issuerId === issuerId),
    isTrusted: (keyInfo) => keys.some((key) => key.issuerId === keyInfo.issuerId
      && key.keyId === keyInfo.keyId
      && key.algorithm === keyInfo.algorithm
      && key.publicKey.length === keyInfo.publicKey.length
      && key.publicKey.every((byte, index) => byte === keyInfo.publicKey[index])),
  };
}

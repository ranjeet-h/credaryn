import type { SignerKeyInfo, SignerProvider } from "@credaryn/core";
import type { DocumentDescriptor } from "@credaryn/core";

export const vectorDescriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: {
    currency: "INR",
    invoiceNumber: "INV-2026-82919",
    totalMinor: 1_180_000,
  },
};

export const vectorKeyInfo: SignerKeyInfo = {
  issuerId: "acme-retail",
  keyId: "phase-2-vector",
  algorithm: "ES256",
  publicKey: new Uint8Array(Buffer.from("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvANWaSWJnxyKqiq44yHnAmL1hKDuurfvRzxYGIayKDY6VNjfq8XLulAvF+31pLMdrKMcJMDE/9Yu1zI+KaLD7A==", "base64")),
};

const vectorSignature = new Uint8Array(Buffer.from("MEYCIQDHkRZGaIypY0NcbHnQwtE3aMfMxgcLf8N5P9L4mgiEFQIhAJT58UaBpO3azSUWbujCY3lGAXoGYt8iPZe9kJczQPfU", "base64"));

export const vectorSigner: SignerProvider = {
  getKeyInfo: async () => ({ ...vectorKeyInfo, publicKey: new Uint8Array(vectorKeyInfo.publicKey) }),
  sign: async () => new Uint8Array(vectorSignature),
};

import { GcpKmsSigner, type GcpKmsClient } from "@credaryn/provider-gcp-kms";
import { encodePaperSeal } from "@credaryn/paper";
import type { DocumentDescriptor, ProviderKeyMaterial } from "@credaryn/core";

const signer = new GcpKmsSigner({ client: client() });
const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "GCP-KMS-EXAMPLE-001",
  documentType: "invoice",
  issuedAt: "2026-09-17T00:00:00Z",
  claims: { currency: "INR", totalMinor: 1180000 },
};

if (process.env.CREDARYN_PROVIDER_MOCK !== "1") {
  throw new Error("This example is an adapter smoke test. Set CREDARYN_PROVIDER_MOCK=1 or inject your application Google KMS client.");
}

const seal = await encodePaperSeal(descriptor, signer);
console.log(JSON.stringify({ provider: "gcp-kms", key: await signer.getKeyInfo(), health: await signer.healthCheck(), transport: seal.transport }, null, 2));

function client(): GcpKmsClient {
  return {
    getPublicKey: async () => material(),
    asymmetricSign: async () => derSignature(),
    healthCheck: async () => undefined,
  };
}

function material(): ProviderKeyMaterial {
  return {
    issuerId: "acme-retail",
    keyId: "issuer-key",
    keyVersion: "v1",
    algorithm: "ES256",
    publicKey: new Uint8Array([1, 2, 3]),
    certificateFingerprint: "sha256:example",
  };
}

function derSignature(): Uint8Array {
  return new Uint8Array([0x30, 0x44, 0x02, 0x20, ...new Uint8Array(32).fill(1), 0x02, 0x20, ...new Uint8Array(32).fill(2)]);
}

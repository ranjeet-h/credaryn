import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor } from "@credaryn/core";
import { encodePaperSeal } from "@credaryn/paper";
import { AwsKmsSigner, type AwsKmsClient } from "../../aws-kms/src/aws-kms-signer.js";
import { derToCoseSignature } from "../../aws-kms/src/der-to-cose.js";
import { AzureKeyVaultSigner, type AzureKeyVaultClient } from "../../azure-key-vault/src/azure-key-vault-signer.js";
import { GcpKmsSigner, type GcpKmsClient } from "../../gcp-kms/src/gcp-kms-signer.js";
import { Pkcs11Signer, type Pkcs11Client } from "../../pkcs11/src/pkcs11-signer.js";

interface Es256Vector {
  derHex: string;
  coseSignatureHex: string;
}

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "VECTOR-001",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", totalMinor: 1180000 },
};

describe("shared ES256 provider vectors", () => {
  it("matches the DER-to-COSE known-answer vector", async () => {
    const vector = await readVector();
    expect(Buffer.from(derToCoseSignature(Buffer.from(vector.derHex, "hex"))).toString("hex")).toBe(vector.coseSignatureHex);
  });

  it("produces identical Paper Seal semantics across provider adapters", async () => {
    const signers = [
      new AwsKmsSigner({ client: awsClient() }),
      new GcpKmsSigner({ client: gcpClient() }),
      new AzureKeyVaultSigner({ client: azureClient() }),
      new Pkcs11Signer({ client: pkcs11Client() }),
    ];
    const transports = await Promise.all(signers.map(async (signer) => (await encodePaperSeal(descriptor, signer)).transport));
    expect(new Set(transports).size).toBe(1);
    expect(transports[0]).toMatch(/^CRD1:/);
  });
});

async function readVector(): Promise<Es256Vector> {
  return JSON.parse(await readFile(new URL("../../../test-vectors/providers/es256/der-signature.json", import.meta.url), "utf8")) as Es256Vector;
}

function material() {
  return {
    issuerId: "acme-retail",
    keyId: "issuer-key",
    keyVersion: "v1",
    algorithm: "ES256" as const,
    publicKey: new Uint8Array([1, 2, 3]),
    certificateFingerprint: "sha256:fixture",
  };
}

function signature(): Uint8Array {
  return new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);
}

function awsClient(): AwsKmsClient {
  return { describeKey: async () => material(), sign: async () => signature(), healthCheck: async () => undefined };
}

function gcpClient(): GcpKmsClient {
  return { getPublicKey: async () => material(), asymmetricSign: async () => signature(), healthCheck: async () => undefined };
}

function azureClient(): AzureKeyVaultClient {
  return { getKey: async () => material(), sign: async () => signature(), healthCheck: async () => undefined };
}

function pkcs11Client(): Pkcs11Client {
  return { getPublicKey: async () => material(), sign: async () => signature(), healthCheck: async () => undefined };
}

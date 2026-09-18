import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { DocumentDescriptor, ManagedSignerProvider } from "@credaryn/core";
import { encodePaperSeal } from "@credaryn/paper";
import { AwsKmsSigner, type AwsKmsClient } from "../../aws-kms/src/aws-kms-signer.js";
import { derToCoseSignature } from "../../aws-kms/src/der-to-cose.js";
import { AzureKeyVaultSigner, type AzureKeyVaultClient } from "../../azure-key-vault/src/azure-key-vault-signer.js";
import { GcpKmsSigner, type GcpKmsClient } from "../../gcp-kms/src/gcp-kms-signer.js";
import { Pkcs11Signer, type Pkcs11Client } from "../../pkcs11/src/pkcs11-signer.js";

interface Es256Vector {
  name: string;
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
    expect(Buffer.from(derToCoseSignature(derBytes(vector))).toString("hex")).toBe(vector.coseSignatureHex);
  });

  it("AWS KMS converts a DER client signature to fixed-width COSE r||s at the boundary", async () => {
    const vector = await readVector();
    const signer = new AwsKmsSigner({ client: awsClient(derBytes(vector)) });

    const signature = await signer.sign(new Uint8Array([1, 2, 3]));

    // The injected AWS client returns DER; the adapter must hand callers the
    // fixed-width 64-byte ES256 r||s form, not the raw DER.
    expect(signature).toHaveLength(64);
    expect(Buffer.from(signature).toString("hex")).toBe(vector.coseSignatureHex);
  });

  it("cloud and HSM adapters pass through their client's documented DER signature", async () => {
    const vector = await readVector();
    const der = derBytes(vector);
    const signers: ReadonlyArray<readonly [string, ManagedSignerProvider]> = [
      ["gcp-kms", new GcpKmsSigner({ client: gcpClient(der) })],
      ["azure-key-vault", new AzureKeyVaultSigner({ client: azureClient(der) })],
      ["pkcs11", new Pkcs11Signer({ client: pkcs11Client(der) })],
    ];

    for (const [provider, signer] of signers) {
      const signature = await signer.sign(new Uint8Array([1, 2, 3]));
      expect(signature, `${provider} must not re-encode its client signature`).toHaveLength(der.length);
      expect(Buffer.from(signature).toString("hex"), `${provider} DER passthrough`).toBe(vector.derHex);
    }
  });

  it("produces identical Paper Seal semantics across provider adapters", async () => {
    const vector = await readVector();
    const der = derBytes(vector);
    const signers = [
      new AwsKmsSigner({ client: awsClient(der) }),
      new GcpKmsSigner({ client: gcpClient(der) }),
      new AzureKeyVaultSigner({ client: azureClient(der) }),
      new Pkcs11Signer({ client: pkcs11Client(der) }),
    ];
    const transports = await Promise.all(signers.map(async (signer) => (await encodePaperSeal(descriptor, signer)).transport));
    expect(new Set(transports).size).toBe(1);
    expect(transports[0]).toMatch(/^CRD1:/);
  });
});

async function readVector(): Promise<Es256Vector> {
  return JSON.parse(await readFile(new URL("../../../test-vectors/providers/es256/der-signature.json", import.meta.url), "utf8")) as Es256Vector;
}

function derBytes(vector: Es256Vector): Uint8Array {
  return new Uint8Array(Buffer.from(vector.derHex, "hex"));
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

function awsClient(signature: Uint8Array): AwsKmsClient {
  return { describeKey: async () => material(), sign: async () => signature, healthCheck: async () => undefined };
}

function gcpClient(signature: Uint8Array): GcpKmsClient {
  return { getPublicKey: async () => material(), asymmetricSign: async () => signature, healthCheck: async () => undefined };
}

function azureClient(signature: Uint8Array): AzureKeyVaultClient {
  return { getKey: async () => material(), sign: async () => signature, healthCheck: async () => undefined };
}

function pkcs11Client(signature: Uint8Array): Pkcs11Client {
  return { getPublicKey: async () => material(), sign: async () => signature, healthCheck: async () => undefined };
}

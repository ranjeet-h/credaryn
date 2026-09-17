import { describe, expect, it } from "vitest";
import { defineProviderContract } from "../../shared/test/provider-contract.js";
import { AwsKmsSigner, type AwsKmsClient } from "../src/aws-kms-signer.js";
import { derToCoseSignature } from "../src/der-to-cose.js";

const DER_SIGNATURE = new Uint8Array([
  0x30, 0x46, 0x02, 0x21, 0x00,
  0x80, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
  0x02, 0x21, 0x00,
  0x81, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
]);

defineProviderContract("aws-kms", (signature = DER_SIGNATURE, failure) => new AwsKmsSigner({ client: client(signature, failure) }));

describe("AWS KMS DER conversion", () => {
  it("converts a DER ECDSA signature to fixed-width COSE r||s", () => {
    const raw = derToCoseSignature(DER_SIGNATURE);
    expect(raw).toHaveLength(64);
    expect(raw[0]).toBe(0x80);
    expect(raw[32]).toBe(0x81);
  });

  it("rejects malformed and non-canonical signatures", () => {
    expect(() => derToCoseSignature(new Uint8Array([0x30, 0x00]))).toThrow(/DER/);
    expect(() => derToCoseSignature(new Uint8Array([...DER_SIGNATURE, 0x00]))).toThrow(/length|trailing/i);
  });

  it("normalizes a provider failure without leaking the original error shape", async () => {
    const provider = new AwsKmsSigner({
      client: client(DER_SIGNATURE, new Error("access denied")),
    });
    await expect(provider.sign(new Uint8Array([1]))).rejects.toMatchObject({
      provider: "aws-kms",
      code: "SIGNING_FAILED",
      retryable: false,
    });
  });

  it("normalizes malformed public-key metadata to the provider boundary", async () => {
    const provider = new AwsKmsSigner({
      client: {
        ...client(DER_SIGNATURE),
        describeKey: async () => ({
          ...clientMaterial(),
          publicKey: new Uint8Array(),
        }),
      },
    });

    await expect(provider.getKeyInfo()).rejects.toMatchObject({
      provider: "aws-kms",
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });
});

function client(signature: Uint8Array, failure?: Error): AwsKmsClient {
  return {
    describeKey: async () => clientMaterial(),
    sign: async () => {
      if (failure !== undefined) throw failure;
      return signature;
    },
    healthCheck: async () => undefined,
  };
}

function clientMaterial() {
  return {
    issuerId: "acme-retail",
    keyId: "issuer-key",
    keyVersion: "v1",
    algorithm: "ES256" as const,
    publicKey: new Uint8Array([1, 2, 3]),
    certificateFingerprint: "sha256:fixture",
  };
}

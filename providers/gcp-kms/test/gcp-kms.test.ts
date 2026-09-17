import { defineProviderContract } from "../../shared/test/provider-contract.js";
import { GcpKmsSigner, type GcpKmsClient } from "../src/gcp-kms-signer.js";

const SIGNATURE = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);

defineProviderContract("gcp-kms", (_signature, failure) => new GcpKmsSigner({ client: client(failure) }));

function client(failure?: Error): GcpKmsClient {
  return {
    getPublicKey: async () => ({
      issuerId: "acme-retail",
      keyId: "issuer-key",
      keyVersion: "v1",
      algorithm: "ES256",
      publicKey: new Uint8Array([1, 2, 3]),
      certificateFingerprint: "sha256:fixture",
    }),
    asymmetricSign: async () => {
      if (failure !== undefined) throw failure;
      return SIGNATURE;
    },
    healthCheck: async () => undefined,
  };
}

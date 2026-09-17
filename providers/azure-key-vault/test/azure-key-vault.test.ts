import { defineProviderContract } from "../../shared/test/provider-contract.js";
import { AzureKeyVaultSigner, type AzureKeyVaultClient } from "../src/azure-key-vault-signer.js";

const SIGNATURE = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);

defineProviderContract("azure-key-vault", (_signature, failure) => new AzureKeyVaultSigner({ client: client(failure) }));

function client(failure?: Error): AzureKeyVaultClient {
  return {
    getKey: async () => ({
      issuerId: "acme-retail",
      keyId: "issuer-key",
      keyVersion: "v1",
      algorithm: "ES256",
      publicKey: new Uint8Array([1, 2, 3]),
      certificateFingerprint: "sha256:fixture",
    }),
    sign: async () => {
      if (failure !== undefined) throw failure;
      return SIGNATURE;
    },
    healthCheck: async () => undefined,
  };
}

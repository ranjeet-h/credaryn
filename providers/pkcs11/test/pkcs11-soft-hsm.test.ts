import { defineProviderContract } from "../../shared/test/provider-contract.js";
import { Pkcs11Signer, type Pkcs11Client } from "../src/pkcs11-signer.js";

const SIGNATURE = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);

defineProviderContract("pkcs11", (_signature, failure) => new Pkcs11Signer({ client: client(failure) }));

function client(failure?: Error): Pkcs11Client {
  return {
    getPublicKey: async () => ({
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

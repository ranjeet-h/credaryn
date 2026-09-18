import { describe, expect, it } from "vitest";
import {
  createDidKeyIdentity,
  createDidWebIdentity,
  issueCredential,
  type W3cCredential,
} from "../src/issuer.js";
import { verifyCredential } from "../src/verifier.js";
import { createBitstringStatusList, createStatusEntry } from "../src/status-list.js";

const credentialSubject = {
  invoiceNumber: "INV-2026-82919",
  totalMinor: 1_180_000,
};

describe("TrustVC W3C interoperability", () => {
  it("issues and verifies ECDSA-SD-2023 with a local did:key identity", async () => {
    const identity = await createDidKeyIdentity("11111111111111111111111111111111");
    const issued = await issueCredential({
      identity,
      credentialSubject,
      mandatoryPointers: ["/credentialSubject/invoiceNumber"],
    });

    const result = await verifyCredential(issued.credential);

    expect(identity.did).toMatch(/^did:key:/);
    expect(issued.credential.issuer).toBe(identity.did);
    expect(issued.credential.proof?.cryptosuite).toBe("ecdsa-sd-2023");
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.issuerId).toBe(identity.did);
  });

  it("issues and verifies a production-shaped did:web fixture through an injected DID document", async () => {
    const identity = await createDidWebIdentity("issuer.example.test");
    const issued = await issueCredential({ identity, credentialSubject });

    const result = await verifyCredential(issued.credential, {
      didDocuments: new Map<string, Record<string, unknown>>([[identity.did, identity.didDocument!]]),
    });
    expect(identity.did).toBe("did:web:issuer.example.test");
    expect(identity.didDocument!.id).toBe(identity.did);
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.issuerId).toBe(identity.did);
  });

  it("derives a selective-disclosure credential without changing the original", async () => {
    const identity = await createDidKeyIdentity("11111111111111111111111111111111");
    const issued = await issueCredential({ identity, credentialSubject });
    const derived = await issueCredential({
      identity,
      credentialSubject,
      mandatoryPointers: ["/credentialSubject/invoiceNumber"],
      deriveFrom: issued.credential,
    });

    expect(derived.credential.credentialSubject).toMatchObject({ invoiceNumber: credentialSubject.invoiceNumber });
    expect(derived.credential.credentialSubject).not.toHaveProperty("totalMinor");
    expect(issued.credential.credentialSubject).toHaveProperty("totalMinor", credentialSubject.totalMinor);
  });

  it("creates W3C Bitstring Status List v1.0 entries", async () => {
    const statusList = await createBitstringStatusList({
      id: "https://issuer.example.test/status/1",
      purpose: "revocation",
      revokedIndexes: [7],
    });
    const status = createStatusEntry(statusList, 7);

    expect(statusList.credential.credentialSubject.type).toBe("BitstringStatusList");
    expect(statusList.credential.credentialSubject.statusPurpose).toBe("revocation");
    expect(status.statusListIndex).toBe("7");
    expect(status.statusListCredential).toBe(statusList.credential.id);
    expect(statusList.isSet(7)).toBe(true);
    expect(statusList.isSet(8)).toBe(false);
  });
});

export type { W3cCredential };

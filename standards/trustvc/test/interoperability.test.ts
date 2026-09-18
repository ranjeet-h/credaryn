import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createDidKeyIdentity,
  createDidWebIdentity,
  issueCredential,
  type W3cCredential,
} from "../src/issuer.js";
import { verifyCredential } from "../src/verifier.js";
import { createBitstringStatusList, createStatusEntry, STATUS_LIST_CONTEXT } from "../src/status-list.js";

const credentialSubject = {
  invoiceNumber: "INV-2026-82919",
  totalMinor: 1_180_000,
};

const BITSTRING_STATUS_LIST_CONTEXT = "https://www.w3.org/ns/credentials/status/v1";

interface BitstringStatusListCredentialFixture {
  readonly "@context": readonly string[];
  readonly id: string;
  readonly type: readonly string[];
  readonly issuer: string;
  readonly validFrom: string;
  readonly credentialSubject: {
    readonly id: string;
    readonly type: string;
    readonly statusPurpose: string;
    readonly encodedList: string;
  };
}

interface BitstringStatusListEntryFixture {
  readonly id: string;
  readonly type: string;
  readonly statusPurpose: string;
  readonly statusListIndex: string;
  readonly statusListCredential: string;
}

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
    const proof = Array.isArray(issued.credential.proof) ? issued.credential.proof[0] : issued.credential.proof;
    expect(proof?.cryptosuite).toBe("ecdsa-sd-2023");
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

    const result = await verifyCredential(derived.credential);
    expect(result.cryptographicValidity).toBe("VALID");

    const tampered = {
      ...issued.credential,
      credentialSubject: { ...issued.credential.credentialSubject, totalMinor: 81_800 },
    };
    const tamperedResult = await verifyCredential(tampered);
    expect(tamperedResult.cryptographicValidity).toBe("INVALID");

    const tamperedDerived = {
      ...derived.credential,
      credentialSubject: { ...derived.credential.credentialSubject, invoiceNumber: "INV-TAMPERED" },
    };
    const tamperedDerivedResult = await verifyCredential(tamperedDerived);
    expect(tamperedDerivedResult.cryptographicValidity).toBe("INVALID");

    const missingProof = { ...issued.credential };
    delete missingProof.proof;
    const missingProofResult = await verifyCredential(missingProof);
    expect(missingProofResult.cryptographicValidity).toBe("INVALID");
  });

  it("verifies the committed ECDSA-SD-2023 base-proof fixture", async () => {
    const credential = await readJson<W3cCredential>("../../../test-vectors/w3c/ecdsa-sd-2023/credential.json");

    const result = await verifyCredential(credential);

    expect(credential.issuer).toMatch(/^did:key:/);
    expect(credential.credentialSubject).toMatchObject(credentialSubject);
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.cryptosuite).toBe("ecdsa-sd-2023");
    expect(result.issuerId).toBe(credential.issuer);
  });

  it("verifies the committed selective-disclosure fixture without the hidden claim", async () => {
    const credential = await readJson<W3cCredential>("../../../test-vectors/w3c/ecdsa-sd-2023/derived-credential.json");

    const result = await verifyCredential(credential);

    expect(credential.credentialSubject).toMatchObject({ invoiceNumber: credentialSubject.invoiceNumber });
    expect(credential.credentialSubject).not.toHaveProperty("totalMinor");
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.cryptosuite).toBe("ecdsa-sd-2023");
  });

  it("keeps the committed did:web fixture verifiable", async () => {
    const credential = await readJson<W3cCredential>("../../../test-vectors/w3c/did-web/credential.json");
    const didDocument = await readJson<Record<string, unknown> & { id: string }>("../../../test-vectors/w3c/did-web/did.json");

    const result = await verifyCredential(credential, {
      didDocuments: new Map([[didDocument.id, didDocument]]),
    });

    expect(didDocument.id).toBe("did:web:issuer.example.test");
    expect(credential.issuer).toBe("did:web:issuer.example.test");
    expect(result.cryptographicValidity).toBe("VALID");
    expect(result.issuerId).toBe("did:web:issuer.example.test");
  });

  it("creates W3C Bitstring Status List v1.0 entries", async () => {
    const statusList = await createBitstringStatusList({
      id: "https://issuer.example.test/status/1",
      purpose: "revocation",
      revokedIndexes: [7],
    });
    const status = createStatusEntry(statusList, 7);

    expect(STATUS_LIST_CONTEXT).toBe(BITSTRING_STATUS_LIST_CONTEXT);
    expect(statusList.credential["@context"]).toEqual([
      "https://www.w3.org/ns/credentials/v2",
      BITSTRING_STATUS_LIST_CONTEXT,
    ]);
    expect(statusList.credential.type).toEqual(["VerifiableCredential", "BitstringStatusListCredential"]);
    expect(statusList.credential.credentialSubject.type).toBe("BitstringStatusList");
    expect(statusList.credential.credentialSubject.statusPurpose).toBe("revocation");
    expect(status.statusListIndex).toBe("7");
    expect(status.statusListCredential).toBe(statusList.credential.id);
    expect(statusList.isSet(7)).toBe(true);
    expect(statusList.isSet(8)).toBe(false);
  });

  it("matches the committed Bitstring Status List v1.0 fixture", async () => {
    const credential = await readJson<BitstringStatusListCredentialFixture>(
      "../../../test-vectors/w3c/bitstring-status-list/status-list-credential.json",
    );
    const entry = await readJson<BitstringStatusListEntryFixture>(
      "../../../test-vectors/w3c/bitstring-status-list/status-entry.json",
    );

    // Bitstring Status List v1.0 uses the W3C status context, never the legacy
    // 2021 status-list context. Assert the exact value so this cannot regress.
    expect(credential["@context"]).toEqual([
      "https://www.w3.org/ns/credentials/v2",
      BITSTRING_STATUS_LIST_CONTEXT,
    ]);
    expect(credential.type).toEqual(["VerifiableCredential", "BitstringStatusListCredential"]);
    expect(credential.credentialSubject.type).toBe("BitstringStatusList");
    expect(credential.credentialSubject.statusPurpose).toBe("revocation");
    expect(entry.type).toBe("BitstringStatusListEntry");
    expect(entry.statusListIndex).toBe("7");
    expect(entry.statusListCredential).toBe(credential.id);
    expect(entry.id).toBe(`${credential.id}#${entry.statusListIndex}`);
  });
});

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")) as T;
}

export type { W3cCredential };

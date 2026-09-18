import { createRequire } from "node:module";
import type { Document, DocumentLoader } from "@trustvc/w3c-context";
import type { RawVerifiableCredential, SignedVerifiableCredential } from "@trustvc/w3c-vc";

const require = createRequire(import.meta.url);
const trustVcContext = require("@trustvc/w3c-context") as typeof import("@trustvc/w3c-context");
const trustVcIssuer = require("@trustvc/w3c-issuer") as typeof import("@trustvc/w3c-issuer");
const trustVcVc = require("@trustvc/w3c-vc") as typeof import("@trustvc/w3c-vc");
const { getDocumentLoader } = trustVcContext;
const { CryptoSuite, generateDidKeyPair, generateKeyPair, VerificationType } = trustVcIssuer;
const { deriveCredential, signCredential } = trustVcVc;

export interface W3cCredentialSubject {
  readonly id?: string;
  readonly [key: string]: unknown;
}

export type W3cCredential = SignedVerifiableCredential & {
  credentialSubject: W3cCredentialSubject;
  issuer: string;
};

export interface DidIdentity {
  readonly did: string;
  readonly keyPair: Parameters<typeof signCredential>[1];
  readonly didDocument?: Record<string, unknown>;
}

export interface IssueCredentialOptions {
  readonly identity: DidIdentity;
  readonly credentialSubject: W3cCredentialSubject;
  readonly mandatoryPointers?: readonly string[];
  readonly deriveFrom?: W3cCredential;
}

export interface IssuedCredential {
  readonly credential: W3cCredential;
  readonly identity: DidIdentity;
}

const CREDENTIAL_CONTEXT = "https://www.w3.org/ns/credentials/v2";
const DATA_INTEGRITY_CONTEXT = "https://w3id.org/security/data-integrity/v2";
const CREDARYN_CONTEXT = {
  "@context": {
    invoiceNumber: "https://credaryn.example/vocab#invoiceNumber",
    totalMinor: "https://credaryn.example/vocab#totalMinor",
  },
};

export async function createDidKeyIdentity(seedBase58?: string): Promise<DidIdentity> {
  const generated = await generateDidKeyPair(CryptoSuite.EcdsaSd2023, seedBase58 ? { seedBase58 } : undefined);
  return {
    did: generated.did,
    keyPair: generated.didKeyPairs,
  };
}

export async function createDidWebIdentity(domain: string, seedBase58?: string): Promise<DidIdentity> {
  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes("..")) throw new Error("did:web domain is invalid");
  const generated = await generateKeyPair({
    type: CryptoSuite.EcdsaSd2023,
    ...(seedBase58 ? { seedBase58 } : {}),
  });
  if (!generated.publicKeyMultibase || !generated.secretKeyMultibase) throw new Error("TrustVC did:web key generation returned no key material");
  const did = `did:web:${domain}`;
  const verificationMethod = `${did}#multikey-1`;
  const keyPair = {
    "@context": "https://w3id.org/security/multikey/v1",
    id: verificationMethod,
    type: VerificationType.Multikey,
    controller: did,
    publicKeyMultibase: generated.publicKeyMultibase,
    secretKeyMultibase: generated.secretKeyMultibase,
  } as Parameters<typeof signCredential>[1];
  const didDocument = {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
    id: did,
    verificationMethod: [{
      id: verificationMethod,
      type: VerificationType.Multikey,
      controller: did,
      publicKeyMultibase: generated.publicKeyMultibase,
    }],
    assertionMethod: [verificationMethod],
    authentication: [verificationMethod],
  };
  return { did, keyPair, didDocument };
}

export async function issueCredential(options: IssueCredentialOptions): Promise<IssuedCredential> {
  if (options.deriveFrom) {
    const pointers = [...(options.mandatoryPointers ?? ["/credentialSubject"])] as string[];
    const derived = await deriveCredential(options.deriveFrom, pointers);
    if (!("derived" in derived) || !derived.derived) throw new Error(`TrustVC derivation failed: ${"error" in derived ? derived.error : "unknown error"}`);
    return { credential: derived.derived as W3cCredential, identity: options.identity };
  }

  const raw: RawVerifiableCredential = {
    "@context": [CREDENTIAL_CONTEXT, DATA_INTEGRITY_CONTEXT, CREDARYN_CONTEXT],
    type: ["VerifiableCredential"],
    issuer: options.identity.did,
    validFrom: "2026-01-01T00:00:00Z",
    credentialSubject: options.credentialSubject,
  };
  const signed = await signCredential(raw, options.identity.keyPair, "ecdsa-sd-2023", {
    mandatoryPointers: [...(options.mandatoryPointers ?? [])],
  });
  if (!("signed" in signed) || !signed.signed) throw new Error(`TrustVC signing failed: ${"error" in signed ? signed.error : "unknown error"}`);
  return { credential: signed.signed as W3cCredential, identity: options.identity };
}

export async function createDocumentLoader(didDocuments: ReadonlyMap<string, Record<string, unknown>> = new Map()): Promise<DocumentLoader> {
  const fallback = await getDocumentLoader();
  return async (url) => {
    const did = url.split("#", 1)[0]!;
    const document = didDocuments.get(did);
    if (document) {
      const verificationMethod = url.includes("#")
        ? (document.verificationMethod as Array<Record<string, unknown>> | undefined)?.find((method) => method.id === url)
        : undefined;
      return {
        contextUrl: null,
        document: (verificationMethod ?? document) as unknown as Document,
        documentUrl: url.includes("#") ? url : did,
      };
    }
    return fallback(url);
  };
}

export { CREDENTIAL_CONTEXT, DATA_INTEGRITY_CONTEXT };

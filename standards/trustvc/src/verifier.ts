import type { W3cCredential } from "./issuer.js";
import { createDocumentLoader, deriveCredential } from "./issuer.js";
// These Digital Bazaar packages do not publish TypeScript declarations.
// @ts-expect-error -- untyped ESM dependency
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-expect-error -- untyped ESM dependency
import { createVerifyCryptosuite } from "@digitalbazaar/ecdsa-sd-2023-cryptosuite";
// @ts-expect-error -- untyped ESM dependency
import jsonldSignatures from "jsonld-signatures";

const { purposes: { AssertionProofPurpose } } = jsonldSignatures;

export interface W3cVerificationResult {
  readonly cryptographicValidity: "VALID" | "INVALID" | "UNVERIFIABLE";
  readonly issuerId: string;
  readonly cryptosuite?: string;
  readonly error?: string;
}

export interface VerifyCredentialOptions {
  readonly didDocuments?: ReadonlyMap<string, Record<string, unknown>>;
}

export async function verifyCredential(credential: W3cCredential, options: VerifyCredentialOptions = {}): Promise<W3cVerificationResult> {
  const proof = Array.isArray(credential.proof) ? credential.proof[0] : credential.proof;
  const issuerId = credential.issuer;
  const cryptosuite = typeof proof?.cryptosuite === "string" ? proof.cryptosuite : undefined;
  try {
    const documentLoader = await createDocumentLoader(options.didDocuments);
    const candidate = isEcdsaSdBaseProof(proof?.proofValue)
      ? await deriveCredential(credential, ["/credentialSubject"], documentLoader)
      : credential;
    const verification = await jsonldSignatures.verify(candidate, {
      suite: new DataIntegrityProof({ cryptosuite: createVerifyCryptosuite() }),
      purpose: new AssertionProofPurpose(),
      documentLoader,
    });
    const error = verification.error?.errors?.[0]?.message ?? verification.error?.message;
    return {
      cryptographicValidity: verification.verified ? "VALID" : error ? "INVALID" : "UNVERIFIABLE",
      issuerId,
      ...(cryptosuite ? { cryptosuite } : {}),
      ...(error ? { error } : {}),
    };
  } catch (error) {
    return {
      cryptographicValidity: "INVALID",
      issuerId,
      ...(cryptosuite ? { cryptosuite } : {}),
      error: error instanceof Error ? error.message : "Credential verification failed",
    };
  }
}

function isEcdsaSdBaseProof(proofValue: string | undefined): boolean {
  if (!proofValue?.startsWith("u")) return false;
  try {
    const decoded = Buffer.from(proofValue.slice(1), "base64url");
    return decoded.length >= 3 && decoded[0] === 0xd9 && decoded[1] === 0x5d && decoded[2] === 0;
  } catch {
    return false;
  }
}

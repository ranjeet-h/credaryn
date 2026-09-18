import { createRequire } from "node:module";
import type { W3cCredential } from "./issuer.js";
import { createDocumentLoader } from "./issuer.js";

const require = createRequire(import.meta.url);
const { deriveCredential, verifyCredential: trustVcVerifyCredential } = require("@trustvc/w3c-vc") as typeof import("@trustvc/w3c-vc");

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
  const documentLoader = await createDocumentLoader(options.didDocuments);
  let result = await trustVcVerifyCredential(credential, { documentLoader });
  if (!result.verified && result.error?.includes("base credentials must be derived")) {
    const derived = await deriveCredential(credential, ["/credentialSubject"], { documentLoader });
    if ("derived" in derived && derived.derived) result = await trustVcVerifyCredential(derived.derived, { documentLoader });
  }
  const proof = Array.isArray(credential.proof) ? credential.proof[0] : credential.proof;
  const issuerId = credential.issuer;
  return {
    cryptographicValidity: result.verified ? "VALID" : result.error ? "INVALID" : "UNVERIFIABLE",
    issuerId,
    ...(typeof proof?.cryptosuite === "string" ? { cryptosuite: proof.cryptosuite } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

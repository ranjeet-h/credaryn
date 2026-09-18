import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDidWebIdentity, issueCredential, type W3cCredential } from "@credaryn/standards-trustvc";
import { verifyCredential } from "@credaryn/standards-trustvc/verifier";

const outputUrl = new URL("../../../artifacts/w3c-vc/", import.meta.url);
const credentialUrl = new URL("credential.json", outputUrl);
const didDocumentUrl = new URL("did.json", outputUrl);

async function issue(): Promise<void> {
  const identity = await createDidWebIdentity("issuer.example.test");
  const issued = await issueCredential({
    identity,
    credentialSubject: { invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
    mandatoryPointers: ["/credentialSubject/invoiceNumber", "/credentialSubject/totalMinor"],
  });
  await mkdir(fileURLToPath(outputUrl), { recursive: true });
  await Promise.all([
    writeFile(credentialUrl, `${JSON.stringify(issued.credential, null, 2)}\n`, "utf8"),
    writeFile(didDocumentUrl, `${JSON.stringify(identity.didDocument, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify({ credential: fileURLToPath(credentialUrl), did: identity.did }, null, 2));
}

async function verify(): Promise<void> {
  const credential = JSON.parse(await readFile(credentialUrl, "utf8")) as W3cCredential;
  const didDocument = JSON.parse(await readFile(didDocumentUrl, "utf8")) as Record<string, unknown>;
  const result = await verifyCredential(credential, { didDocuments: new Map([[String(credential.issuer), didDocument]]) });
  console.log(JSON.stringify(result, null, 2));
  if (result.cryptographicValidity !== "VALID") process.exitCode = 1;
}

if (process.argv[2] === "issue") await issue();
else if (process.argv[2] === "verify") await verify();
else throw new Error("Usage: cli.ts <issue|verify> [--trust <path>]");

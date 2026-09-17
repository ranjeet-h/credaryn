import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LocalSigner } from "@credaryn/provider-local";
import { encodePaperSeal, renderPaperSealQr } from "../src/index.js";

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const artifactDirectory = resolve(repositoryRoot, "artifacts/paper");
const trustPath = resolve(repositoryRoot, "providers/local/demo-trust-store.json");
const descriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
};
const signer = new LocalSigner({ issuerId: descriptor.issuerId, keyId: "demo-local-key" });
const keyInfo = await signer.getKeyInfo();
const encoded = await encodePaperSeal(descriptor, signer);
const qr = await renderPaperSealQr(encoded.transport, { width: 512 });

await mkdir(artifactDirectory, { recursive: true });
await writeFile(resolve(artifactDirectory, "invoice-11800.png"), qr);
await writeFile(resolve(artifactDirectory, "invoice-11800.crd1"), `${encoded.transport}\n`);
await writeFile(trustPath, `${JSON.stringify({
  trustSource: "local-demo-trust-store",
  developmentOnly: true,
  keys: [{
    issuerId: keyInfo.issuerId,
    keyId: keyInfo.keyId,
    algorithm: keyInfo.algorithm,
    publicKey: Buffer.from(keyInfo.publicKey).toString("base64"),
  }],
}, null, 2)}\n`);

console.log(JSON.stringify({
  qrPath: resolve(artifactDirectory, "invoice-11800.png"),
  payloadPath: resolve(artifactDirectory, "invoice-11800.crd1"),
  trustPath,
  transportCharacters: encoded.transport.length,
}, null, 2));

import { createSign, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenPath = /(^|\/)(?:\.env$|\.env\.(?!example$)|.*\.(?:pem|key|p12|pfx)|deploy\/secrets(?:\/|$))/i;
const forbiddenFiles = trackedFiles.filter((file) => forbiddenPath.test(file));
if (forbiddenFiles.length > 0) throw new Error(`release contains credential-shaped files: ${forbiddenFiles.join(", ")}`);
if (trackedFiles.some((file) => file.startsWith(".github/workflows/"))) throw new Error("GitHub Actions workflows are not part of the local release process");

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const manifest = {
  format: "credaryn-release-candidate",
  version: 1,
  gitCommit: head,
  node: process.version,
  packageManager: "pnpm@12.3.3",
  trackedFileCount: trackedFiles.length,
  generatedAt: new Date().toISOString(),
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const signer = createSign("SHA256");
signer.update(manifestBytes);
const signature = signer.sign(privateKey).toString("base64");

await mkdir(resolve("artifacts/release-candidate"), { recursive: true });
await writeFile(resolve("artifacts/release-candidate/manifest.json"), manifestBytes);
await writeFile(resolve("artifacts/release-candidate/manifest.sig.base64"), `${signature}\n`, "utf8");
await writeFile(resolve("artifacts/release-candidate/signer-public-key.pem"), publicKey.export({ type: "spki", format: "pem" }));
console.log(JSON.stringify({ output: "artifacts/release-candidate", signed: true, privateKeyPersisted: false }, null, 2));

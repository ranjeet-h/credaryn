import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { decodePaperSealQr, verifyPaperSeal } from "../src/index.js";
import type { SignerKeyInfo, TrustStore } from "@credaryn/core";

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const args = process.argv.slice(2).filter((argument) => argument !== "--");
const inputPath = args[0];
const trustPath = args[1] === "--trust" ? args[2] : undefined;
if (inputPath === undefined) throw new Error("Usage: demo:verify -- <payload.crd1|image.png> [--trust path]");

const resolvedInputPath = resolve(repositoryRoot, inputPath);
const input = await readFile(resolvedInputPath);
const transport = inputPath.toLowerCase().endsWith(".png") ? decodePaperSealQr(input) : new TextDecoder().decode(input).trim();
const trustStore = await loadTrustStore(trustPath);
const result = await verifyPaperSeal(transport, { trustStore });
console.log(JSON.stringify({ input: basename(inputPath), ...result }, null, 2));

async function loadTrustStore(path: string | undefined): Promise<TrustStore> {
  if (path === undefined) return { resolve: async () => undefined, trustSource: "no-trust-material" };
  const target = resolve(repositoryRoot, path);
  const targetStat = await stat(target);
  const files = targetStat.isDirectory()
    ? (await readdir(target)).filter((file) => file.endsWith(".json")).map((file) => resolve(target, file))
    : [target];
  const keys: SignerKeyInfo[] = [];
  let trustSource = targetStat.isDirectory() ? "empty-or-directory-trust-store" : target;
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as {
      trustSource?: string;
      keys?: Array<{ issuerId: string; keyId: string; algorithm: "ES256"; publicKey: string }>;
    };
    if (parsed.trustSource !== undefined) trustSource = parsed.trustSource;
    for (const key of parsed.keys ?? []) {
      keys.push({
        issuerId: key.issuerId,
        keyId: key.keyId,
        algorithm: key.algorithm,
        publicKey: new Uint8Array(Buffer.from(key.publicKey, "base64")),
      });
    }
  }
  return {
    trustSource,
    resolve: async (keyId, issuerId) => keys.find((key) => key.keyId === keyId && key.issuerId === issuerId),
    isTrusted: (keyInfo) => keys.some((key) => key.keyId === keyInfo.keyId
      && key.issuerId === keyInfo.issuerId
      && key.publicKey.length === keyInfo.publicKey.length
      && key.publicKey.every((byte, index) => byte === keyInfo.publicKey[index])),
  };
}

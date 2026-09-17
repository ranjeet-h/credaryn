import { spawnSync } from "node:child_process";

const provider = argumentValue("--provider");
const mock = process.argv.includes("--mock");
const testDirectory = {
  "aws-kms": "providers/aws-kms/test",
  "gcp-kms": "providers/gcp-kms/test",
  "azure-key-vault": "providers/azure-key-vault/test",
  pkcs11: "providers/pkcs11/test",
}[provider ?? ""];

if (testDirectory === undefined) {
  throw new Error("Usage: pnpm provider:smoke --provider <aws-kms|gcp-kms|azure-key-vault|pkcs11> --mock");
}
if (!mock) {
  throw new Error("Provider smoke checks require --mock; real credentials are never loaded by this repository script");
}

const result = spawnSync("pnpm", ["vitest", testDirectory, "--run"], {
  stdio: "inherit",
  env: { ...process.env, CREDARYN_PROVIDER_MOCK: "1" },
});

if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Provider smoke passed: ${provider} (injected mock client)`);

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

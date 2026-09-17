import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LocalSigner } from "@credaryn/provider-local";
import { CliInputError } from "./context.js";
import { optionalOption, positionalArguments } from "./io.js";

export async function runDevCaInit(args: readonly string[]): Promise<unknown> {
  const positionals = positionalArguments(args, ["--out"]);
  if (positionals.length !== 0) throw new CliInputError("ARGUMENT_ERROR", "Usage: credaryn dev-ca init [--out trust-store.json]");
  const outputPath = resolve(optionalOption(args, "--out") ?? ".credaryn/dev-trust-store.json");
  const signer = new LocalSigner({ issuerId: "local-development", keyId: `dev-${randomUUID()}` });
  const keyInfo = await signer.getKeyInfo();
  const trustBundle = {
    trustSource: "local-development-only",
    developmentOnly: true,
    keys: [{
      issuerId: keyInfo.issuerId,
      keyId: keyInfo.keyId,
      algorithm: keyInfo.algorithm,
      publicKey: Buffer.from(keyInfo.publicKey).toString("base64"),
    }],
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(trustBundle, null, 2)}\n`, "utf8");
  return {
    status: "initialized",
    output: outputPath,
    trustSource: trustBundle.trustSource,
    developmentOnly: trustBundle.developmentOnly,
    key: { issuerId: keyInfo.issuerId, keyId: keyInfo.keyId, algorithm: keyInfo.algorithm },
  };
}

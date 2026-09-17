import { fileURLToPath } from "node:url";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { Credaryn } from "@credaryn/node";
import { LocalSigner } from "@credaryn/provider-local";
import { VerificationInputError, createVerifier } from "@credaryn/verifier";
import type { TrustStore } from "@credaryn/core";
import { runDevCaInit } from "./commands/dev-ca.js";
import { CliInputError, type CliDependencies } from "./commands/context.js";
import { runKeyInspect } from "./commands/key-inspect.js";
import { runSealPdf } from "./commands/seal-pdf.js";
import { runPaperInspect, runVerify } from "./commands/verify.js";

export type { CliDependencies } from "./commands/context.js";

export interface CliResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

export async function runCli(args: readonly string[], dependencies?: CliDependencies): Promise<CliResult> {
  try {
    const context = dependencies ?? await createDefaultDependencies();
    const value = await dispatch(args, context);
    return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: "" };
  } catch (error) {
    const isInputError = error instanceof CliInputError || error instanceof VerificationInputError;
    const code = isInputError ? error.code : "COMMAND_ERROR";
    const message = error instanceof Error ? error.message : "Command failed";
    return {
      exitCode: isInputError ? 2 : 1,
      stdout: `${JSON.stringify({ error: { code, message } }, null, 2)}\n`,
      stderr: "",
    };
  }
}

async function dispatch(args: readonly string[], dependencies: CliDependencies): Promise<unknown> {
  const [command, subcommand, ...rest] = args;
  if (command === "seal" && subcommand === "pdf") return runSealPdf(rest, dependencies);
  if (command === "verify") return runVerify([subcommand, ...rest].filter((value): value is string => value !== undefined), dependencies);
  if (command === "paper" && subcommand === "inspect") return runPaperInspect(rest, dependencies);
  if (command === "key" && subcommand === "inspect") return runKeyInspect(rest);
  if (command === "dev-ca" && subcommand === "init") return runDevCaInit(rest);
  throw new CliInputError("ARGUMENT_ERROR", "Unknown command. Run credaryn with a documented command.");
}

async function createDefaultDependencies(trustStore?: TrustStore): Promise<CliDependencies> {
  const resolvedTrustStore = trustStore ?? { resolve: async () => undefined, trustSource: "no-trust-material" } satisfies TrustStore;
  const endpoint = process.env.DSS_URL ?? "http://127.0.0.1:8080";
  const pdfEngine = new DssPdfSignatureEngine({ endpoint });
  const paperSigner = new LocalSigner({ issuerId: "local-development", keyId: "cli-ephemeral-key" });
  const sdk = new Credaryn({ pdfEngine, paperSigner, trustStore: resolvedTrustStore });
  const verifier = createVerifier({ pdfEngine, paperSigner, trustStore: resolvedTrustStore });
  return {
    sdk,
    verifier,
    withTrustStore: async (nextTrustStore) => (await createDefaultDependencies(nextTrustStore)).verifier,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

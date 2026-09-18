import { assertValidDescriptor, type DocumentDescriptor } from "@credaryn/core";
import { MAX_PDF_BYTES } from "@credaryn/pdf";
import {
  MAX_PAPER_IMAGE_BYTES,
  MAX_PAPER_TEXT_BYTES,
  TrustStoreLoadError,
  loadTrustStore,
  type Verifier,
} from "@credaryn/verifier";
import { CliInputError, type CliDependencies } from "./context.js";
import { optionalOption, parseJson, positionalArguments, readBoundedFile } from "./io.js";

const MAX_DESCRIPTOR_BYTES = 1 * 1024 * 1024;

export async function runVerify(args: readonly string[], dependencies: CliDependencies): Promise<unknown> {
  const positionals = positionalArguments(args, ["--trust", "--descriptor"]);
  if (positionals.length !== 1) throw new CliInputError("ARGUMENT_ERROR", "Usage: credaryn verify input --trust ./trust [--descriptor descriptor.json]");
  const inputPath = positionals[0]!;
  const trustPath = optionalOption(args, "--trust");
  const descriptorPath = optionalOption(args, "--descriptor");
  const verifier = await verifierForTrustPath(dependencies, trustPath);
  const expectedDescriptor = descriptorPath === undefined ? undefined : await readDescriptor(descriptorPath);
  const input = await readVerificationFile(inputPath);
  return verifier.verifyInput({ bytes: input, ...(expectedDescriptor === undefined ? {} : { expectedDescriptor }) });
}

export async function runPaperInspect(args: readonly string[], dependencies: CliDependencies): Promise<unknown> {
  const positionals = positionalArguments(args, ["--trust", "--descriptor"]);
  if (positionals.length !== 1) throw new CliInputError("ARGUMENT_ERROR", "Usage: credaryn paper inspect payload-or-image --trust ./trust [--descriptor descriptor.json]");
  const inputPath = positionals[0]!;
  const trustPath = optionalOption(args, "--trust");
  const descriptorPath = optionalOption(args, "--descriptor");
  const verifier = await verifierForTrustPath(dependencies, trustPath);
  const expectedDescriptor = descriptorPath === undefined ? undefined : await readDescriptor(descriptorPath);
  const input = inputPath.startsWith("CRD1:")
    ? new TextEncoder().encode(inputPath)
    : await readVerificationFile(inputPath);
  return verifier.verifyInput({ bytes: input, ...(expectedDescriptor === undefined ? {} : { expectedDescriptor }) });
}

async function verifierForTrustPath(dependencies: CliDependencies, trustPath: string | undefined): Promise<Verifier> {
  if (trustPath === undefined || dependencies.withTrustStore === undefined) return dependencies.verifier;
  try {
    return dependencies.withTrustStore(await loadTrustStore(trustPath));
  } catch (error) {
    if (error instanceof TrustStoreLoadError) throw new CliInputError("INPUT_ERROR", error.message);
    throw error;
  }
}

async function readDescriptor(path: string): Promise<DocumentDescriptor> {
  const parsed = parseJson(await readBoundedFile(path, MAX_DESCRIPTOR_BYTES, "Descriptor"), "Descriptor");
  try {
    return assertValidDescriptor(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Descriptor is invalid";
    throw new CliInputError("INPUT_ERROR", message);
  }
}

async function readVerificationFile(path: string): Promise<Uint8Array> {
  const lower = path.toLowerCase();
  const maximum = lower.endsWith(".png") ? MAX_PAPER_IMAGE_BYTES : lower.endsWith(".crd1") || lower.endsWith(".txt") ? MAX_PAPER_TEXT_BYTES : MAX_PDF_BYTES;
  return readBoundedFile(path, maximum, "Verification input");
}

import { assertValidDescriptor } from "@credaryn/core";
import { MAX_PDF_BYTES } from "@credaryn/pdf";
import { CliInputError, type CliDependencies } from "./context.js";
import { parseJson, positionalArguments, readBoundedFile, requiredOption } from "./io.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function runSealPdf(args: readonly string[], dependencies: CliDependencies): Promise<unknown> {
  const positionals = positionalArguments(args, ["--descriptor", "--out"]);
  if (positionals.length !== 1) throw new CliInputError("ARGUMENT_ERROR", "Usage: credaryn seal pdf input.pdf --descriptor descriptor.json --out sealed.pdf");
  const inputPath = positionals[0]!;
  const descriptorPath = requiredOption(args, "--descriptor");
  const outputPath = requiredOption(args, "--out");
  const pdfBytes = await readBoundedFile(inputPath, MAX_PDF_BYTES, "PDF input");
  const descriptor = assertValidDescriptor(parseJson(
    await readBoundedFile(descriptorPath, 1 * 1024 * 1024, "Descriptor"),
    "Descriptor",
  ));
  const sealedPdf = await dependencies.sdk.sealPdf(pdfBytes, descriptor);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, sealedPdf);
  return { status: "sealed", input: inputPath, output: outputPath, bytes: sealedPdf.byteLength };
}

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const validator = process.argv[process.argv.indexOf("--validator") + 1];
if (validator !== "dss" && validator !== "independent") {
  throw new Error("Usage: pades:validate --validator dss|independent");
}

if (validator === "dss") {
  const result = spawnSync("pnpm", ["--filter", "@credaryn/example-invoice-puppeteer", "verify:fixtures"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const probe = spawnSync("pdfsig", ["-h"], { stdio: "ignore" });
  if (probe.error || probe.status === null) {
    console.error("Independent PAdES validation is not available: install Poppler pdfsig and rerun this gate.");
    process.exitCode = 2;
  } else {
    const original = runPdfSig("test-vectors/pdf/invoice-11800.pdf");
    const mutated = runPdfSig("test-vectors/pdf/invoice-11800-mutated.pdf");
    if (original.status !== 0 || !/Signature Validation: Signature is Valid\./.test(original.output)) {
      throw new Error(`Independent validator rejected the original fixture:\n${original.output}`);
    }
    if (mutated.status === 0 || !/Digest Mismatch|Signature is Invalid\./.test(mutated.output)) {
      throw new Error(`Independent validator accepted the mutated fixture:\n${mutated.output}`);
    }
    console.log(JSON.stringify({
      validator: "Poppler pdfsig",
      original: "VALID",
      mutated: "INVALID",
      originalFixture: resolve("test-vectors/pdf/invoice-11800.pdf"),
      mutatedFixture: resolve("test-vectors/pdf/invoice-11800-mutated.pdf"),
    }, null, 2));
  }
}

function runPdfSig(relativePath: string): { status: number | null; output: string } {
  const result = spawnSync("pdfsig", [resolve(relativePath)], { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

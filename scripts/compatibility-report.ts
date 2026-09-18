import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CompatibilityInput {
  nodeVersion: string;
  packageManager: string;
  generators: readonly string[];
}

export interface CompatibilityReport {
  generatedAt: string;
  node: { runtime: string; minimumMajor: 24; supported: boolean };
  packageManager: string;
  generators: readonly string[];
  browserVerification: "manual-only";
}

export function buildCompatibilityReport(input: CompatibilityInput): CompatibilityReport {
  const major = Number(input.nodeVersion.replace(/^v/, "").split(".", 1)[0]);
  return {
    generatedAt: new Date().toISOString(),
    node: { runtime: input.nodeVersion, minimumMajor: 24, supported: Number.isInteger(major) && major >= 24 },
    packageManager: input.packageManager,
    generators: [...input.generators],
    browserVerification: "manual-only",
  };
}

export async function writeCompatibilityReport(outputPath = resolve("artifacts/compatibility/node-browsers-generators.json")): Promise<CompatibilityReport> {
  const rootPackage = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { packageManager?: string };
  const report = buildCompatibilityReport({
    nodeVersion: process.version,
    packageManager: rootPackage.packageManager ?? "unknown",
    generators: ["Puppeteer", "PDFKit", "Playwright"],
  });
  if (!report.node.supported) throw new Error(`Node ${report.node.runtime} is below the supported Node 24 floor`);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1]?.endsWith("/scripts/compatibility-report.ts")) {
  console.log(JSON.stringify(await writeCompatibilityReport(), null, 2));
}

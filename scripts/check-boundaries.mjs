import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbiddenCoreImport = /\b(?:from|import)\s+["'][^"']*(?:dss|java|puppeteer|trustvc|aws-sdk|google-cloud|azure|ocr|postgres)[^"']*["']/i;
const forbiddenBrowserGlobal = /\bwindow\./i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

const coreFiles = await walk("packages/core/src");
const violations = [];
for (const file of coreFiles) {
  const source = await readFile(file, "utf8");
  if (forbiddenCoreImport.test(source) || forbiddenBrowserGlobal.test(source)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error(`Core boundary violation in: ${violations.join(", ")}`);
  process.exit(1);
}

console.log(`Core boundary check passed for ${coreFiles.length} TypeScript file(s).`);

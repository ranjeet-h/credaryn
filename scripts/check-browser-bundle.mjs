import { readFile } from "node:fs/promises";

const files = [
  "packages/web/src/prepare-print.ts",
  "packages/web/src/seal-element.ts",
  "packages/web/src/print-css.ts",
  "examples/browser-print/src/public/client.ts",
];
const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
const forbidden = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /privateKey|private-key|SignerProvider|LocalSigner|createSign|createPrivateKey/i,
  /@credaryn\/(node|paper|provider-local)/,
  /window\.print\s*=/,
];
const violations = forbidden.filter((pattern) => pattern.test(source)).map(String);

if (violations.length > 0) {
  console.error(`Browser bundle inspection failed: ${violations.join(", ")}`);
  process.exit(1);
}

console.log(`Browser bundle inspection passed for ${files.length} source file(s).`);

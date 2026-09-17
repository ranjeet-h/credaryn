import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const documentationFiles = [
  "README.md",
  "docs/getting-started.md",
  "docs/demo/invoice-tamper-demo.md",
  "docs/security/claims-vs-artifact.md",
  "docs/verification/milestone-5-demo-script.md",
] as const;

describe("launch demo documentation", () => {
  it("documents commands and expected verdict labels", async () => {
    const contents = await Promise.all(documentationFiles.map((path) => readFile(path, "utf8")));
    const combined = contents.join("\n");

    expect(combined).toContain("pnpm demo:start");
    expect(combined).toContain("pnpm demo:build");
    expect(combined).toContain("INR 11,800");
    expect(combined).toContain("INR 81,800");
    expect(combined).toContain("VALID_TRUSTED");
    expect(combined).toContain("INVALID");
    expect(combined).toContain("PAPER_CLAIMS_ONLY");
  });

  it("rejects overclaims about document security", async () => {
    const contents = await Promise.all(documentationFiles.map((path) => readFile(path, "utf8")));
    const prohibited = /\b(?:uneditable|unhackable|AI-proof)\b|qualified electronic signature(?! status)/i;

    for (const [index, content] of contents.entries()) {
      expect(content, documentationFiles[index]).not.toMatch(prohibited);
    }
  });
});

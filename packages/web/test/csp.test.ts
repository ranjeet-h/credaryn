import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("browser print security boundary", () => {
  it("contains no dynamic code execution or signing-key imports", async () => {
    const source = await readFile(new URL("../src/prepare-print.ts", import.meta.url), "utf8");
    const example = await readFile(new URL("../../../examples/browser-print/src/public/client.ts", import.meta.url), "utf8").catch(() => "");
    const combined = `${source}\n${example}`;

    expect(combined).not.toMatch(/\beval\s*\(|new\s+Function\s*\(/);
    expect(combined).not.toMatch(/privateKey|private-key|SignerProvider|LocalSigner|createSign|createPrivateKey/i);
    expect(combined).not.toContain("window.print =");
  });
});

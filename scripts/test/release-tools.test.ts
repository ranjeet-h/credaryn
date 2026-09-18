import { describe, expect, it } from "vitest";
import { buildCompatibilityReport } from "../compatibility-report.js";
import { fuzzTargets, parseTimeLimit } from "../fuzz.js";
import { mutationTargets } from "../mutation.js";
import { createCycloneDxBom } from "../sbom.js";

describe("Release tools", () => {
  it("parses bounded fuzz time limits and keeps parser targets explicit", () => {
    expect(parseTimeLimit(["--time-limit=12"])).toBe(12);
    expect(parseTimeLimit(["--time-limit", "7"])).toBe(7);
    expect(parseTimeLimit([])).toBe(120);
    expect(fuzzTargets()).toEqual([
      "packages/paper/test/fuzz",
      "packages/verifier/test/fuzz",
    ]);
  });

  it("keeps mutation targets limited to security-boundary fixtures", () => {
    expect(mutationTargets(false)).toEqual([
      "packages/paper/test/mutation",
      "packages/pdf/test/mutation",
      "examples/invoice-puppeteer/test/invoice-flow.test.ts",
    ]);
    expect(mutationTargets(true)).toEqual(["packages/paper/test/mutation", "packages/pdf/test/mutation"]);
  });

  it("creates a CycloneDX component list without workspace link paths", () => {
    const bom = createCycloneDxBom([
      {
        name: "credaryn",
        version: "0.0.0",
        path: "/repo",
        dependencies: {
          "@credaryn/core": { from: "@credaryn/core", version: "link:../core", path: "/repo/core" },
          "cbor-x": { from: "cbor-x", version: "1.6.6", path: "/repo/node_modules/cbor-x" },
        },
      },
    ]);

    expect(bom.bomFormat).toBe("CycloneDX");
    expect(bom.components).toEqual([{ type: "library", name: "cbor-x", version: "1.6.6", purl: "pkg:npm/cbor-x@1.6.6" }]);
  });

  it("reports compatibility from the locked runtime and declared adapters", () => {
    const report = buildCompatibilityReport({
      nodeVersion: "v24.13.1",
      packageManager: "pnpm@12.3.3",
      generators: ["Puppeteer", "PDFKit", "Playwright"],
    });

    expect(report.node.minimumMajor).toBe(24);
    expect(report.packageManager).toBe("pnpm@12.3.3");
    expect(report.generators).toHaveLength(3);
  });
});

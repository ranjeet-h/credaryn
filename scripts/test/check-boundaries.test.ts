import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const checkerSource = fileURLToPath(new URL("../check-boundaries.mjs", import.meta.url));
const created: string[] = [];

async function fixtureTree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "credaryn-boundaries-"));
  created.push(root);
  await copyFile(checkerSource, join(root, "check-boundaries.mjs"));
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  return root;
}

function runChecker(root: string): { status: number | null; output: string } {
  const result = spawnSync("node", ["check-boundaries.mjs"], { cwd: root, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace trust-boundary check", () => {
  it("rejects a DSS import and a browser global in an inner package", async () => {
    const root = await fixtureTree({
      "packages/core/src/bad.ts": 'import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";\nwindow.print();\n',
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(1);
    expect(output).toContain("DSS/Java adapter");
    expect(output).toContain("browser global");
  });

  it("allows composition roots and web packages to use their boundaries", async () => {
    const root = await fixtureTree({
      "cli/credaryn/src/main.ts": 'import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";\n',
      "apps/verifier-web/src/server.ts": 'import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";\nwindow.location;\n',
      "standards/trustvc/src/issuer.ts": 'import { DataIntegrityProof } from "@trustvc/w3c-context";\n',
      "services/status/src/db.ts": 'import pg from "pg";\n',
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(0);
    expect(output).toContain("Trust-boundary check passed");
  });

  it("rejects a PostgreSQL client and TrustVC outside their owning layer", async () => {
    const root = await fixtureTree({
      "packages/core/src/db.ts": 'import pg from "pg";\n',
      "packages/verifier/src/vc.ts": 'import { verify } from "@trustvc/w3c-verifier";\n',
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(1);
    expect(output).toContain("PostgreSQL client");
    expect(output).toContain("TrustVC");
  });
});

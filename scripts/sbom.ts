import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface PnpmDependency {
  from: string;
  version: string;
  path: string;
  dependencies?: Record<string, PnpmDependency>;
}

export interface PnpmPackage {
  name: string;
  version: string;
  path: string;
  dependencies?: Record<string, PnpmDependency>;
}

export interface CycloneDxComponent {
  type: "library";
  name: string;
  version: string;
  purl: string;
}

export interface CycloneDxBom {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  version: 1;
  components: CycloneDxComponent[];
}

export function createCycloneDxBom(packages: readonly PnpmPackage[]): CycloneDxBom {
  const components = new Map<string, CycloneDxComponent>();
  const visit = (dependencies: Record<string, PnpmDependency> | undefined): void => {
    for (const dependency of Object.values(dependencies ?? {})) {
      if (!dependency.version.startsWith("link:")) {
        const key = `${dependency.from}@${dependency.version}`;
        components.set(key, {
          type: "library",
          name: dependency.from,
          version: dependency.version,
          purl: `pkg:npm/${dependency.from}@${dependency.version}`,
        });
      }
      visit(dependency.dependencies);
    }
  };
  for (const packageEntry of packages) visit(packageEntry.dependencies);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    components: [...components.values()].sort((left, right) => left.purl.localeCompare(right.purl)),
  };
}

export async function writeSbom(outputPath = resolve("artifacts/sbom/cyclonedx.json")): Promise<CycloneDxBom> {
  const raw = execFileSync("pnpm", ["list", "--json", "--recursive", "--depth", "Infinity", "--prod"], { encoding: "utf8" });
  const bom = createCycloneDxBom(JSON.parse(raw) as PnpmPackage[]);
  if (bom.components.length === 0) throw new Error("SBOM contains no external components");
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`, "utf8");
  return bom;
}

if (process.argv[1]?.endsWith("/scripts/sbom.ts")) {
  const bom = await writeSbom();
  console.log(JSON.stringify({ output: "artifacts/sbom/cyclonedx.json", components: bom.components.length }, null, 2));
}

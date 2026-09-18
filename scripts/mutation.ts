import { spawnSync } from "node:child_process";

export function mutationTargets(changedOnly: boolean): readonly string[] {
  if (changedOnly) return ["packages/paper/test/mutation", "packages/pdf/test/mutation"];
  return [
    "packages/paper/test/mutation",
    "packages/pdf/test/mutation",
    "examples/invoice-puppeteer/test/invoice-flow.test.ts",
  ];
}

export function runMutation(args: readonly string[] = process.argv.slice(2)): number {
  const changedOnly = args.includes("--changed-only");
  const result = spawnSync("pnpm", ["exec", "vitest", "run", ...mutationTargets(changedOnly), "--run"], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1]?.endsWith("/scripts/mutation.ts")) process.exitCode = runMutation();

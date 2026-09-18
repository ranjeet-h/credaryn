import { spawn } from "node:child_process";

const DEFAULT_TIME_LIMIT_SECONDS = 120;

export function fuzzTargets(): readonly string[] {
  return ["packages/paper/test/fuzz", "packages/verifier/test/fuzz"];
}

export function parseTimeLimit(args: readonly string[]): number {
  const inline = args.find((argument) => argument.startsWith("--time-limit="));
  const separateIndex = args.indexOf("--time-limit");
  const raw = inline?.slice("--time-limit=".length) ?? (separateIndex >= 0 ? args[separateIndex + 1] : undefined);
  if (raw === undefined) return DEFAULT_TIME_LIMIT_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3_600) {
    throw new Error("--time-limit must be an integer from 1 to 3600 seconds");
  }
  return seconds;
}

export async function runFuzz(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const timeLimit = parseTimeLimit(args);
  return runChild(["exec", "vitest", "run", ...fuzzTargets(), "--run"], timeLimit);
}

async function runChild(argumentsToRun: readonly string[], timeLimitSeconds: number): Promise<number> {
  const child = spawn("pnpm", argumentsToRun, { stdio: "inherit" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeLimitSeconds * 1_000);

  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) resolve(124);
      else if (code !== null) resolve(code);
      else resolve(signal === "SIGTERM" ? 143 : 1);
    });
  });
}

if (process.argv[1]?.endsWith("/scripts/fuzz.ts")) process.exitCode = await runFuzz();

import { readFile, stat } from "node:fs/promises";
import { CliInputError } from "./context.js";

export async function readBoundedFile(path: string, maximumBytes: number, label: string): Promise<Uint8Array> {
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(path);
  } catch {
    throw new CliInputError("INPUT_ERROR", `${label} could not be read: ${path}`);
  }
  if (!fileStat.isFile()) throw new CliInputError("INPUT_ERROR", `${label} must be a file: ${path}`);
  if (fileStat.size > maximumBytes) {
    throw new CliInputError("INPUT_TOO_LARGE", `${label} exceeds the maximum size of ${formatBytes(maximumBytes)}`);
  }
  try {
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.byteLength > maximumBytes) {
      throw new CliInputError("INPUT_TOO_LARGE", `${label} exceeds the maximum size of ${formatBytes(maximumBytes)}`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    throw new CliInputError("INPUT_ERROR", `${label} could not be read: ${path}`);
  }
}

export function requiredOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || args[index + 1] === undefined || args[index + 1]!.startsWith("--")) {
    throw new CliInputError("ARGUMENT_ERROR", `${name} requires a value`);
  }
  return args[index + 1]!;
}

export function optionalOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (args[index + 1] === undefined || args[index + 1]!.startsWith("--")) {
    throw new CliInputError("ARGUMENT_ERROR", `${name} requires a value`);
  }
  return args[index + 1];
}

export function positionalArguments(args: readonly string[], options: readonly string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (options.includes(argument)) {
      index += 1;
      if (args[index] === undefined || args[index]!.startsWith("--")) {
        throw new CliInputError("ARGUMENT_ERROR", `${argument} requires a value`);
      }
      continue;
    }
    if (argument.startsWith("--")) throw new CliInputError("ARGUMENT_ERROR", `Unknown option: ${argument}`);
    positionals.push(argument);
  }
  return positionals;
}

export function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new CliInputError("INPUT_ERROR", `${label} must contain valid UTF-8 JSON`);
  }
}

function formatBytes(bytes: number): string {
  return bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MiB` : `${bytes / 1024} KiB`;
}

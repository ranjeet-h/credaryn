import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encodePaperSeal, verifyPaperSeal } from "../packages/paper/src/index.js";
import type { DocumentDescriptor } from "../packages/core/src/document.js";
import { LocalSigner } from "../providers/local/src/local-signer.js";

const descriptor: DocumentDescriptor = {
  issuerId: "benchmark-issuer",
  documentId: "benchmark-document",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "BENCH-1", totalMinor: 1_180_000 },
};

export interface BenchmarkReport {
  node: string;
  iterations: number;
  encodeSeal: { medianMs: number; p95Ms: number };
  verifySeal: { medianMs: number; p95Ms: number };
}

export async function runBenchmark(iterations = 50): Promise<BenchmarkReport> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw new Error("benchmark iterations must be an integer from 1 to 10000");
  }
  const signer = new LocalSigner({ issuerId: descriptor.issuerId, keyId: "benchmark-key" });
  const keyInfo = await signer.getKeyInfo();
  const trustStore = { resolve: async () => keyInfo };
  const encodeSamples: number[] = [];
  const verifySamples: number[] = [];
  let transport = "";

  for (let index = 0; index < iterations; index += 1) {
    const encodeStart = performance.now();
    const seal = await encodePaperSeal(descriptor, signer);
    encodeSamples.push(performance.now() - encodeStart);
    transport = seal.transport;

    const verifyStart = performance.now();
    const verification = await verifyPaperSeal(transport, { trustStore });
    verifySamples.push(performance.now() - verifyStart);
    if (verification.cryptographicValidity !== "VALID") throw new Error("benchmark verification was not valid");
  }

  return {
    node: process.version,
    iterations,
    encodeSeal: summary(encodeSamples),
    verifySeal: summary(verifySamples),
  };
}

function summary(samples: readonly number[]): { medianMs: number; p95Ms: number } {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    medianMs: round(sorted[Math.floor(sorted.length * 0.5)]!),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!),
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

if (process.argv[1]?.endsWith("/scripts/benchmark.ts")) {
  const iterations = Number(process.env.CREDARYN_BENCHMARK_ITERATIONS ?? "50");
  const report = await runBenchmark(iterations);
  await mkdir(resolve("artifacts/benchmarks"), { recursive: true });
  await writeFile(resolve("artifacts/benchmarks/v1.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

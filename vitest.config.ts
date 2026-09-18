import { defineConfig } from "vitest/config";

// Coverage gate for the trusted packages (M-002 C2).
//
// The spec target is >=90% lines for core/paper/verifier, so each package's
// `lines` threshold is pinned at 90: the gate fails if line coverage regresses
// below the target. The measured values after the coverage pass are core
// ~99.2%, paper ~96.6% and verifier ~99.1% lines. statements/functions/branches
// are floored just below the measured values so that a real regression in any
// metric also fails the gate rather than only reporting information.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: false,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts", "packages/paper/src/**/*.ts", "packages/verifier/src/**/*.ts"],
      exclude: ["**/*.d.ts"],
      thresholds: {
        "packages/core/src/**/*.ts": { lines: 90, statements: 95, functions: 96, branches: 92 },
        "packages/paper/src/**/*.ts": { lines: 90, statements: 91, functions: 94, branches: 87 },
        "packages/verifier/src/**/*.ts": { lines: 90, statements: 97, functions: 99, branches: 95 },
      },
    },
  },
});

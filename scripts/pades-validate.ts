import { spawnSync } from "node:child_process";

const validator = process.argv[process.argv.indexOf("--validator") + 1];
if (validator !== "dss" && validator !== "independent") {
  throw new Error("Usage: pades:validate --validator dss|independent");
}

if (validator === "dss") {
  const result = spawnSync("pnpm", ["--filter", "@credaryn/example-invoice-puppeteer", "verify:fixtures"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const probe = spawnSync("pdfsig", ["-h"], { stdio: "ignore" });
  if (probe.error || probe.status === null) {
    console.error("Independent PAdES validation is not available: install Poppler pdfsig and rerun this gate.");
    process.exitCode = 2;
  } else {
    console.log("pdfsig is available; run it against test-vectors/pdf/invoice-11800.pdf for the owner review.");
  }
}

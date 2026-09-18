import { access, readFile } from "node:fs/promises";

const reportOnly = process.argv.includes("--report") || !process.argv.includes("--check");
let failed = false;
for (const path of ["docs/deployment/air-gapped.md", "test-vectors/paper-v1/transport.txt", "test-vectors/pdf/invoice-11800.pdf", "services/status/test/status-service.test.ts"]) {
  try { await access(path); console.log(`FOUND ${path}`); } catch { failed = true; console.log(`MISSING ${path}`); }
}
const statusTest = await readFile("services/status/test/status-service.test.ts", "utf8").catch(() => "");
if (statusTest.includes("UNCHECKED") && statusTest.includes("UNAVAILABLE")) console.log("PASS status contract contains UNCHECKED/UNAVAILABLE evidence");
else { failed = true; console.log("FAIL missing UNCHECKED/UNAVAILABLE status evidence"); }

const operatorConfirmed = process.env.CREDARYN_AIR_GAP_CONFIRMED === "1";
if (!operatorConfirmed) {
  failed = true;
  console.log("NOT RUN network-isolated PDF/paper verification (operator must disconnect network, follow the guide, then set CREDARYN_AIR_GAP_CONFIRMED=1 for the recorded check)");
} else console.log("RECORDED operator confirmation of network isolation; review the Milestone 12 report for observations");
const milestoneReport = await readFile("docs/verification/milestone-12.md", "utf8").catch(() => "");
if (!/^Air-gap result:\s*PASS$/im.test(milestoneReport)) {
  failed = true;
  console.log("NOT RECORDED isolated PDF/paper and status-freshness observations (`Air-gap result: PASS` in the Milestone 12 report)");
}
if (!reportOnly && failed) process.exitCode = 1;

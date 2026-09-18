import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const journeys = [
  ["issuer developer", "docs/getting-started.md"],
  ["PDF recipient", "test-vectors/pdf/invoice-11800.pdf"],
  ["paper recipient", "test-vectors/paper-v1/qr-512.png"],
  ["tamper scenario", "test-vectors/pdf/invoice-11800-mutated.pdf"],
  ["enterprise administrator", "docs/deployment/enterprise.md"],
  ["self-host operator", "docs/deployment/docker-compose.md"],
  ["air-gapped operator", "docs/deployment/air-gapped.md"],
  ["security auditor", "docs/project-done-checklist.md"],
] as const;
const checkMode = process.argv.includes("--check") && !process.argv.includes("--report");
let failed = false;
for (const [name, evidence] of journeys) {
  try {
    await access(evidence);
    const bytes = await readFile(evidence);
    console.log(`READY ${name}: ${evidence} sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  } catch {
    failed = true;
    console.log(`MISSING ${name}: ${evidence}`);
  }
}
const report = await readFile("docs/verification/milestone-12.md", "utf8").catch(() => "");
const accepted = /Owner acceptance:\s*ACCEPTED/i.test(report);
console.log(`Manual journeys are not automated or inferred. Owner acceptance: ${accepted ? "recorded" : "pending"}.`);
if (checkMode && (failed || !accepted)) process.exitCode = 1;

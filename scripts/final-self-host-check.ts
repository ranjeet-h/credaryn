import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";

const reportOnly = process.argv.includes("--report") || !process.argv.includes("--check");
let failed = false;
for (const path of ["deploy/docker-compose.yml", "apps/verifier-web/Dockerfile", "docs/deployment/docker-compose.md"]) {
  try { await access(path); console.log(`FOUND ${path}`); } catch { failed = true; console.log(`MISSING ${path}`); }
}
try {
  execFileSync("docker", ["compose", "-f", "deploy/docker-compose.yml", "config", "--quiet"], { stdio: "inherit" });
  console.log("PASS Docker Compose configuration");
} catch {
  failed = true;
  console.log("BLOCKED Docker Compose is unavailable or configuration validation failed");
}
const baseUrl = process.env.CREDARYN_SELF_HOST_BASE_URL;
if (baseUrl === undefined) {
  failed = true;
  console.log("NOT RUN live health/verification checks (set CREDARYN_SELF_HOST_BASE_URL to an operator-started deployment)");
} else {
  try {
    const response = await fetch(`${baseUrl}/v1/health`);
    const body = await response.json() as { status?: string; apiVersion?: string };
    if (!response.ok || body.status !== "ready" || body.apiVersion !== "v1") throw new Error("unexpected health response");
    console.log(`PASS self-host health at ${baseUrl}`);
  } catch (error) { failed = true; console.log(`FAIL self-host health: ${String(error)}`); }
}
console.log("No-SaaS operation and PDF/paper journeys require operator observation; this script does not claim them from config alone.");
const milestoneReport = await readFile("docs/verification/milestone-12.md", "utf8").catch(() => "");
if (!/^Self-host result:\s*PASS$/im.test(milestoneReport)) {
  failed = true;
  console.log("NOT RECORDED operator PDF/paper and no-SaaS observation (`Self-host result: PASS` in the Milestone 12 report)");
}
if (!reportOnly && failed) process.exitCode = 1;

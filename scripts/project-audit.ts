import { access, readFile } from "node:fs/promises";

type Criterion = { id: string; name: string; evidence: readonly string[]; ownerGate?: string };

const criteria: readonly Criterion[] = [
  { id: "A", name: "Digital", evidence: ["test-vectors/pdf/invoice-11800.pdf", "test-vectors/pdf/invoice-11800-mutated.pdf", "docs/architecture/pades-conformance.md", "docs/security/phase10-review.md"] },
  { id: "B", name: "Paper", evidence: ["test-vectors/paper-v1/transport.txt", "test-vectors/paper-v1/qr-512.png", "docs/standards/paper-seal-v1.md"], ownerGate: "printed-media corpus acceptance" },
  { id: "C", name: "Browser", evidence: ["docs/security/browser-print.md", "examples/browser-print/src/server.ts"], ownerGate: "real-browser print review" },
  { id: "D", name: "Trust", evidence: ["docs/trust/index.md", "docs/trust/x509-did-web.md"] },
  { id: "E", name: "Keys", evidence: ["docs/key-management/index.md", "docs/key-management/providers.md", "examples/pkcs11/src/issue.ts"] },
  { id: "F", name: "Lifecycle", evidence: ["docs/status/index.md", "services/status/test/status-service.test.ts", "test-vectors/w3c/did-web/credential.json"] },
  { id: "G", name: "Interop", evidence: ["docs/interop/final-vectors.md", "standards/trustvc/test/interoperability.test.ts"] },
  { id: "H", name: "Verification", evidence: ["docs/architecture/verification-result.md", "docs/compatibility/final-matrix.md"], ownerGate: "PWA/widget manual parity review" },
  { id: "I", name: "Self-hosting", evidence: ["deploy/docker-compose.yml", "docs/deployment/docker-compose.md"], ownerGate: "clean-host deployment run" },
  { id: "J", name: "Enterprise operations", evidence: ["docs/deployment/enterprise.md", "docs/privacy/retention.md", "docs/key-management/rotation.md"], ownerGate: "operator acceptance" },
  { id: "K", name: "Physical intelligence (owner-deferred)", evidence: ["docs/project-done-checklist.md"] },
  { id: "L", name: "Quality", evidence: ["docs/compatibility/final-corpus-results.md", "docs/benchmarks/v1.md", "docs/security/phase10-review.md", "docs/release/migration-policy.md"], ownerGate: "release provenance and corpus acceptance" },
  { id: "M", name: "Developer experience", evidence: ["docs/getting-started.md"], ownerGate: "clean-checkout first-document journey" },
  { id: "N", name: "Scope discipline", evidence: ["docs/threat-model/index.md", "docs/architecture/index.md"] },
];

const checkMode = process.argv.includes("--check") && !process.argv.includes("--report");
const missing: string[] = [];
for (const criterion of criteria) {
  const absent: string[] = [];
  for (const path of criterion.evidence) {
    try { await access(path); } catch { absent.push(path); }
  }
  missing.push(...absent);
  const gate = criterion.ownerGate === undefined ? "" : `; owner gate pending: ${criterion.ownerGate}`;
  console.log(`${absent.length === 0 ? "EVIDENCE" : "MISSING"} ${criterion.id} ${criterion.name}: ${criterion.evidence.join(", ")}${gate}`);
}

const report = await readFile("docs/verification/milestone-12.md", "utf8").catch(() => "");
const accepted = /Owner acceptance:\s*ACCEPTED/i.test(report);
const pendingOwnerGates = criteria.filter((item) => item.ownerGate !== undefined).length;
console.log(`Summary: ${criteria.length} criteria; ${missing.length} missing evidence path(s); ${pendingOwnerGates} owner/manual gate(s); owner acceptance ${accepted ? "recorded" : "not recorded"}.`);
if (checkMode && (missing.length > 0 || pendingOwnerGates > 0 && !accepted)) process.exitCode = 1;

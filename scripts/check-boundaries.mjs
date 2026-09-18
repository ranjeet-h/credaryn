import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Trust-boundary enforcement. Only the composition roots (CLI, apps and the DSS
// adapter itself) may name the DSS adapter; only the status service may name a
// PostgreSQL client; only the TrustVC package may name TrustVC. Everything else
// must stay behind the byte/result contracts in @credaryn/core.
const ROOTS = ["packages", "providers", "services", "standards", "adapters", "apps", "cli"];

const IMPORT_CATEGORIES = [
  {
    name: "DSS/Java adapter",
    test: /(?:^|[/@-])pades-dss(?:[/-]|$)|(?:^|[./@-])java(?:[./-]|$)/i,
    // Composition roots orchestrate the adapter; packages/providers/services/standards must not.
    allow: (pkgDir) => pkgDir === "adapters/pades-dss" || pkgDir === "cli" || pkgDir.startsWith("cli/") || pkgDir.startsWith("apps/"),
  },
  { name: "puppeteer", test: /(?:^|\/)puppeteer(?:-core)?(?:\/|$)/i, allow: () => false },
  { name: "TrustVC", test: /(?:^|[/@-])trustvc(?:[/-]|$)/i, allow: (pkgDir) => pkgDir === "standards/trustvc" },
  { name: "cloud provider SDK", test: /(?:@aws-sdk|aws-sdk|@google-cloud|google-cloud|@azure\/)/i, allow: () => false },
  { name: "PostgreSQL client", test: /(?:^|[/@-])(?:pg|postgres|postgresql)(?:[./-]|$)/i, allow: (pkgDir) => pkgDir === "services" || pkgDir.startsWith("services/") },
  { name: "OCR/vision", test: /(?:^|[/@-])ocr(?:[./-]|$)/i, allow: () => false },
];

const BROWSER_GLOBAL = /\bwindow\s*\.|\bglobalThis\.(?:window|document|navigator|localStorage)\b|\bcustomElements\.define\b|\bnew\s+HTMLElement\b|\blocalStorage\b/;
const BROWSER_PACKAGES = new Set(["packages/web", "packages/widget"]);
const IMPORT_SPECIFIER = /(?:import\s+[^;]*?from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test") continue;
      files.push(...(await walk(path)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}

function packageDir(file) {
  const [root, scope] = file.split(/[\\/]/);
  return `${root}/${scope}`;
}

function isAllowed(category, pkgDir) {
  return category.allow(pkgDir);
}

const violations = [];
let scanned = 0;

for (const root of ROOTS) {
  let files;
  try {
    files = await walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    if (!file.includes(`${root}/`) || !file.includes("/src/")) continue;
    scanned += 1;
    const source = await readFile(file, "utf8");
    const pkgDir = packageDir(file);

    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      for (const category of IMPORT_CATEGORIES) {
        if (category.test.test(specifier) && !isAllowed(category, pkgDir)) {
          violations.push(`${file}: imports ${specifier} (${category.name})`);
        }
      }
    }

    const allowsBrowserGlobals = BROWSER_PACKAGES.has(pkgDir) || pkgDir.startsWith("apps/");
    if (!allowsBrowserGlobals && BROWSER_GLOBAL.test(source)) {
      violations.push(`${file}: uses a browser global outside a web/UI package`);
    }
  }
}

if (violations.length > 0) {
  console.error("Workspace trust-boundary violation(s):");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`Trust-boundary check passed for ${scanned} TypeScript source file(s) across ${ROOTS.length} root(s).`);

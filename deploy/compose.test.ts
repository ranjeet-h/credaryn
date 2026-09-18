import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function dockerComposeAvailable(): boolean {
  try {
    const probe = spawnSync("docker", ["compose", "version"], { stdio: "ignore" });
    return probe.status === 0;
  } catch {
    return false;
  }
}

describe("self-hosted deployment Compose", () => {
  it("builds DSS from its adapter directory and runs the verifier read-only", async () => {
    const [compose, demoTrustCompose, dockerfile, dockerignore] = await Promise.all([
      readFile(new URL("./docker-compose.yml", import.meta.url), "utf8"),
      readFile(new URL("./docker-compose.demo-trust.yml", import.meta.url), "utf8"),
      readFile(new URL("../apps/verifier-web/Dockerfile", import.meta.url), "utf8"),
      readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
    ]);
    const dssService = compose.split("\n  verifier:", 1)[0];
    const verifierService = compose.split("\n  verifier:", 2)[1]?.split("\n  status-db:", 1)[0] ?? "";

    expect(dssService).toContain("context: ../adapters/pades-dss");
    expect(dssService).toContain("dockerfile: Dockerfile");
    expect(verifierService).toContain("${CREDARYN_VERIFIER_PORT:-8080}:4173");
    expect(dockerfile).toContain("chmod -R a+rX /app");
    expect(dockerfile).toContain("CMD [\"node\", \"node_modules/tsx/dist/cli.mjs\", \"apps/verifier-web/src/server.ts\"]");
    expect(dockerignore).toContain("deploy/secrets");
    expect(dockerignore).toContain("deploy/trust");
    expect(demoTrustCompose).toContain("CREDARYN_TRUST_STORE: /run/trust/trust-store.json");
    expect(demoTrustCompose).toContain("CREDARYN_TRUST_BUNDLE");
  });

  it("reads the DSS keystore password from a secret file, never inline", async () => {
    const compose = await readFile(new URL("./docker-compose.yml", import.meta.url), "utf8");
    const entrypoint = await readFile(new URL("./dss-entrypoint-secret.sh", import.meta.url), "utf8");
    const statusEntrypoint = await readFile(new URL("./status-entrypoint-secret.sh", import.meta.url), "utf8");

    expect(compose).toContain("DSS_KEYSTORE_PASSWORD_FILE: /run/secrets/dss_keystore_password");
    expect(compose).toContain("dss_keystore_password:");
    expect(compose).toMatch(/entrypoint: \["\/bin\/bash", "\/opt\/credaryn\/entrypoint-with-secret\.sh"\]/);
    expect(compose).not.toMatch(/DSS_KEYSTORE_PASSWORD:/);
    expect(entrypoint).toContain("DSS_KEYSTORE_PASSWORD=");
    expect(entrypoint).toContain("/run/secrets/dss_keystore_password");
    expect(entrypoint).toContain("exec /usr/local/bin/credaryn-dss-entrypoint");
    // The status service builds DATABASE_URL from the same secret mechanism.
    expect(statusEntrypoint).toContain("/run/secrets/postgres_password");
    expect(statusEntrypoint).toContain("DATABASE_URL=");
    expect(statusEntrypoint).toContain("exec \"$@\"");
  });

  it("pins the PostgreSQL image and gates status/admin behind profiles", async () => {
    const compose = await readFile(new URL("./docker-compose.yml", import.meta.url), "utf8");
    const statusDb = compose.split("\n  status-db:", 2)[1]?.split("\n  status:", 1)[0] ?? "";
    const status = compose.split("\n  status:", 2)[1]?.split("\n  admin:", 1)[0] ?? "";
    const admin = compose.split("\n  admin:", 2)[1]?.split("\nvolumes:", 1)[0] ?? "";

    expect(statusDb).toMatch(/image: postgres:16-alpine@sha256:[a-f0-9]{64}/);
    expect(statusDb).toContain("profiles: [status]");
    expect(status).toContain("profiles: [status]");
    expect(status).toContain("services/status/src/server.ts");
    expect(status).toContain("status-entrypoint-secret.sh");
    expect(status).toContain("postgres_password");
    expect(status).not.toMatch(/POSTGRES_PASSWORD:/);
    expect(admin).toContain("profiles: [admin]");
    expect(admin).toContain("apps/admin/src/main.ts");
  });

  it("provides an air-gapped override with local trust and no external DSS route", async () => {
    const [override, statusScript, adminServer] = await Promise.all([
      readFile(new URL("./docker-compose.air-gapped.yml", import.meta.url), "utf8"),
      readFile(new URL("../services/status/src/server.ts", import.meta.url), "utf8"),
      readFile(new URL("../apps/admin/src/main.ts", import.meta.url), "utf8"),
    ]);

    expect(override).toContain("internal: true");
    expect(override).toContain("CREDARYN_TRUST_STORE: /run/trust/trust-store.json");
    expect(override).toContain("air-gapped-trust-store.json");
    expect(override).toContain("!override");
    expect(statusScript).toContain("StatusService");
    expect(adminServer).toContain("createAdminServer");
  });

  it.runIf(dockerComposeAvailable())("validates as a Compose project with and without profiles", () => {
    const config = (args: string[]): void => {
      execFileSync("docker", ["compose", "-f", "deploy/docker-compose.yml", ...args, "config", "--quiet"], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    };

    expect(() => config([])).not.toThrow();
    expect(() => config(["--profile", "status", "--profile", "admin"])).not.toThrow();
    expect(() =>
      execFileSync(
        "docker",
        ["compose", "-f", "deploy/docker-compose.yml", "-f", "deploy/docker-compose.air-gapped.yml", "config", "--quiet"],
        { cwd: repoRoot, stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});

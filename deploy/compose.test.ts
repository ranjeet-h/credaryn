import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("self-hosted deployment Compose", () => {
  it("builds DSS from its adapter directory so all Dockerfile inputs are available", async () => {
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
});

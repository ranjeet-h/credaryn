import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DSS 6.5 container boundary", () => {
  it("pins the official DSS version and exposes normalized probe endpoints", async () => {
    const [compose, application] = await Promise.all([
      readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
      readFile(new URL("../src/main/java/com/credaryn/dss/DssBoundaryApplication.java", import.meta.url), "utf8"),
    ]);

    expect(compose).toContain("DSS_VERSION: \"6.5\"");
    expect(compose).toContain("/health");
    expect(compose).toContain("curl -fsS");
    expect(application).toContain("/v1/probe");
    // B-T is opt-in: the TSA URL is passed through, read from the environment,
    // and only then is PAdES Baseline T selectable.
    expect(compose).toContain("DSS_TSA_URL");
    expect(application).toContain("DSS_TSA_URL");
    expect(application).toContain("PAdES_BASELINE_T");
    expect(application).toContain("timestamping_not_configured");
  });
});

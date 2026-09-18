# Dependency-audit disposition

The local audit was run on 2026-09-18 with pnpm `12.3.3` and the frozen
workspace lockfile.

```bash
pnpm audit --audit-level high
```

Result: PASS after applying workspace overrides for patched `form-data`,
`node-forge`, `tar`, `tmp`, `toml`, and `undici`, and upgrading the example
Puppeteer dependency to `25.11.0`. The previous high-severity `extract-zip`
finding disappeared with that Puppeteer upgrade.

```bash
pnpm audit --audit-level moderate
```

Result: five moderate findings remain in the legacy `request`/`tough-cookie`/
`qs`/`uuid` subtree pulled by TrustVC's transitive BBS compatibility package.
`request` has no patched release. Credaryn's adapter exposes only ECDSA-SD-2023
and does not expose BBS APIs, but the dependency remains installed and must be
removed, upgraded upstream, or explicitly risk-accepted before stable 1.0.

This is a release blocker, not a clean audit claim. The SBOM records the full
dependency graph with:

```bash
pnpm sbom:check
```

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

Result: PASS; no known vulnerabilities were reported at the moderate threshold.
The five previous findings were removed by replacing TrustVC's
`@trustvc/w3c-vc` dependency with the direct modern ECDSA-SD-2023 stack. The
legacy `request`/`tough-cookie`/`qs`/old-`uuid` subtree is absent from the
lockfile. `@trustvc/w3c-issuer` still supplies DID/key generation, including
its optional BBS key-generation packages, but no audit finding remains in that
path and Credaryn does not expose BBS credential operations.

The SBOM records the full dependency graph with:

```bash
pnpm sbom:check
```

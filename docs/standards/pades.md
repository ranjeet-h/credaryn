# PAdES profile

Credaryn targets PAdES Baseline B-B through the isolated DSS 6.5 adapter, with optional PAdES Baseline B-T when an RFC 3161 TSA URL is explicitly configured. B-T is advertised only when the adapter is TSA-configured; otherwise B-T requests are rejected rather than silently downgraded. See [PAdES conformance](../architecture/pades-conformance.md) for the signing order, normalized adapter contract, independent validation, mutation evidence, and legal limitations.

PAdES validity does not imply a jurisdiction-specific qualified signature. The final seal-bearing PDF bytes are signed; changing signed bytes must invalidate artifact integrity.

## Validation gate

Run both independent validators against the sealed fixture and its post-signing mutation:

```bash
pnpm pades:validate:all
```

`pnpm pades:validate:all` runs `scripts/pades-validate.ts` twice:

- `--validator dss` verifies the fixture pair through the DSS reference engine
  (requires the DSS sidecar, for example
  `docker compose -f adapters/pades-dss/docker-compose.yml up -d`).
- `--validator independent` verifies the same pair with Poppler `pdfsig`; it
  exits non-zero when `pdfsig` is unavailable or either fixture is misclassified.

Each validator must accept the original fixture and reject the mutated fixture.
The same commands are recorded as Phase 10 automated gates in the execution plan.
This is a local/owner-run gate (there is no CI, see
[ADR 0004](../adr/0004-no-ci-github-actions.md)).

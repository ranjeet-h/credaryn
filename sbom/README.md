# Software bill of materials

Generate the local CycloneDX dependency inventory with:

```bash
pnpm sbom:check
```

The report is written to ignored `artifacts/sbom/cyclonedx.json`. It is derived
from the frozen pnpm workspace graph, excludes workspace `link:` entries, and
contains package URLs for external npm components. Inspect and archive the
report with each release candidate.

The local report is not a substitute for a signed release attestation or a
license/legal review.

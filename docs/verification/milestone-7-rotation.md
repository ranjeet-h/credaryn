# Milestone 7 key rotation sub-report

Status: PENDING owner review; automated demo passed.

Automated evidence: `pnpm key-rotation:demo` reports `AUTHORIZED` for the new
version, activates `v2`, and retains `v1` as `RETIRED` historical metadata.

Owner review: confirm authorize/publish happens before activation, only the
active version is used for new documents, historical public material remains
resolvable, and revoke/compromise records are retained with a reason.

```text
Rotation review: pending
Historical verification: pending
Limitations: pending
```

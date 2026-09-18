# Migration and compatibility policy

Semantic versioning applies to publishable APIs. Paper Seal Profile v1 (`CRD1:`) and the normalized `VerificationResult` contract are frozen for 1.x; a breaking wire change receives a new profile/version and must not reinterpret old bytes.

Deprecations are documented for at least one minor release before removal where security permits. Verifiers retain documented non-deprecated profile support. Migrations must state artifact compatibility, trust/status impact, key-rotation needs, rollback, and fixture updates. Security changes may shorten notice but must include regression vectors and operational guidance. See [release versioning](versioning.md).

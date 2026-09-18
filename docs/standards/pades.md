# PAdES profile

Credaryn targets PAdES Baseline B-B through the isolated DSS 6.5 adapter. B-T/TSA is not implemented in the current adapter and is rejected rather than silently downgraded. See [PAdES conformance](../architecture/pades-conformance.md) for the signing order, normalized adapter contract, independent validation, mutation evidence, and legal limitations.

PAdES validity does not imply a jurisdiction-specific qualified signature. The final seal-bearing PDF bytes are signed; changing signed bytes must invalidate artifact integrity.

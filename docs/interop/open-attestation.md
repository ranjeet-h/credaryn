# OpenAttestation compatibility decision

OpenAttestation issuance is not part of Credaryn Milestone 9. No customer fixture or adoption test currently requires a legacy OpenAttestation verification path, and adding one would introduce a second issuance contract without evidence.

If adoption evidence appears, compatibility must be read-only, fixture-bounded, and mapped into the existing normalized verifier result. It must not add a new signing protocol, TradeTrust/blockchain dependency, or alternate trust semantics.

# Rotation and historical verification

`KeyLifecycleRegistry` is an operator-controlled in-memory reference implementation. A production service can persist the same records in its configuration or key-management database, but must preserve the identity and public material fields.

## State machine

```text
AUTHORIZED -> ACTIVE -> RETIRED
                    \-> REVOKED
                    \-> COMPROMISED
```

Rotation is an overlap operation:

1. authorize and publish `issuer-key@v2` with its public key and certificate fingerprint;
2. verify that the new public material is available to verifiers;
3. activate `v2`; the prior active version becomes `RETIRED`;
4. issue new documents only with the active version;
5. retain retired, revoked, and compromised records for historical lookup.

The registry rejects identity reuse with different public material. `issuerId` stays stable across rotations, while a versioned key ID identifies the exact signing key in the Paper Seal header and normalized verification result. A revoked or compromised record is never silently deleted or promoted to active.

Run the local demonstration:

```bash
pnpm key-rotation:demo
```

Expected output includes `AUTHORIZED`, active `v2`, and historical `RETIRED` `v1`. This demo contains only public fixture bytes and no provider credentials.

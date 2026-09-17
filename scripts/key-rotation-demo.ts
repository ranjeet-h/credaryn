import {
  KeyLifecycleRegistry,
  type KeyVersionRecord,
} from "../packages/core/src/key-lifecycle.js";

const registry = new KeyLifecycleRegistry();
const first = record("v1", "sha256:first");
const second = record("v2", "sha256:second");

registry.authorize(first);
registry.activate(first.identity, "2026-09-17T10:00:00.000Z");
registry.authorize(second);

console.log("authorized-before-activation", registry.resolve(second.identity)?.status);
registry.activate(second.identity, "2026-09-17T10:05:00.000Z");
console.log("active-key", registry.getSigningKey("acme-retail").identity.version);
console.log("historical-key", registry.resolve(first.identity)?.status);

function record(version: string, certificateFingerprint: string): KeyVersionRecord {
  return {
    identity: {
      issuerId: "acme-retail",
      keyId: `issuer-key@${version}`,
      version,
      certificateFingerprint,
    },
    keyInfo: {
      issuerId: "acme-retail",
      keyId: `issuer-key@${version}`,
      algorithm: "ES256",
      publicKey: new Uint8Array([version === "v1" ? 1 : 2, 2, 3]),
      certificateFingerprint,
    },
    authorizedAt: "2026-09-17T09:55:00.000Z",
  };
}

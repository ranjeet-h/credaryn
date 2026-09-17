# Unified verification result

`@credaryn/verifier` is the single verification boundary used by the CLI and
the self-hosted web surface. Both surfaces return the same normalized
`VerificationResult` shape from `@credaryn/core`:

```ts
interface VerificationResult {
  verdict: "VALID_TRUSTED" | "VALID_UNTRUSTED" | "INVALID" | "UNVERIFIABLE";
  cryptographicValidity: "VALID" | "INVALID" | "UNVERIFIABLE";
  trustDecision: "TRUSTED" | "UNTRUSTED" | "MISSING";
  lifecycleStatus: "ACTIVE" | "REVOKED" | "CANCELLED" | "SUPERSEDED" | "EXPIRED" | "UNCHECKED";
  issuerId?: string;
  keyId?: string;
  trustSource?: string;
  securityMode: "DIGITAL_ARTIFACT_SIGNED" | "PAPER_CLAIMS_ONLY";
  artifactIntegrity?: "VALID" | "INVALID" | "NOT_APPLICABLE" | "UNKNOWN";
  signedClaims?: Record<string, string | boolean | number>;
  evidence: readonly { code: string; message: string }[];
}
```

## Meaning of the independent fields

| Field | Meaning |
| --- | --- |
| `verdict` | Combined user-facing conclusion. It never upgrades unknown trust to trusted. |
| `cryptographicValidity` | Raw signature/claim cryptographic result before trust policy is applied. |
| `trustDecision` | Whether trust material matched, explicitly rejected the key, or was missing. |
| `lifecycleStatus` | Optional status-service result. V1 local verification reports `UNCHECKED`. |
| `issuerId`, `keyId` | Identity reported by the signature or Paper Seal. |
| `trustSource` | The configured local trust bundle or explicit no-material marker. |
| `securityMode` | `DIGITAL_ARTIFACT_SIGNED` for PDF bytes; `PAPER_CLAIMS_ONLY` for Paper Seal input. |
| `artifactIntegrity` | Integrity of the supplied digital artifact. Paper input is `NOT_APPLICABLE`. |
| `signedClaims` | Claims obtained from the verified signed payload when the underlying format exposes them. PDF engines may omit it; the verifier never invents claims from visible text. |
| `evidence` | Stable, display-safe evidence codes and messages. |

The combined verdict follows this policy:

| Cryptographic result | Trust material | Verdict |
| --- | --- | --- |
| `INVALID` | any | `INVALID` |
| `UNVERIFIABLE` | any | `UNVERIFIABLE` |
| `VALID` | matching trusted key | `VALID_TRUSTED` |
| `VALID` | configured bundle without matching key | `VALID_UNTRUSTED` |
| `VALID` | no trust material configured | `UNVERIFIABLE` |

Paper verification can therefore remain useful without the original PDF: it
reports verified signed claims and `PAPER_CLAIMS_ONLY`, while digital artifact
integrity remains `NOT_APPLICABLE`. A PDF mutation can report `INVALID` even
when a Paper Seal extracted separately from the original document still
verifies.

## Delivery surfaces

- Library: `createVerifier(...).verifyInput({ bytes, contentType? })`.
- CLI: `credaryn verify input --trust ./trust` and `credaryn paper inspect input --trust ./trust`.
- HTTP: `POST /v1/verify`, `/v1/verify/pdf`, and `/v1/verify/paper`.

Input size and content-type checks happen before PDF, PNG, QR, CBOR or COSE
parsing. The web app serves static assets with no-store caching and a
self-only CSP; uploaded bytes are handled in memory for the request.

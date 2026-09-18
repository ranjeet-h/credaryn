import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JWSAlgorithm,
  type JWTVerifyOptions,
} from "jose";
import type { OidcClaims, OidcTokenVerifier } from "./oidc.js";

/** Environment keys the admin app reads to build a real OIDC verifier. */
export interface OidcEnvironment {
  readonly [name: string]: string | undefined;
}

export interface JwksTokenVerifierOptions {
  /** Expected `iss` claim. Required; a token from any other issuer is rejected. */
  issuer: string;
  /** Expected `aud` claim. When set, the claim is required and must match. */
  audience?: string;
  /** HTTPS URL of the JWKS document. `http://` is accepted only for loopback in development. */
  jwksUri: string;
  /** Injectable fetch used for tests and air-gapped proxies. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Clock skew tolerance (seconds) applied to `exp`/`nbf`. Defaults to 30. */
  clockToleranceSeconds?: number;
  /** Accepted signing algorithms. Defaults to the asymmetric JWS algorithms. */
  algorithms?: readonly JWSAlgorithm[];
  /**
   * Allow plaintext `http://` JWKS for loopback hosts only. Defaults to
   * `NODE_ENV !== "production"` so local development works and production stays HTTPS-only.
   */
  allowInsecureLocalhost?: boolean;
  /** Maximum accepted JWKS payload in bytes. Defaults to 256 KiB. */
  maxJwksBytes?: number;
  /** Bounded JWKS fetch timeout in milliseconds. Defaults to 5000. */
  timeoutMilliseconds?: number;
  /** Minimum time between refetches after a cache miss, in milliseconds. Defaults to 30000. */
  cooldownMilliseconds?: number;
  /** Maximum age of cached keys in milliseconds. Defaults to 600000. */
  cacheMaxAgeMilliseconds?: number;
}

/**
 * A verified OIDC principal. Structurally satisfies {@link OidcClaims} while also
 * exposing the full verified claim set for downstream authorization/audit decisions.
 */
export interface VerifiedPrincipal {
  subject: string;
  roles: readonly string[];
  claims: Readonly<Record<string, unknown>>;
  expiresAt?: number;
  issuer?: string;
}

/**
 * JWKS-backed verifier. Its `verify` resolves the richer {@link VerifiedPrincipal}
 * (including the full claim set) and is therefore also an {@link OidcTokenVerifier}.
 */
export interface JwksTokenVerifier extends OidcTokenVerifier {
  verify(token: string): Promise<VerifiedPrincipal>;
}

const DEFAULT_ALGORITHMS: readonly JWSAlgorithm[] = [
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA",
];

// A JWKS document is public material; 256 KiB is far larger than any real key set
// while still bounding what a hostile issuer/endpoint can make us buffer.
const DEFAULT_MAX_JWKS_BYTES = 262_144;
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const DEFAULT_COOLDOWN_MILLISECONDS = 30_000;
const DEFAULT_CACHE_MAX_AGE_MILLISECONDS = 600_000;
const MAX_CLOCK_TOLERANCE_SECONDS = 300;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Builds a real OIDC token verifier backed by a remote JWKS (`createRemoteJWKSet` +
 * `jwtVerify`). Verification enforces:
 *
 * - HTTPS-only `jwksUri` (loopback `http://` only in non-production);
 * - `iss` (always) and `aud` (when configured);
 * - required `sub`/`iss`/`exp` and `exp`/`nbf` validity with a bounded clock tolerance;
 * - a bounded, non-redirecting JWKS fetch (timeout + max body size).
 *
 * Missing or invalid keys/tokens fail closed by rejecting the promise.
 */
export function createJwksTokenVerifier(options: JwksTokenVerifierOptions): JwksTokenVerifier {
  const issuer = options.issuer.trim();
  if (issuer === "") throw new Error("OIDC issuer must not be empty");

  const allowInsecureLocalhost = options.allowInsecureLocalhost
    ?? (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  const jwksUrl = assertSecureJwksUri(options.jwksUri.trim(), allowInsecureLocalhost);

  const clockTolerance = options.clockToleranceSeconds ?? 30;
  if (!Number.isFinite(clockTolerance) || clockTolerance < 0 || clockTolerance > MAX_CLOCK_TOLERANCE_SECONDS) {
    throw new Error(`OIDC clock tolerance must be between 0 and ${MAX_CLOCK_TOLERANCE_SECONDS} seconds`);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const jwks = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS,
    cooldownDuration: options.cooldownMilliseconds ?? DEFAULT_COOLDOWN_MILLISECONDS,
    cacheMaxAge: options.cacheMaxAgeMilliseconds ?? DEFAULT_CACHE_MAX_AGE_MILLISECONDS,
    [customFetch]: createBoundedFetch(fetchImpl, options.maxJwksBytes ?? DEFAULT_MAX_JWKS_BYTES),
  });

  const verifyOptions: JWTVerifyOptions = {
    issuer,
    algorithms: [...(options.algorithms ?? DEFAULT_ALGORITHMS)],
    clockTolerance,
    requiredClaims: ["sub", "iss", "exp"],
    ...(options.audience === undefined ? {} : { audience: options.audience }),
  };

  return {
    async verify(token: string): Promise<VerifiedPrincipal> {
      const { payload } = await jwtVerify(token, jwks, verifyOptions);
      const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
      if (subject === "") throw new Error("OIDC token is missing a subject");
      const principal: VerifiedPrincipal = {
        subject,
        roles: extractRoles(payload),
        claims: payload as Record<string, unknown>,
        ...(typeof payload.exp === "number" ? { expiresAt: payload.exp * 1_000 } : {}),
        ...(typeof payload.iss === "string" ? { issuer: payload.iss } : {}),
      };
      return principal;
    },
  };
}

/**
 * Resolves a real OIDC verifier from `CREDARYN_OIDC_ISSUER` + `CREDARYN_OIDC_JWKS_URI`
 * and optional `CREDARYN_OIDC_AUDIENCE`. Returns `undefined` when none are configured
 * (the caller must then fail closed); throws when the configuration is partial or unsafe.
 */
export function createOidcTokenVerifierFromEnv(env: OidcEnvironment = process.env): JwksTokenVerifier | undefined {
  const issuer = normalise(env.CREDARYN_OIDC_ISSUER);
  const jwksUri = normalise(env.CREDARYN_OIDC_JWKS_URI);
  if (issuer === undefined && jwksUri === undefined) return undefined;
  if (issuer === undefined || jwksUri === undefined) {
    throw new Error("CREDARYN_OIDC_ISSUER and CREDARYN_OIDC_JWKS_URI must be configured together");
  }
  const audience = normalise(env.CREDARYN_OIDC_AUDIENCE);
  return createJwksTokenVerifier({
    issuer,
    jwksUri,
    ...(audience === undefined ? {} : { audience }),
    allowInsecureLocalhost: env.NODE_ENV !== "production",
  });
}

function normalise(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function assertSecureJwksUri(jwksUri: string, allowInsecureLocalhost: boolean): URL {
  let url: URL;
  try {
    url = new URL(jwksUri);
  } catch {
    throw new Error("OIDC JWKS URI must be an absolute URL");
  }
  if (url.username !== "" || url.password !== "") throw new Error("OIDC JWKS URI must not contain credentials");
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && allowInsecureLocalhost && LOOPBACK_HOSTS.has(url.hostname)) return url;
  throw new Error("OIDC JWKS URI must use HTTPS (http:// is permitted only for loopback in development)");
}

function extractRoles(payload: Record<string, unknown>): readonly string[] {
  const roles = payload.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((role): role is string => typeof role === "string" && role.trim() !== "");
}

/**
 * Wraps an injectable fetch with a redirect-free, size-bounded body read so a hostile
 * JWKS endpoint cannot exhaust admin memory. jose already passes `redirect: "manual"`
 * and a timeout `AbortSignal`; this only adds the byte cap.
 */
function createBoundedFetch(fetchImpl: typeof fetch, maxBytes: number): FetchImplementation {
  return async (url, options) => {
    const response = await fetchImpl(url, options);
    if (response.status !== 200 || response.body === null) return response;

    const declared = response.headers.get("content-length");
    if (declared !== null) {
      const length = Number(declared);
      if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
        await response.body.cancel().catch(() => undefined);
        throw new Error("OIDC JWKS response exceeds the maximum permitted size");
      }
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error("OIDC JWKS response exceeds the maximum permitted size");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };
}

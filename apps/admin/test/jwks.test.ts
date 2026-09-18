import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWTPayload } from "jose";
import { createJwksTokenVerifier, createOidcTokenVerifierFromEnv } from "../src/auth/jwks.js";

const ISSUER = "https://issuer.example.test";
const AUDIENCE = "credaryn-admin";
const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;
const KID = "admin-key-1";
const ALG = "ES256";

interface IssuerFixture {
  privateKey: CryptoKey;
  publicJwk: Record<string, unknown>;
  jwks: { keys: Record<string, unknown>[] };
}

async function createIssuer(kid: string = KID): Promise<IssuerFixture> {
  const { publicKey, privateKey } = await generateKeyPair(ALG);
  const publicJwk = await exportJWK(publicKey);
  return {
    privateKey,
    publicJwk,
    jwks: { keys: [{ ...publicJwk, kid, use: "sig", alg: ALG }] },
  };
}

function stubFetch(jwks: unknown, counter?: { calls: number }): typeof fetch {
  return async () => {
    if (counter !== undefined) counter.calls += 1;
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

interface TokenOverrides {
  issuer?: string;
  audience?: string;
  subject?: string;
  roles?: unknown;
  expiresAt?: string | number | Date;
  notBefore?: string | number | Date;
  key?: CryptoKey;
}

async function signToken(privateKey: CryptoKey, overrides: TokenOverrides = {}): Promise<string> {
  const payload: JWTPayload = {};
  if (overrides.roles !== undefined) payload.roles = overrides.roles;
  const token = new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setSubject(overrides.subject ?? "admin-user")
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? "5m");
  if (overrides.notBefore !== undefined) token.setNotBefore(overrides.notBefore);
  return token.sign(overrides.key ?? privateKey);
}

function verifierFor(fixture: IssuerFixture, extra: Partial<Parameters<typeof createJwksTokenVerifier>[0]> = {}) {
  return createJwksTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksUri: JWKS_URI,
    fetchImpl: stubFetch(fixture.jwks),
    ...extra,
  });
}

describe("createJwksTokenVerifier", () => {
  it("accepts a valid JWKS-signed token and returns the verified principal", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);

    const principal = await verifier.verify(await signToken(issuer.privateKey, { roles: ["admin", "viewer"] }));

    expect(principal.subject).toBe("admin-user");
    expect(principal.roles).toEqual(["admin", "viewer"]);
    expect(principal.issuer).toBe(ISSUER);
    expect(principal.claims.iss).toBe(ISSUER);
    expect(typeof principal.expiresAt).toBe("number");
  });

  it("fetches and caches the key set across verifications", async () => {
    const issuer = await createIssuer();
    const counter = { calls: 0 };
    const verifier = createJwksTokenVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      jwksUri: JWKS_URI,
      fetchImpl: stubFetch(issuer.jwks, counter),
    });

    await verifier.verify(await signToken(issuer.privateKey));
    await verifier.verify(await signToken(issuer.privateKey));

    expect(counter.calls).toBe(1);
  });

  it("rejects a token signed by an unknown key (forged/tampered signature)", async () => {
    const issuer = await createIssuer();
    const attacker = await createIssuer();
    const verifier = verifierFor(issuer);

    // Same `kid` as the trusted key, but signed with the attacker's private key.
    const forged = await signToken(attacker.privateKey, { roles: ["admin"] });
    await expect(verifier.verify(forged)).rejects.toThrow();
  });

  it("rejects a token with a different issuer", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);
    const token = await signToken(issuer.privateKey, { issuer: "https://evil.example.test" });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);
    const token = await signToken(issuer.privateKey, { expiresAt: "-1m" });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it("rejects a not-yet-valid token", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);
    const token = await signToken(issuer.privateKey, { notBefore: "5m" });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it("rejects a token whose audience does not match", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);
    const token = await signToken(issuer.privateKey, { audience: "some-other-service" });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it("rejects a JWKS document larger than the configured byte bound", async () => {
    const issuer = await createIssuer();
    const oversized = {
      keys: [{ ...issuer.publicJwk, kid: KID, use: "sig", alg: ALG, padding: "x".repeat(4_096) }],
    };
    const verifier = verifierFor(issuer, { fetchImpl: stubFetch(oversized), maxJwksBytes: 64 });
    await expect(verifier.verify(await signToken(issuer.privateKey))).rejects.toThrow(/maximum permitted size/i);
  });

  it("extracts no roles when the roles claim is not a string array", async () => {
    const issuer = await createIssuer();
    const verifier = verifierFor(issuer);
    const principal = await verifier.verify(await signToken(issuer.privateKey, { roles: "admin" }));
    expect(principal.roles).toEqual([]);
  });
});

describe("createJwksTokenVerifier transport hardening", () => {
  it("rejects a plaintext non-loopback JWKS URI", () => {
    expect(() => createJwksTokenVerifier({
      issuer: ISSUER,
      jwksUri: "http://issuer.example.test/jwks.json",
      fetchImpl: stubFetch({ keys: [] }),
      allowInsecureLocalhost: true,
    })).toThrow(/HTTPS/i);
  });

  it("rejects loopback plaintext when production/dev-allow is off", () => {
    expect(() => createJwksTokenVerifier({
      issuer: ISSUER,
      jwksUri: "http://localhost:8080/jwks.json",
      fetchImpl: stubFetch({ keys: [] }),
      allowInsecureLocalhost: false,
    })).toThrow(/HTTPS/i);
  });

  it("allows loopback plaintext when explicitly enabled for development", () => {
    expect(() => createJwksTokenVerifier({
      issuer: ISSUER,
      jwksUri: "http://localhost:8080/jwks.json",
      fetchImpl: stubFetch({ keys: [] }),
      allowInsecureLocalhost: true,
    })).not.toThrow();
  });

  it("rejects a JWKS URI containing embedded credentials", () => {
    expect(() => createJwksTokenVerifier({
      issuer: ISSUER,
      jwksUri: "https://user:pass@issuer.example.test/jwks.json",
    })).toThrow(/credentials/i);
  });
});

describe("createOidcTokenVerifierFromEnv", () => {
  it("returns undefined when OIDC is not configured", () => {
    expect(createOidcTokenVerifierFromEnv({})).toBeUndefined();
  });

  it("builds a real verifier when issuer and JWKS URI are configured", () => {
    const verifier = createOidcTokenVerifierFromEnv({
      CREDARYN_OIDC_ISSUER: ISSUER,
      CREDARYN_OIDC_JWKS_URI: JWKS_URI,
      CREDARYN_OIDC_AUDIENCE: AUDIENCE,
      NODE_ENV: "test",
    });
    expect(verifier).toBeDefined();
  });

  it("fails fast when only part of the configuration is present", () => {
    expect(() => createOidcTokenVerifierFromEnv({ CREDARYN_OIDC_ISSUER: ISSUER })).toThrow(/together/);
    expect(() => createOidcTokenVerifierFromEnv({ CREDARYN_OIDC_JWKS_URI: JWKS_URI })).toThrow(/together/);
  });

  it("stays HTTPS-only in production", () => {
    expect(() => createOidcTokenVerifierFromEnv({
      CREDARYN_OIDC_ISSUER: ISSUER,
      CREDARYN_OIDC_JWKS_URI: "http://localhost:8080/jwks.json",
      NODE_ENV: "production",
    })).toThrow(/HTTPS/i);
  });

  it("permits loopback HTTP outside production", () => {
    expect(createOidcTokenVerifierFromEnv({
      CREDARYN_OIDC_ISSUER: ISSUER,
      CREDARYN_OIDC_JWKS_URI: "http://localhost:8080/jwks.json",
      NODE_ENV: "test",
    })).toBeDefined();
  });
});

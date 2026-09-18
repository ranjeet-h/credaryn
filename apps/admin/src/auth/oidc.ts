export interface OidcClaims {
  subject: string;
  roles: readonly string[];
  expiresAt?: number;
  issuer?: string;
}

export interface AdminAuthorizationInput {
  method: string;
  claims: OidcClaims | undefined;
  csrfToken?: string | undefined;
  expectedCsrfToken?: string | undefined;
  now?: number;
}

export interface AdminAuthorization {
  subject: string;
  role: "admin";
}

export interface OidcTokenVerifier {
  verify(token: string): Promise<OidcClaims>;
}

export function authorizeAdmin(input: AdminAuthorizationInput): AdminAuthorization {
  if (input.claims === undefined) throw new Error("Admin authentication is required");
  if (input.claims.expiresAt !== undefined && input.claims.expiresAt <= (input.now ?? Date.now())) throw new Error("Admin authentication has expired");
  if (!input.claims.roles.includes("admin")) throw new Error("Admin role is required");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(input.method.toUpperCase())
    && (input.csrfToken === undefined || input.expectedCsrfToken === undefined || input.csrfToken !== input.expectedCsrfToken)) {
    throw new Error("CSRF validation failed");
  }
  return { subject: input.claims.subject, role: "admin" };
}

export async function authenticateOidcToken(token: string, verifier: OidcTokenVerifier): Promise<OidcClaims> {
  if (token.trim() === "") throw new Error("OIDC bearer token is required");
  return verifier.verify(token);
}

export function createSecureSessionCookie(sessionId: string): string {
  if (/[\r\n;]/.test(sessionId)) throw new Error("Session ID contains invalid cookie characters");
  return `credaryn_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function createCsrfCookie(csrfToken: string): string {
  if (/[\r\n;]/.test(csrfToken)) throw new Error("CSRF token contains invalid cookie characters");
  return `credaryn_csrf=${encodeURIComponent(csrfToken)}; Path=/; Secure; SameSite=Strict`;
}

export function validateCorsOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

export interface RemoteSigningScope {
  issuerId: string;
  keyId?: string;
}

export interface RemoteSigningAuthorizationInput {
  subject: string;
  roles: readonly string[];
  issuerId: string;
  keyId: string;
  allowedScopes: readonly RemoteSigningScope[];
}

export interface RemoteSigningAuthorization {
  subject: string;
  issuerId: string;
  keyId: string;
}

/**
 * Least-privilege authorization for optional remote signing: the workload must hold the
 * `signer` role and a scope granting this specific issuer (and, when pinned, key).
 * This must never become an unauthenticated generic signing endpoint.
 */
export function authorizeRemoteSigning(input: RemoteSigningAuthorizationInput): RemoteSigningAuthorization {
  if (!input.roles.includes("signer")) throw new Error("Remote signing requires the signer role");
  const allowed = input.allowedScopes.some((scope) => scope.issuerId === input.issuerId && (scope.keyId === undefined || scope.keyId === input.keyId));
  if (!allowed) throw new Error("Remote signing is not authorized for this issuer/key");
  return { subject: input.subject, issuerId: input.issuerId, keyId: input.keyId };
}

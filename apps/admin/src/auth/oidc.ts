export interface OidcClaims {
  subject: string;
  roles: readonly string[];
  expiresAt?: number;
  issuer?: string;
}

export interface AdminAuthorizationInput {
  method: string;
  claims: OidcClaims | undefined;
  csrfToken?: string;
  expectedCsrfToken?: string;
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

export function validateCorsOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

import type { ClaimValue, Claims, DocumentDescriptor } from "./document.js";

export type DescriptorEnvironment = "production" | "development";

export interface DescriptorValidationOptions {
  environment?: DescriptorEnvironment;
}

export interface DescriptorValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface DescriptorValidationSuccess {
  valid: true;
  descriptor: DocumentDescriptor;
  issues: readonly [];
}

export interface DescriptorValidationFailure {
  valid: false;
  issues: readonly DescriptorValidationIssue[];
}

export type DescriptorValidationResult = DescriptorValidationSuccess | DescriptorValidationFailure;

export class DescriptorValidationError extends Error {
  readonly issues: readonly DescriptorValidationIssue[];

  constructor(issues: readonly DescriptorValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "DescriptorValidationError";
    this.issues = issues;
  }
}

const RFC3339_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function validateDescriptor(
  input: unknown,
  options: DescriptorValidationOptions = {},
): DescriptorValidationResult {
  try {
    if (!isRecord(input)) {
      return failure([{ path: "$", code: "object_required", message: "descriptor must be an object" }]);
    }

    const issues: DescriptorValidationIssue[] = [];
    const issuerId = readIdentity(input, "issuerId", issues);
    const documentId = readIdentity(input, "documentId", issues);
    const documentType = readIdentity(input, "documentType", issues);
    const issuedAt = readString(input.issuedAt, "issuedAt", issues);
    if (issuedAt !== undefined && !isRfc3339(issuedAt)) {
      issues.push({
        path: "issuedAt",
        code: "rfc3339_required",
        message: "issuedAt must be a valid RFC 3339 date-time",
      });
    }

    const claims = readClaims(input.claims, issues);
    const statusUrl = readStatusUrl(input.statusUrl, options.environment ?? "production", issues);

    if (issues.length > 0 || issuerId === undefined || documentId === undefined || documentType === undefined || issuedAt === undefined || claims === undefined) {
      return failure(issues);
    }

    const descriptor: DocumentDescriptor = {
      issuerId,
      documentId,
      documentType,
      issuedAt,
      claims,
    };
    if (statusUrl !== undefined) descriptor.statusUrl = statusUrl;

    return { valid: true, descriptor, issues: [] };
  } catch {
    return failure([{
      path: "$",
      code: "invalid_descriptor",
      message: "descriptor could not be safely inspected",
    }]);
  }
}

export function assertValidDescriptor(
  input: unknown,
  options: DescriptorValidationOptions = {},
): DocumentDescriptor {
  const result = validateDescriptor(input, options);
  if (!result.valid) throw new DescriptorValidationError(result.issues);
  return result.descriptor;
}

export function normalizeDescriptor(descriptor: DocumentDescriptor): DocumentDescriptor {
  const sortedClaims: Record<string, ClaimValue> = {};
  for (const key of Object.keys(descriptor.claims).sort()) {
    sortedClaims[key] = descriptor.claims[key]!;
  }

  const normalized: DocumentDescriptor = {
    issuerId: descriptor.issuerId,
    documentId: descriptor.documentId,
    documentType: descriptor.documentType,
    issuedAt: descriptor.issuedAt,
    claims: sortedClaims,
  };
  if (descriptor.statusUrl !== undefined) normalized.statusUrl = descriptor.statusUrl;
  return normalized;
}

function readIdentity(
  input: Record<string, unknown>,
  field: "issuerId" | "documentId" | "documentType",
  issues: DescriptorValidationIssue[],
): string | undefined {
  const value = readString(input[field], field, issues);
  if (value !== undefined && value.trim().length === 0) {
    issues.push({ path: field, code: "non_empty_required", message: `${field} must not be empty` });
    return undefined;
  }
  if (value !== undefined && value !== value.trim()) {
    issues.push({
      path: field,
      code: "surrounding_whitespace",
      message: `${field} must not have surrounding whitespace`,
    });
    return undefined;
  }
  return value;
}

function readString(
  value: unknown,
  path: string,
  issues: DescriptorValidationIssue[],
): string | undefined {
  if (value === undefined) {
    issues.push({ path, code: "required", message: `${path} is required` });
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push({ path, code: "string_required", message: `${path} must be a string` });
    return undefined;
  }
  return value;
}

function readClaims(value: unknown, issues: DescriptorValidationIssue[]): Claims | undefined {
  if (!isRecord(value)) {
    issues.push({ path: "claims", code: "flat_map_required", message: "claims must be a flat object" });
    return undefined;
  }

  const claims: Record<string, ClaimValue> = {};
  for (const [key, claim] of Object.entries(value)) {
    if (key.trim().length === 0 || key !== key.trim()) {
      issues.push({
        path: `claims.${key}`,
        code: "claim_key_invalid",
        message: "claim keys must be non-empty and have no surrounding whitespace",
      });
      continue;
    }
    if (!isClaimValue(claim)) {
      issues.push({
        path: `claims.${key}`,
        code: "claim_value_unsupported",
        message: "claim values must be strings, booleans or safe integers",
      });
      continue;
    }
    claims[key] = claim;
  }
  return issues.some((issue) => issue.path.startsWith("claims.")) ? undefined : claims;
}

function readStatusUrl(
  value: unknown,
  environment: DescriptorEnvironment,
  issues: DescriptorValidationIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issues.push({ path: "statusUrl", code: "string_required", message: "statusUrl must be a URL string" });
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    issues.push({ path: "statusUrl", code: "url_invalid", message: "statusUrl must be a valid URL" });
    return undefined;
  }

  const localDevelopmentUrl = environment === "development"
    && parsed.protocol === "http:"
    && LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !localDevelopmentUrl) {
    issues.push({
      path: "statusUrl",
      code: "https_required",
      message: "statusUrl must use HTTPS outside local development",
    });
  }
  if (parsed.username !== "" || parsed.password !== "") {
    issues.push({
      path: "statusUrl",
      code: "credentials_forbidden",
      message: "statusUrl must not contain URL credentials",
    });
  }
  return issues.some((issue) => issue.path === "statusUrl") ? undefined : value;
}

function isClaimValue(value: unknown): value is ClaimValue {
  return typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isSafeInteger(value));
}

function isRfc3339(value: string): boolean {
  return RFC3339_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function failure(issues: readonly DescriptorValidationIssue[]): DescriptorValidationFailure {
  return { valid: false, issues };
}

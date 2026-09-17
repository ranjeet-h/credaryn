export type ClaimValue = string | boolean | number;
export type Claims = Readonly<Record<string, ClaimValue>>;

export const V1_CLAIM_VALUE_KINDS = ["string", "boolean", "safe-integer"] as const;

export interface DocumentDescriptor {
  issuerId: string;
  documentId: string;
  documentType: string;
  issuedAt: string;
  claims: Claims;
  statusUrl?: string;
}

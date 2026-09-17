import { describe, expect, it } from "vitest";
import {
  assertValidDescriptor,
  normalizeDescriptor,
  validateDescriptor,
} from "../src/validate-descriptor.js";

const validDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: {
    invoiceNumber: "INV-2026-82919",
    totalMinor: 1_180_000,
    paid: false,
  },
  statusUrl: "https://issuer.example/status/INV-2026-82919",
};

describe("descriptor validation", () => {
  it("accepts a valid invoice descriptor and returns a normalized copy", () => {
    const result = validateDescriptor(validDescriptor);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    if (!result.valid) throw new Error("valid descriptor was rejected");
    expect(result.descriptor).toEqual(validDescriptor);
    expect(assertValidDescriptor(validDescriptor)).toEqual(validDescriptor);
  });

  it("accepts local HTTP status URLs only in development mode", () => {
    const descriptor = {
      ...validDescriptor,
      statusUrl: "http://localhost:8080/status/INV-2026-82919",
    };

    expect(validateDescriptor(descriptor).valid).toBe(false);
    expect(validateDescriptor(descriptor, { environment: "development" }).valid).toBe(true);
  });

  it("rejects missing and empty identity fields", () => {
    const cases = [
      { ...validDescriptor, issuerId: "" },
      { ...validDescriptor, documentId: "   " },
      { ...validDescriptor, documentType: "" },
      { ...validDescriptor, issuedAt: "" },
      { ...validDescriptor, issuerId: 42 },
      { ...validDescriptor, documentId: undefined },
    ];

    for (const descriptor of cases) {
      expect(validateDescriptor(descriptor).valid).toBe(false);
    }
  });

  it("rejects invalid timestamps and non-HTTPS production status URLs", () => {
    const cases = [
      { ...validDescriptor, issuedAt: "not-a-timestamp" },
      { ...validDescriptor, issuedAt: "2026-01-01" },
      { ...validDescriptor, issuedAt: "2026-01-01T00:00:00" },
      { ...validDescriptor, statusUrl: "http://issuer.example/status" },
      { ...validDescriptor, statusUrl: "javascript:alert(1)" },
      { ...validDescriptor, statusUrl: "https://user:password@issuer.example/status" },
      { ...validDescriptor, statusUrl: "://invalid-url" },
    ];

    for (const descriptor of cases) {
      expect(validateDescriptor(descriptor).valid).toBe(false);
    }
  });

  it("rejects unsupported claim values and nested claim structures", () => {
    const cases: unknown[] = [
      { ...validDescriptor, claims: { amount: 1.5 } },
      { ...validDescriptor, claims: { amount: Number.MAX_SAFE_INTEGER + 1 } },
      { ...validDescriptor, claims: { amount: Number.NaN } },
      { ...validDescriptor, claims: { tags: ["invoice"] } },
      { ...validDescriptor, claims: { customer: { name: "Ada" } } },
      { ...validDescriptor, claims: { binary: new Uint8Array([1, 2, 3]) } },
      { ...validDescriptor, claims: ["not", "a", "map"] },
    ];

    for (const descriptor of cases) {
      expect(validateDescriptor(descriptor).valid).toBe(false);
    }
  });

  it("normalizes claim ordering without changing claim values", () => {
    const first = assertValidDescriptor(validDescriptor);
    const reordered = assertValidDescriptor({
      ...validDescriptor,
      claims: {
        paid: false,
        totalMinor: 1_180_000,
        invoiceNumber: "INV-2026-82919",
      },
    });

    expect(JSON.stringify(normalizeDescriptor(first))).toBe(JSON.stringify(normalizeDescriptor(reordered)));
    expect(normalizeDescriptor(reordered).claims).toEqual({
      invoiceNumber: "INV-2026-82919",
      paid: false,
      totalMinor: 1_180_000,
    });
  });

  it("fails closed with actionable issues", () => {
    const result = validateDescriptor({ ...validDescriptor, claims: { totalMinor: 1.25 } });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "claims.totalMinor")).toBe(true);
    expect(() => assertValidDescriptor({ ...validDescriptor, claims: { totalMinor: 1.25 } })).toThrow(
      /claims\.totalMinor/,
    );
  });

  it("fails closed when an untrusted object throws during inspection", () => {
    const input = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("inspection denied");
      },
    });

    expect(validateDescriptor(input)).toMatchObject({
      valid: false,
      issues: [{ code: "invalid_descriptor" }],
    });
  });
});

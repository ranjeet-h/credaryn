import { describe, expect, it } from "vitest";
import { createDidWebResolver, type DidWebLookup, type DidWebResolverOptions } from "../src/trust-policy.js";

const DID = "did:web:issuer.example.test";
const MULTIBASE = "zDnaepz6xrc5naxh8wNfvs7ZpAuLemotyAGhJk7k4iantrjTG";
/** Injected public DNS answer so the SSRF guard never touches the real resolver in tests. */
const PUBLIC_LOOKUP: DidWebLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function addressFamily(address: string): number {
  return address.includes(":") ? 6 : 4;
}

function didDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
    id: DID,
    verificationMethod: [{
      id: `${DID}#multikey-1`,
      type: "Multikey",
      controller: DID,
      publicKeyMultibase: MULTIBASE,
    }],
    ...overrides,
  };
}

function createFetch(
  document: unknown,
  options: { status?: number; body?: string; headers?: Record<string, string> } = {},
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const responseInit: ResponseInit = { status: options.status ?? 200 };
    if (options.headers !== undefined) responseInit.headers = options.headers;
    return new Response(options.body ?? JSON.stringify(document), responseInit);
  };
  return { fetchImpl, calls };
}

function resolver(fetchImpl: typeof fetch, options: Partial<DidWebResolverOptions> = {}) {
  return createDidWebResolver({
    fetchImpl,
    allowedDomains: ["issuer.example.test"],
    lookup: PUBLIC_LOOKUP,
    ...options,
  });
}

describe("createDidWebResolver", () => {
  it("resolves an allowed did:web document over HTTPS and returns did:web material", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const material = await resolver(fetchImpl)(DID, "multikey-1");

    expect(material).toMatchObject({
      url: `https://issuer.example.test/.well-known/did.json`,
      source: "did-web",
    });
    expect(material?.key).toMatchObject({ issuerId: DID, keyId: "multikey-1", algorithm: "ES256" });
    expect(material?.key.publicKey).toHaveLength(33);
    expect(typeof material?.fetchedAt).toBe("string");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("error");
  });

  it("refuses to fetch a domain that is not on the allowlist", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const material = await resolver(fetchImpl, { allowedDomains: ["other.example.test"] })(DID, "multikey-1");

    expect(material).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("only resolves did:web identifiers and validates the identifier shape before fetching", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = resolver(fetchImpl);

    await expect(resolve("did:key:z6Mk", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("https://issuer.example.test/did.json", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:issuer.example.test:..:..:evil", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:issuer.example.test@evil.example.test", "multikey-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("caps the response body and fails closed when it is too large", async () => {
    const { fetchImpl } = createFetch(didDocument(), { body: JSON.stringify(didDocument()).padEnd(500, " ") });
    const material = await resolver(fetchImpl, { maxBytes: 64 })(DID, "multikey-1");

    expect(material).toBeUndefined();
  });

  it("ignores non-OK responses and malformed documents", async () => {
    const notFound = createFetch(didDocument(), { status: 404 });
    const malformed = createFetch(didDocument(), { body: "not json" });

    await expect(resolver(notFound.fetchImpl)(DID, "multikey-1")).resolves.toBeUndefined();
    await expect(resolver(malformed.fetchImpl)(DID, "multikey-1")).resolves.toBeUndefined();
  });

  it("parses a P-256 publicKeyJwk into an uncompressed point", async () => {
    const { fetchImpl } = createFetch(didDocument({
      verificationMethod: [{
        id: `${DID}#key-1`,
        type: "JsonWebKey2020",
        controller: DID,
        publicKeyJwk: {
          kty: "EC",
          crv: "P-256",
          x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
          y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
        },
      }],
    }));

    const material = await resolver(fetchImpl)(DID, "key-1");
    expect(material?.key.publicKey).toHaveLength(65);
    expect(material?.key.publicKey[0]).toBe(0x04);
  });

  it("fails closed when the document identity or verification method does not match", async () => {
    const otherDocument = createFetch(didDocument({ id: "did:web:other.example.test" }));
    const noMatch = createFetch(didDocument());

    await expect(resolver(otherDocument.fetchImpl)(DID, "multikey-1")).resolves.toBeUndefined();
    await expect(resolver(noMatch.fetchImpl)(DID, "missing-key")).resolves.toBeUndefined();
  });

  it("rejects IP-literal hosts (IPv4 and bracketed IPv6) before fetching", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = createDidWebResolver({
      fetchImpl,
      allowedDomains: ["127.0.0.1", "192.168.0.10", "[::1]"],
      lookup: PUBLIC_LOOKUP,
    });

    await expect(resolve("did:web:127.0.0.1", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:192.168.0.10", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:%5B%3A%3A1%5D", "multikey-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it.each([
    "10.0.0.5",
    "127.0.0.1",
    "169.254.10.1",
    "0.0.0.0",
    "172.20.1.1",
    "192.168.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:10.0.0.5",
  ])("rejects a hostname that resolves to the private address %s", async (address) => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address, family: addressFamily(address) }],
    });

    await expect(resolve(DID, "multikey-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("fetches when the hostname resolves to a public IPv6 address", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address: "2606:4700:4700::1111", family: 6 }],
    });

    const material = await resolve(DID, "multikey-1");
    expect(material).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("rejects a hostname when any resolved address is private", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    });

    await expect(resolve(DID, "multikey-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("fails closed when DNS fails or returns no addresses", async () => {
    const noError = createFetch(didDocument());
    const failing = resolver(noError.fetchImpl, {
      lookup: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    const empty = resolver(noError.fetchImpl, { lookup: async () => [] });

    await expect(failing(DID, "multikey-1")).resolves.toBeUndefined();
    await expect(empty(DID, "multikey-1")).resolves.toBeUndefined();
    expect(noError.calls).toHaveLength(0);
  });

  it("rejects encoded non-default ports and query/fragment path segments", async () => {
    const { fetchImpl, calls } = createFetch(didDocument());
    const resolve = resolver(fetchImpl);

    await expect(resolve("did:web:issuer.example.test%3A8443", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:issuer.example.test:key%3Fx", "multikey-1")).resolves.toBeUndefined();
    await expect(resolve("did:web:issuer.example.test:key%23x", "multikey-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

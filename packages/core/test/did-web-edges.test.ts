import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDidWebResolver,
  type DidWebLookup,
  type DidWebResolverOptions,
} from "../src/trust-policy.js";

const DID = "did:web:issuer.example.test";
const PUBLIC_LOOKUP: DidWebLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function addressFamily(address: string): number {
  return address.includes(":") ? 6 : 4;
}

function didDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "@context": "https://www.w3.org/ns/did/v1",
    id: DID,
    verificationMethod: [{ id: `${DID}#key-1`, publicKeyHex: "aabb" }],
    ...overrides,
  };
}

function fetchResponse(document: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(document), { status: 200 });
}

function resolver(fetchImpl: typeof fetch, options: Partial<DidWebResolverOptions> = {}) {
  return createDidWebResolver({
    fetchImpl,
    allowedDomains: ["issuer.example.test"],
    lookup: PUBLIC_LOOKUP,
    ...options,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDidWebResolver SSRF and parsing edges", () => {
  it("returns undefined when no fetch implementation is available", async () => {
    vi.stubGlobal("fetch", undefined);
    const resolve = createDidWebResolver({
      allowedDomains: ["issuer.example.test"],
      lookup: PUBLIC_LOOKUP,
    });

    await expect(resolve(DID, "key-1")).resolves.toBeUndefined();
  });

  it("fails closed when the fetch call throws", async () => {
    const resolve = resolver(async () => {
      throw new Error("connection reset");
    });

    await expect(resolve(DID, "key-1")).resolves.toBeUndefined();
  });

  it("resolves multi-segment did:web paths with a matching document", async () => {
    const did = "did:web:issuer.example.test:users:alice";
    const document = {
      id: did,
      verificationMethod: [{ id: `${did}#key-1`, publicKeyHex: "aabb" }],
    };
    const calls: string[] = [];
    const resolve = resolver(async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify(document), { status: 200 });
    });

    const material = await resolve(did, "key-1");

    expect(material?.url).toBe("https://issuer.example.test/users/alice/did.json");
    expect(calls).toEqual(["https://issuer.example.test/users/alice/did.json"]);
  });

  it("rejects an address that is not a valid IP literal", async () => {
    const { fetchImpl, calls } = fetchSpy(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address: "not-an-ip", family: 4 }],
    });

    await expect(resolve(DID, "key-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it.each([
    "100.64.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ])("rejects the reserved IPv4 range address %s", async (address) => {
    const { fetchImpl, calls } = fetchSpy(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address, family: addressFamily(address) }],
    });

    await expect(resolve(DID, "key-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it.each([
    "::",
    "2001:db8::1",
    "fe80::1%eth0",
  ])("rejects the reserved IPv6 address %s", async (address) => {
    const { fetchImpl, calls } = fetchSpy(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address, family: addressFamily(address) }],
    });

    await expect(resolve(DID, "key-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("accepts a fully expanded public IPv6 address", async () => {
    const { fetchImpl, calls } = fetchSpy(didDocument());
    const resolve = resolver(fetchImpl, {
      lookup: async () => [{ address: "2001:4860:4860:0000:0000:0000:0000:8888", family: 6 }],
    });

    await expect(resolve(DID, "key-1")).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("rejects a host segment with malformed percent-encoding", async () => {
    const { fetchImpl, calls } = fetchSpy(didDocument());
    const resolve = resolver(fetchImpl);

    await expect(resolve("did:web:%", "key-1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("enforces the content-length header before reading the body", async () => {
    const oversized = resolver(
      async () => new Response("{}", { status: 200, headers: { "content-length": "999999" } }),
      { maxBytes: 64 },
    );
    const invalid = resolver(
      async () => new Response("{}", { status: 200, headers: { "content-length": "not-a-number" } }),
      { maxBytes: 64 },
    );

    await expect(oversized(DID, "key-1")).resolves.toBeUndefined();
    await expect(invalid(DID, "key-1")).resolves.toBeUndefined();
  });

  it("caps a streamed body and handles a null body", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.close();
      },
    });
    const streamed = resolver(async () => new Response(stream), { maxBytes: 10 });
    const nullBody = resolver(async () => new Response(null, { status: 200 }));

    await expect(streamed(DID, "key-1")).resolves.toBeUndefined();
    await expect(nullBody(DID, "key-1")).resolves.toBeUndefined();
  });

  it("rejects JSON documents without the expected identity or verification method", async () => {
    const notAnObject = resolver(async () => new Response(JSON.stringify("hello"), { status: 200 }));
    const badMethod = resolver(fetchResponse(didDocument({ verificationMethod: [42] })));
    const noKeyMaterial = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1` }],
    })));

    await expect(notAnObject(DID, "key-1")).resolves.toBeUndefined();
    await expect(badMethod(DID, "key-1")).resolves.toBeUndefined();
    await expect(noKeyMaterial(DID, "key-1")).resolves.toBeUndefined();
  });

  it("rejects malformed multibase, base58 and hex key material", async () => {
    const invalidMultibase = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyMultibase: "z!!!" }],
    })));
    const shortMultibase = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyMultibase: "z3" }],
    })));
    const emptyBase58 = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyBase58: "" }],
    })));
    const invalidBase58 = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyBase58: "0" }],
    })));
    const leadingZeroBase58 = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyBase58: "11" }],
    })));
    const invalidHex = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyHex: "zz" }],
    })));
    const oddHex = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyHex: "abc" }],
    })));

    await expect(invalidMultibase(DID, "key-1")).resolves.toBeUndefined();
    await expect(shortMultibase(DID, "key-1")).resolves.toBeDefined();
    await expect(emptyBase58(DID, "key-1")).resolves.toBeUndefined();
    await expect(invalidBase58(DID, "key-1")).resolves.toBeUndefined();
    await expect(leadingZeroBase58(DID, "key-1")).resolves.toBeDefined();
    await expect(invalidHex(DID, "key-1")).resolves.toBeUndefined();
    await expect(oddHex(DID, "key-1")).resolves.toBeUndefined();
  });

  it("rejects malformed JWK key material", async () => {
    const wrongCurve = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyJwk: { crv: "P-384", x: "a", y: "b" } }],
    })));
    const nonStringCoords = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyJwk: { crv: "P-256", x: 1, y: 2 } }],
    })));
    const wrongLength = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyJwk: { crv: "P-256", x: "AAAA", y: "AAAA" } }],
    })));
    const invalidBase64 = resolver(fetchResponse(didDocument({
      verificationMethod: [{ id: `${DID}#key-1`, publicKeyJwk: { crv: "P-256", x: "!!!", y: "???", } }],
    })));

    await expect(wrongCurve(DID, "key-1")).resolves.toBeUndefined();
    await expect(nonStringCoords(DID, "key-1")).resolves.toBeUndefined();
    await expect(wrongLength(DID, "key-1")).resolves.toBeUndefined();
    await expect(invalidBase64(DID, "key-1")).resolves.toBeUndefined();
  });
});

function fetchSpy(document: unknown): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify(document), { status: 200 });
  };
  return { fetchImpl, calls };
}

import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SignerKeyInfo, SignerProvider, TrustStore } from "@credaryn/core";
import {
  CoseVerificationError,
  COSE_ALGORITHM_ES256,
  decodeCoseSign1,
  encodeCoseSign1Parts,
  createCoseSign1,
  MAX_COSE_OBJECT_BYTES,
  verifyCoseSign1,
} from "../src/cose.js";
import { encodeDeterministicCbor } from "../src/cbor.js";

function createSigner(issuerId = "acme-retail", keyId = "key-1"): {
  signer: SignerProvider;
  keyInfo: SignerKeyInfo;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keyInfo: SignerKeyInfo = {
    issuerId,
    keyId,
    algorithm: "ES256",
    publicKey: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  };
  return {
    keyInfo,
    signer: {
      getKeyInfo: async () => keyInfo,
      sign: async (input) => {
        const operation = createSign("SHA256");
        operation.update(input);
        return new Uint8Array(operation.sign(privateKey));
      },
    },
  };
}

function signerWithSignature(signature: Uint8Array, keyInfo: SignerKeyInfo): SignerProvider {
  return { getKeyInfo: async () => keyInfo, sign: async () => signature };
}

function derWithIntegers(r: Uint8Array, s: Uint8Array, longForm = false): Uint8Array {
  const body = [0x02, r.length, ...r, 0x02, s.length, ...s];
  return longForm
    ? Uint8Array.from([0x30, 0x81, body.length, ...body])
    : Uint8Array.from([0x30, body.length, ...body]);
}

describe("COSE_Sign1 structural validation", () => {
  it("rejects non-byte and oversized COSE input", () => {
    expect(() => decodeCoseSign1("x" as unknown as Uint8Array)).toThrow(CoseVerificationError);
    expect(() => decodeCoseSign1(new Uint8Array(MAX_COSE_OBJECT_BYTES + 1))).toThrow(/maximum/);
  });

  it("rejects a COSE array that is not a four-item array", () => {
    const twoItems = encodeDeterministicCbor([new Uint8Array(), new Map()]);

    expect(() => decodeCoseSign1(twoItems)).toThrow(/four-item/);
  });

  it.each([
    ["protected headers are not bytes", [0, new Map(), new Uint8Array(), new Uint8Array(64)]],
    ["unprotected headers are not a map", [new Uint8Array(), 0, new Uint8Array(), new Uint8Array(64)]],
    ["the payload is not bytes", [new Uint8Array(), new Map(), 0, new Uint8Array(64)]],
    ["the signature is not 64 bytes", [new Uint8Array(), new Map(), new Uint8Array(), new Uint8Array(63)]],
  ])("rejects a COSE object where %s", (_name, items) => {
    expect(() => decodeCoseSign1(encodeDeterministicCbor(items))).toThrow(CoseVerificationError);
  });

  it("rejects malformed protected headers", () => {
    const invalidCbor = encodeDeterministicCbor([
      new Uint8Array([0xff]),
      new Map(),
      new Uint8Array(),
      new Uint8Array(64),
    ]);
    const notAMap = encodeDeterministicCbor([encodeDeterministicCbor(1), new Map(), new Uint8Array(), new Uint8Array(64)]);
    const nonIntegerLabel = encodeDeterministicCbor([
      encodeDeterministicCbor(new Map([["label", 1]])),
      new Map(),
      new Uint8Array(),
      new Uint8Array(64),
    ]);

    expect(() => decodeCoseSign1(invalidCbor)).toThrow(/indefinite-length CBOR/);
    expect(() => decodeCoseSign1(notAMap)).toThrow(/protected headers must be a map/);
    expect(() => decodeCoseSign1(nonIntegerLabel)).toThrow(/integer labels/);
  });

  it("rejects algorithm, critical and key-id headers moved to the unprotected bucket", () => {
    for (const label of [1, 2, 4]) {
      const encoded = encodeCoseSign1Parts({
        protectedHeaders: new Map<number, unknown>(),
        unprotectedHeaders: new Map<number, unknown>([[label, new Uint8Array()]]),
        payload: new Uint8Array(),
        signature: new Uint8Array(64),
      });

      expect(() => decodeCoseSign1(encoded)).toThrow(/must be protected/);
    }
  });

  it("rejects invalid encode parts and oversized encodings", () => {
    expect(() => encodeCoseSign1Parts({
      protectedHeaders: new Map(),
      unprotectedHeaders: new Map(),
      payload: 0 as unknown as Uint8Array,
      signature: new Uint8Array(64),
    })).toThrow(/payload and signature must be byte strings/);

    expect(() => encodeCoseSign1Parts({
      protectedHeaders: new Map(),
      unprotectedHeaders: new Map(),
      payload: new Uint8Array(),
      signature: new Uint8Array(63),
    })).toThrow(/exactly 64 bytes/);

    expect(() => encodeCoseSign1Parts({
      protectedHeaders: new Map(),
      unprotectedHeaders: new Map(),
      payload: new Uint8Array(MAX_COSE_OBJECT_BYTES),
      signature: new Uint8Array(64),
    })).toThrow(/maximum/);
  });

  it("returns an invalid result when the COSE object cannot be decoded", async () => {
    await expect(verifyCoseSign1(new Uint8Array([0x01]), { issuerId: "acme-retail" })).resolves.toMatchObject({
      cryptographicValidity: "INVALID",
      trustDecision: "MISSING",
      payload: new Uint8Array(),
    });
  });
});

describe("COSE_Sign1 verification failure paths", () => {
  it("returns unverifiable when the trust store throws", async () => {
    const { signer } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("payload"), signer);
    const trustStore: TrustStore = {
      resolve: async () => {
        throw new Error("trust store offline");
      },
    };

    await expect(verifyCoseSign1(cose, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
      cryptographicValidity: "UNVERIFIABLE",
    });
  });

  it("returns unverifiable when fingerprint fallback throws", async () => {
    const { signer } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("payload"), signer);
    const trustStore: TrustStore = {
      resolve: async () => undefined,
      resolveByFingerprint: async () => {
        throw new Error("fingerprint store offline");
      },
    };

    await expect(verifyCoseSign1(cose, {
      issuerId: "acme-retail",
      trustStore,
      certificateFingerprint: "sha256:missing",
    })).resolves.toMatchObject({ cryptographicValidity: "UNVERIFIABLE" });
  });

  it("returns unverifiable for an unknown key or a non-ES256 key", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("payload"), signer);

    await expect(verifyCoseSign1(cose, {
      issuerId: "acme-retail",
      trustStore: { resolve: async () => undefined },
      certificateFingerprint: "sha256:missing",
    })).resolves.toMatchObject({ cryptographicValidity: "UNVERIFIABLE" });

    await expect(verifyCoseSign1(cose, {
      issuerId: "acme-retail",
      trustStore: { resolve: async () => ({ ...keyInfo, algorithm: "RS256" as "ES256" }) },
    })).resolves.toMatchObject({ cryptographicValidity: "UNVERIFIABLE" });
  });

  it("returns invalid when the trusted public key cannot be parsed", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("payload"), signer);

    await expect(verifyCoseSign1(cose, {
      issuerId: "acme-retail",
      trustStore: { resolve: async () => ({ ...keyInfo, publicKey: new Uint8Array([1, 2, 3]) }) },
    })).resolves.toMatchObject({ cryptographicValidity: "INVALID" });
  });

  it("returns unverifiable when the explicit trust decision throws", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("payload"), signer);

    await expect(verifyCoseSign1(cose, {
      issuerId: "acme-retail",
      trustStore: {
        resolve: async () => keyInfo,
        isTrusted: async () => {
          throw new Error("trust decision offline");
        },
      },
    })).resolves.toMatchObject({ cryptographicValidity: "UNVERIFIABLE" });
  });

  it("rejects empty and non-UTF-8 key identifiers", async () => {
    const { signer, keyInfo } = createSigner();
    const valid = await createCoseSign1(new TextEncoder().encode("payload"), signer);
    const parts = decodeCoseSign1(valid);
    const trustStore: TrustStore = { resolve: async () => keyInfo };

    for (const keyId of [new Uint8Array(), new Uint8Array([0xff])]) {
      const tampered = encodeCoseSign1Parts({
        ...parts,
        protectedHeaders: new Map<number, unknown>([[1, COSE_ALGORITHM_ES256], [4, keyId]]),
      });

      await expect(verifyCoseSign1(tampered, { issuerId: "acme-retail", trustStore })).resolves.toMatchObject({
        cryptographicValidity: "INVALID",
      });
    }
  });
});

describe("COSE_Sign1 signer key handling", () => {
  it("rejects unsupported algorithms and empty key IDs at signing", async () => {
    const { keyInfo } = createSigner();
    const payload = new TextEncoder().encode("payload");

    await expect(createCoseSign1(payload, signerWithSignature(new Uint8Array(64), {
      ...keyInfo,
      algorithm: "RS256" as "ES256",
    }))).rejects.toThrow(/only supports ES256/);

    await expect(createCoseSign1(payload, signerWithSignature(new Uint8Array(64), {
      ...keyInfo,
      keyId: "  ",
    }))).rejects.toThrow(/non-empty key ID/);
  });
});

describe("COSE_Sign1 DER signature conversion", () => {
  it("rejects a signature that is not DER encoded", async () => {
    const { keyInfo } = createSigner();
    const badSignature = Uint8Array.from([0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

    await expect(createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(badSignature, keyInfo)))
      .rejects.toThrow(/DER-encoded/);
  });

  it("rejects a DER sequence length that does not match", async () => {
    const { keyInfo } = createSigner();
    const badSignature = Uint8Array.from([0x30, 0x05, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

    await expect(createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(badSignature, keyInfo)))
      .rejects.toThrow(/DER signature length/);
  });

  it("rejects a DER integer with the wrong tag or an overlong length", async () => {
    const { keyInfo } = createSigner();
    const wrongTag = Uint8Array.from([0x30, 0x06, 0x03, 0x01, 0x01, 0x02, 0x01, 0x02]);
    const overlong = Uint8Array.from([0x30, 0x06, 0x02, 0x7f, 0x01, 0x02, 0x01, 0x02]);

    await expect(createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(wrongTag, keyInfo)))
      .rejects.toThrow(/DER ECDSA integer/);
    await expect(createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(overlong, keyInfo)))
      .rejects.toThrow(/DER ECDSA integer length/);
  });

  it("rejects a DER integer larger than 32 bytes", async () => {
    const { keyInfo } = createSigner();
    const oversized = derWithIntegers(new Uint8Array(33).fill(0x01), new Uint8Array([0x01]));

    await expect(createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(oversized, keyInfo)))
      .rejects.toThrow(/exceeds 32 bytes/);
  });

  it("accepts a DER signature with a long-form sequence length", async () => {
    const { keyInfo } = createSigner();
    const longForm = derWithIntegers(new Uint8Array(32).fill(0x01), new Uint8Array(32).fill(0x02), true);
    const cose = await createCoseSign1(new TextEncoder().encode("p"), signerWithSignature(longForm, keyInfo));

    expect(decodeCoseSign1(cose).signature).toHaveLength(64);
  });

  it("normalizes a raw signature whose leading bytes are zero", async () => {
    const { signer, keyInfo } = createSigner();
    const cose = await createCoseSign1(new TextEncoder().encode("p"), signer);
    const parts = decodeCoseSign1(cose);
    const zeroLed = new Uint8Array(64);
    zeroLed[0] = 0;
    zeroLed[31] = 0;
    const tampered = encodeCoseSign1Parts({ ...parts, signature: zeroLed });

    await expect(verifyCoseSign1(tampered, {
      issuerId: "acme-retail",
      trustStore: { resolve: async () => keyInfo },
    })).resolves.toMatchObject({ cryptographicValidity: "INVALID" });
  });
});

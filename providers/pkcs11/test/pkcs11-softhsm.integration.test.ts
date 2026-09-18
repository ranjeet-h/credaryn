import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Pkcs11Signer, type Pkcs11Client } from "../src/pkcs11-signer.js";

// Opt-in SoftHSM2 integration checkpoint.
//
// D-4 / spec §19: the repository deliberately does NOT depend on a low-level
// Node PKCS#11 library (`pkcs11js`, `graphene-pk11`, ...). A native SoftHSM
// client therefore cannot be constructed from dependencies checked into this
// repository, so the real-token checkpoint is owner-run and skipped by default.
//
// To run it:
//   1. docker compose -f providers/pkcs11/docker-compose.soft-hsm.yml up -d
//   2. install a native PKCS#11 client in the host environment and expose a
//      factory module that returns the injected `Pkcs11Client` boundary
//      (see the contract below);
//   3. CREDARYN_SOFTHSM_TEST=1 CREDARYN_SOFTHSM_CLIENT=/abs/path/client.mjs \
//        ./node_modules/.bin/vitest providers/pkcs11/test/pkcs11-softhsm.integration.test.ts --run
//
// The factory module must export `createClient(config)` or a default function
// returning a `Pkcs11Client`. It receives the token directory parsed from
// `providers/pkcs11/softhsm2.conf` and owns the native module path, PIN and key
// label. The repository never reads credentials or claims the checkpoint passed.
type SoftHsmClientFactory = (config: { readonly tokenDirectory: string }) => Pkcs11Client | Promise<Pkcs11Client>;

const SOFTHSM_CONF_URL = new URL("../softhsm2.conf", import.meta.url);
const OPT_IN = process.env.CREDARYN_SOFTHSM_TEST === "1";

describe("PKCS#11 SoftHSM configuration", () => {
  it("declares a file-backed token directory for SoftHSM2", async () => {
    const conf = await readFile(SOFTHSM_CONF_URL, "utf8");
    expect(parseTokenDirectory(conf)).toBe("/var/lib/softhsm/tokens");
  });
});

const clientFactory = OPT_IN ? await loadClientFactory(process.env.CREDARYN_SOFTHSM_CLIENT) : undefined;

describe.skipIf(clientFactory === undefined)("PKCS#11 SoftHSM2 integration (opt-in)", () => {
  it("signs through the adapter with a SoftHSM-backed injected client", async () => {
    const conf = await readFile(SOFTHSM_CONF_URL, "utf8");
    const client = await clientFactory!({ tokenDirectory: parseTokenDirectory(conf) });
    const signer = new Pkcs11Signer({ client });

    const keyInfo = await signer.getKeyInfo();
    expect(keyInfo.algorithm).toBe("ES256");
    expect(keyInfo.publicKey.byteLength).toBeGreaterThan(0);
    expect(Object.hasOwn(keyInfo, "privateKey")).toBe(false);

    const health = await signer.healthCheck();
    expect(health).toMatchObject({ provider: "pkcs11", status: "HEALTHY" });

    const signature = await signer.sign(new Uint8Array([1, 2, 3]));
    expect(isEs256Signature(signature)).toBe(true);
  });
});

async function loadClientFactory(modulePath: string | undefined): Promise<SoftHsmClientFactory | undefined> {
  if (modulePath === undefined) return undefined;
  try {
    const imported = (await import(modulePath)) as {
      createClient?: SoftHsmClientFactory;
      default?: SoftHsmClientFactory;
    };
    return imported.createClient ?? imported.default;
  } catch {
    return undefined;
  }
}

function parseTokenDirectory(conf: string): string {
  const line = conf.split(/\r?\n/).find((candidate) => candidate.trim().startsWith("directories.tokendir"));
  if (line === undefined) throw new Error("softhsm2.conf must declare directories.tokendir");
  const value = line.slice(line.indexOf("=") + 1).trim();
  if (value === "") throw new Error("softhsm2.conf token directory is empty");
  return value;
}

function isEs256Signature(signature: Uint8Array): boolean {
  // SoftHSM2 returns raw r||s; the COSE layer also accepts canonical DER.
  if (signature.length === 64) return true;
  return signature[0] === 0x30 && signature.length > 8;
}

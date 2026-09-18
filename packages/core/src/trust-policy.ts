import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { TrustDecision } from "./policy.js";
import type { SignerKeyInfo } from "./signer.js";
import type { TrustStore } from "./trust.js";

export type TrustPolicyFreshness = "FRESH" | "STALE" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type TrustMaterialSource = "ENTERPRISE_ANCHOR" | "X509_CHAIN" | "DID_WEB_DOMAIN" | "UNCONFIGURED";

export interface X509TrustAnchor {
  issuerId: string;
  certificateFingerprint: string;
}

export interface RemoteTrustMaterial {
  key: SignerKeyInfo;
  url: string;
  fetchedAt: string;
  source: "fetched" | "did-web";
}

export type TrustResolver = (issuerId: string, keyId: string) => Promise<RemoteTrustMaterial | undefined>;

export interface TrustPolicyOptions {
  configuredKeys?: readonly SignerKeyInfo[];
  x509Anchors?: readonly X509TrustAnchor[];
  resolver?: TrustResolver;
  allowedDidWebDomains?: readonly string[];
  maxCacheAgeMs?: number;
  requireFreshness?: boolean;
  now?: () => number;
}

export interface TrustPolicyInput {
  issuerId: string;
  keyId: string;
}

export interface TrustPolicyResult {
  trustDecision: TrustDecision;
  trustSource: TrustMaterialSource;
  freshness: TrustPolicyFreshness;
  key?: SignerKeyInfo;
  evidence: string;
}

interface ResolvedDecision {
  key: SignerKeyInfo;
  decision: TrustPolicyResult;
}

export class TrustPolicy implements TrustStore {
  readonly trustSource = "trust-policy";
  private readonly configuredKeys: readonly SignerKeyInfo[];
  private readonly x509Anchors: readonly X509TrustAnchor[];
  private readonly resolver: TrustResolver | undefined;
  private readonly allowedDidWebDomains: readonly string[];
  private readonly maxCacheAgeMs: number | undefined;
  private readonly requireFreshness: boolean;
  private readonly now: () => number;
  private readonly lastResolved = new Map<string, ResolvedDecision>();

  constructor(options: TrustPolicyOptions = {}) {
    this.configuredKeys = options.configuredKeys ?? [];
    this.x509Anchors = options.x509Anchors ?? [];
    this.resolver = options.resolver;
    this.allowedDidWebDomains = options.allowedDidWebDomains ?? [];
    this.maxCacheAgeMs = options.maxCacheAgeMs;
    this.requireFreshness = options.requireFreshness ?? false;
    this.now = options.now ?? Date.now;
  }

  async evaluate(input: TrustPolicyInput): Promise<TrustPolicyResult> {
    const configured = this.configuredKeys.find((key) => matchesKey(key, input));
    if (configured !== undefined) {
      return remember(input, configured, {
        trustDecision: "TRUSTED",
        trustSource: "ENTERPRISE_ANCHOR",
        freshness: "NOT_APPLICABLE",
        key: configured,
        evidence: "The key is explicitly configured in the local trust policy",
      }, this.lastResolved);
    }

    if (this.resolver === undefined) return untrusted(input, this.lastResolved, "No configured or bounded trust resolver returned this key");

    let remote: RemoteTrustMaterial | undefined;
    try {
      remote = await this.resolver(input.issuerId, input.keyId);
    } catch {
      return untrusted(input, this.lastResolved, "Trust resolver is unavailable", "UNAVAILABLE");
    }
    if (remote === undefined || !matchesKey(remote.key, input)) {
      return untrusted(input, this.lastResolved, "Trust resolver did not return the requested key");
    }

    const freshness = this.freshness(remote.fetchedAt);
    const anchor = this.x509Anchors.find((candidate) => candidate.issuerId === remote.key.issuerId
      && candidate.certificateFingerprint === remote.key.certificateFingerprint);
    const secureUrl = isHttpsUrl(remote.url);
    const validDidWeb = remote.source === "did-web" && secureUrl && isAllowedDidWebDomain(remote.url, this.allowedDidWebDomains);
    const validAnchor = anchor !== undefined && secureUrl;
    const trusted = validAnchor || (validDidWeb && freshness !== "STALE" && freshness !== "UNAVAILABLE");
    const source: TrustMaterialSource = validAnchor ? "X509_CHAIN" : validDidWeb ? "DID_WEB_DOMAIN" : "UNCONFIGURED";
    const decision: TrustPolicyResult = {
      trustDecision: trusted && !(this.requireFreshness && freshness !== "FRESH") ? "TRUSTED" : "UNTRUSTED",
      trustSource: source,
      freshness,
      key: remote.key,
      evidence: trusted ? "The key satisfied the configured trust policy" : "The key was resolved but did not satisfy the configured trust policy",
    };
    return remember(input, remote.key, decision, this.lastResolved);
  }

  async resolve(keyId: string, issuerId: string): Promise<SignerKeyInfo | undefined> {
    const decision = await this.evaluate({ keyId, issuerId });
    return decision.key;
  }

  resolveByFingerprint(certificateFingerprint: string): SignerKeyInfo | undefined {
    if (certificateFingerprint.trim() === "") return undefined;
    const configured = this.configuredKeys.find((key) => key.certificateFingerprint === certificateFingerprint);
    if (configured !== undefined) return configured;
    for (const remembered of this.lastResolved.values()) {
      if (remembered.key.certificateFingerprint === certificateFingerprint) return remembered.key;
    }
    return undefined;
  }

  isTrusted(keyInfo: SignerKeyInfo): boolean {
    const remembered = this.lastResolved.get(reference(keyInfo.issuerId, keyInfo.keyId));
    if (remembered !== undefined) return remembered.decision.trustDecision === "TRUSTED";
    return this.configuredKeys.some((key) => sameKey(key, keyInfo))
      || this.x509Anchors.some((anchor) => anchor.issuerId === keyInfo.issuerId
        && anchor.certificateFingerprint === keyInfo.certificateFingerprint);
  }

  private freshness(fetchedAt: string): TrustPolicyFreshness {
    if (this.maxCacheAgeMs === undefined) return "FRESH";
    const fetched = Date.parse(fetchedAt);
    if (!Number.isFinite(fetched)) return "UNAVAILABLE";
    return this.now() - fetched <= this.maxCacheAgeMs ? "FRESH" : "STALE";
  }
}

function matchesKey(key: SignerKeyInfo, input: TrustPolicyInput): boolean {
  return key.issuerId === input.issuerId && key.keyId === input.keyId;
}

function sameKey(left: SignerKeyInfo, right: SignerKeyInfo): boolean {
  return matchesKey(left, right) && left.certificateFingerprint === right.certificateFingerprint;
}

function reference(issuerId: string, keyId: string): string {
  return `${issuerId}\u0000${keyId}`;
}

function remember(
  input: TrustPolicyInput,
  key: SignerKeyInfo,
  decision: TrustPolicyResult,
  remembered: Map<string, ResolvedDecision>,
): TrustPolicyResult {
  remembered.set(reference(input.issuerId, input.keyId), { key, decision });
  return decision;
}

function untrusted(
  input: TrustPolicyInput,
  remembered: Map<string, ResolvedDecision>,
  evidence: string,
  freshness: TrustPolicyFreshness = "NOT_APPLICABLE",
): TrustPolicyResult {
  const decision: TrustPolicyResult = {
    trustDecision: "UNTRUSTED",
    trustSource: "UNCONFIGURED",
    freshness,
    evidence,
  };
  remembered.delete(reference(input.issuerId, input.keyId));
  return decision;
}

function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedDidWebDomain(url: string, domains: readonly string[]): boolean {
  try {
    return isAllowedDomain(new URL(url).hostname, domains);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedDomain(hostname: string, domains: readonly string[]): boolean {
  const lowered = hostname.toLowerCase();
  return domains.some((domain) => {
    const allowed = domain.trim().toLowerCase();
    return allowed !== "" && (lowered === allowed || lowered.endsWith(`.${allowed}`));
  });
}

export const DEFAULT_DID_WEB_MAX_BYTES = 262_144;

export interface DidWebResolvedAddress {
  address: string;
  family: number;
}

export type DidWebLookup = (hostname: string) => Promise<readonly DidWebResolvedAddress[]>;

const defaultDidWebLookup: DidWebLookup = async (hostname) =>
  dnsLookup(hostname, { all: true });

export interface DidWebResolverOptions {
  fetchImpl?: typeof fetch;
  allowedDomains: readonly string[];
  maxBytes?: number;
  /**
   * Hostname resolver used to reject names that resolve to private, loopback,
   * link-local, multicast or unspecified addresses. Defaults to
   * `node:dns/promises` `lookup({ all: true })`; injectable for tests.
   */
  lookup?: DidWebLookup;
}

/**
 * Builds a bounded, fail-closed did:web resolver for the trust policy.
 *
 * SSRF controls:
 * - the DID's domain must appear in `allowedDomains` *before* any network call;
 * - IP-literal hosts (IPv4, bracketed/IPv6) are rejected: did:web must name a DNS host;
 * - only `https:` URLs on the default port are constructed; credentials, redirects,
 *   query strings and fragments are rejected;
 * - the hostname is resolved with `dns.lookup({ all: true })` *before* the fetch and
 *   every returned address must be a public unicast address;
 * - the response body is capped at `maxBytes` (default 256 KiB) using both the
 *   `content-length` header and a streaming byte count.
 *
 * Residual limitation: this is a resolve-then-connect check, so a name that changes
 * its DNS answers between our lookup and the TLS connection (DNS rebinding) can still
 * be pointed at a private address. True pinning requires connecting to the checked IP
 * while preserving the SNI/Host header (a custom `undici` dispatcher or an
 * `https.Agent` with a fixed `lookup`), which is intentionally out of scope here.
 *
 * A resolved key is material only; {@link TrustPolicy} still decides trust.
 */
export function createDidWebResolver(options: DidWebResolverOptions): TrustResolver {
  const fetchImpl = options.fetchImpl
    ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
  const allowedDomains = options.allowedDomains;
  const maxBytes = options.maxBytes ?? DEFAULT_DID_WEB_MAX_BYTES;
  const lookup = options.lookup ?? defaultDidWebLookup;
  const decoder = new TextDecoder();

  return async (issuerId, keyId) => {
    if (fetchImpl === undefined) return undefined;
    const url = resolveDidWebUrl(issuerId, allowedDomains);
    if (url === undefined) return undefined;
    const hostname = hostnameFromUrl(url);
    if (hostname === undefined || !(await resolvesToPublicAddress(hostname, lookup))) return undefined;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: { accept: "application/did+json, application/json" },
      });
    } catch {
      return undefined;
    }
    if (!response.ok) return undefined;

    const bytes = await readBoundedBody(response, maxBytes);
    if (bytes === undefined) return undefined;

    let document: unknown;
    try {
      document = JSON.parse(decoder.decode(bytes));
    } catch {
      return undefined;
    }

    const key = didDocumentSignerKey(document, issuerId, keyId);
    if (key === undefined) return undefined;
    return { key, url, fetchedAt: new Date().toISOString(), source: "did-web" };
  };
}

function resolveDidWebUrl(issuerId: string, allowedDomains: readonly string[]): string | undefined {
  if (!issuerId.startsWith("did:web:")) return undefined;
  const segments = issuerId.slice("did:web:".length).split(":");
  const hostSegment = segments[0];
  if (hostSegment === undefined) return undefined;
  const host = decodeDidWebSegment(hostSegment);
  if (host === undefined || host === "" || /[\s/?#@\\]/.test(host)) return undefined;
  // did:web names a DNS host; IP literals (IPv4 and bracketed/IPv6) are not acceptable.
  if (isIpLiteral(host)) return undefined;

  const pathSegments: string[] = [];
  for (const segment of segments.slice(1)) {
    const decoded = decodeDidWebSegment(segment);
    if (decoded === undefined || decoded === "" || decoded === "." || decoded === ".."
      || /[/\\?#]/.test(decoded)) return undefined;
    pathSegments.push(decoded);
  }

  const candidate = pathSegments.length === 0
    ? `https://${host}/.well-known/did.json`
    : `https://${host}/${pathSegments.join("/")}/did.json`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  if (parsed.username !== "" || parsed.password !== "") return undefined;
  // Only the default HTTPS port is permitted; the host segment may encode `host:port`.
  if (parsed.port !== "" || parsed.search !== "" || parsed.hash !== "") return undefined;
  if (!isAllowedDomain(parsed.hostname, allowedDomains)) return undefined;
  return parsed.href;
}

function hostnameFromUrl(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "" ? undefined : hostname;
  } catch {
    return undefined;
  }
}

async function resolvesToPublicAddress(hostname: string, lookup: DidWebLookup): Promise<boolean> {
  let addresses: readonly DidWebResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return false;
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return false;
  return addresses.every((entry) =>
    typeof entry?.address === "string" && entry.address !== "" && !isPrivateAddress(entry.address));
}

function isIpLiteral(host: string): boolean {
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return isIP(bare) !== 0;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) {
    const bytes = ipv6ToBytes(address);
    return bytes === undefined ? true : isPrivateIpv6(bytes);
  }
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 (this network / unspecified)
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv6ToBytes(address: string): number[] | undefined {
  let value = address;
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);

  const lastColon = value.lastIndexOf(":");
  if (lastColon !== -1 && value.slice(lastColon + 1).includes(".")) {
    const parts = value.slice(lastColon + 1).split(".");
    if (parts.length !== 4) return undefined;
    const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
    const high = (((octets[0]! << 8) | octets[1]!) >>> 0).toString(16).padStart(4, "0");
    const low = (((octets[2]! << 8) | octets[3]!) >>> 0).toString(16).padStart(4, "0");
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const parseGroups = (segment: string): number[] | undefined => {
    if (segment === "") return [];
    const groups: number[] = [];
    for (const group of segment.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return undefined;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };
  const left = parseGroups(halves[0]!);
  if (left === undefined) return undefined;
  let groups: number[];
  if (halves.length === 2) {
    const right = parseGroups(halves[1]!);
    if (right === undefined) return undefined;
    const missing = 8 - left.length - right.length;
    if (missing < 0) return undefined;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return undefined;
  const bytes: number[] = [];
  for (const group of groups) bytes.push((group >> 8) & 0xff, group & 0xff);
  return bytes;
}

function isPrivateIpv6(bytes: readonly number[]): boolean {
  if (bytes.length !== 16) return true;
  if (bytes.every((byte) => byte === 0)) return true; // unspecified ::
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 0x01) return true; // loopback ::1
  if ((bytes[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (bytes[0] === 0xff) return true; // multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`); // IPv4-mapped ::ffff:0:0/96
  }
  return false;
}

function decodeDidWebSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) return undefined;
  }

  const body = response.body;
  if (body === null || body === undefined) {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > maxBytes ? undefined : new Uint8Array(buffer);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function didDocumentSignerKey(
  document: unknown,
  did: string,
  requestedKeyId: string,
): SignerKeyInfo | undefined {
  if (!isRecord(document)) return undefined;
  const documentId = typeof document.id === "string" ? document.id : undefined;
  if (documentId !== undefined && documentId !== did) return undefined;

  const methods = Array.isArray(document.verificationMethod) ? document.verificationMethod : [];
  const requestedFragment = fragment(requestedKeyId) || requestedKeyId;
  const match = methods.find((method) => {
    if (!isRecord(method) || typeof method.id !== "string") return false;
    return method.id === requestedKeyId
      || (requestedFragment !== "" && fragment(method.id) === requestedFragment);
  });
  if (!isRecord(match) || typeof match.id !== "string") return undefined;

  const publicKey = extractPublicKey(match);
  if (publicKey === undefined) return undefined;
  const keyId = requestedKeyId !== "" ? requestedKeyId : fragment(match.id);
  return { issuerId: did, keyId, algorithm: "ES256", publicKey };
}

function fragment(reference: string): string {
  const index = reference.indexOf("#");
  return index === -1 ? "" : reference.slice(index + 1);
}

function extractPublicKey(method: Record<string, unknown>): Uint8Array | undefined {
  const jwk = method.publicKeyJwk;
  if (isRecord(jwk)) {
    const key = keyFromJwk(jwk);
    if (key !== undefined) return key;
  }
  if (typeof method.publicKeyMultibase === "string") {
    const decoded = decodeBase58(method.publicKeyMultibase.slice(1));
    if (decoded === undefined) return undefined;
    // Strip the multicodec p256-pub varint prefix (0x1200 -> [0x80, 0x24]).
    if (decoded.length === 35 && decoded[0] === 0x80 && decoded[1] === 0x24) return decoded.slice(2);
    return decoded;
  }
  if (typeof method.publicKeyBase58 === "string") return decodeBase58(method.publicKeyBase58);
  if (typeof method.publicKeyHex === "string") return decodeHex(method.publicKeyHex);
  return undefined;
}

function keyFromJwk(jwk: Record<string, unknown>): Uint8Array | undefined {
  if (jwk.crv !== "P-256") return undefined;
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") return undefined;
  const x = decodeBase64Url(jwk.x);
  const y = decodeBase64Url(jwk.y);
  if (x === undefined || y === undefined || x.length !== 32 || y.length !== 32) return undefined;
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);
  return uncompressed;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(value: string): Uint8Array | undefined {
  if (value === "") return undefined;
  let numeric = 0n;
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) return undefined;
    numeric = numeric * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (numeric > 0n) {
    bytes.unshift(Number(numeric & 0xffn));
    numeric >>= 8n;
  }
  for (const character of value) {
    if (character === "1") bytes.unshift(0);
    else break;
  }
  return Uint8Array.from(bytes);
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

function decodeHex(value: string): Uint8Array | undefined {
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) return undefined;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

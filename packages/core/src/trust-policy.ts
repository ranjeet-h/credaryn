import type { TrustDecision } from "./policy.js";
import type { SignerKeyInfo } from "./signer.js";
import type { TrustStore } from "./trust.js";

export type TrustPolicyFreshness = "FRESH" | "STALE" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type TrustMaterialSource = "configured-public-key" | "x509-anchor" | "did-web" | "none";

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
        trustSource: "configured-public-key",
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
    const source: TrustMaterialSource = validAnchor ? "x509-anchor" : validDidWeb ? "did-web" : "none";
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
    trustSource: "none",
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
    const hostname = new URL(url).hostname;
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

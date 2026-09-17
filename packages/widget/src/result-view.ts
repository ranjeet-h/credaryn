import type { VerificationResult } from "@credaryn/core";

export interface ResultCard {
  label: string;
  value: string;
}

export interface ResultViewModel {
  verdict: string;
  cards: readonly ResultCard[];
  evidence: readonly string[];
}

export function toResultViewModel(result: VerificationResult): ResultViewModel {
  return {
    verdict: result.verdict,
    cards: [
      { label: "Cryptographic validity", value: result.cryptographicValidity },
      { label: "Issuer trust", value: result.trustDecision },
      { label: "Artifact integrity", value: result.artifactIntegrity ?? "NOT_SUPPLIED" },
      { label: "Signed claims", value: JSON.stringify(result.signedClaims ?? {}) },
      { label: "Lifecycle status", value: result.lifecycleStatus },
      { label: "Security mode", value: result.securityMode },
    ],
    evidence: result.evidence.map((item) => `${item.code}: ${item.message}`),
  };
}

export function renderResultView(model: ResultViewModel): string {
  const cards = model.cards.map((card) => `<div class="credaryn-result-card"><dt>${escapeHtml(card.label)}</dt><dd>${escapeHtml(card.value)}</dd></div>`).join("");
  const evidence = model.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="credaryn-result" aria-live="polite"><h2>${escapeHtml(model.verdict)}</h2><dl>${cards}</dl><ul>${evidence}</ul></section>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

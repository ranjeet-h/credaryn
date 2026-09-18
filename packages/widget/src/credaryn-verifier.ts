import type { VerificationResult } from "@credaryn/core";
import { renderResultView, toResultViewModel } from "./result-view.js";

const HTMLElementBase = (globalThis as unknown as { HTMLElement?: typeof HTMLElement }).HTMLElement ?? class {};

export class CredarynVerifierElement extends HTMLElementBase {
  private result?: VerificationResult;

  setResult(result: VerificationResult): void {
    this.result = result;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    if (this.result === undefined) return;
    const element = this as unknown as HTMLElement;
    const root = typeof element.attachShadow === "function"
      ? element.shadowRoot ?? element.attachShadow({ mode: "open" })
      : element;
    root.innerHTML = renderResultView(toResultViewModel(this.result));
  }
}

export function defineCredarynVerifier(tagName = "credaryn-verifier"): void {
  const registry = (globalThis as unknown as { customElements?: CustomElementRegistry }).customElements;
  if (registry !== undefined && registry.get(tagName) === undefined) {
    registry.define(tagName, CredarynVerifierElement as unknown as CustomElementConstructor);
  }
}

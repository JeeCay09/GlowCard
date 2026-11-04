const DOCS_URL = 'https://github.com/JeeCay09/GlowCard';

export interface CardInfo {
  /** Element name without the `custom:` prefix, e.g. `glowcard-switch`. */
  type: string;
  name: string;
  description: string;
}

/**
 * Defines the custom element (once) and lists the card in the Home Assistant card picker.
 * Safe to call twice, e.g. when the resource is loaded on more than one dashboard.
 */
export function registerCard(info: CardInfo, element: CustomElementConstructor): void {
  if (!info.type.startsWith('glowcard-')) {
    throw new Error(`GlowCard card types must start with "glowcard-": ${info.type}`);
  }
  if (!customElements.get(info.type)) {
    customElements.define(info.type, element);
  }
  window.customCards = window.customCards ?? [];
  if (!window.customCards.some((c) => c.type === info.type)) {
    window.customCards.push({ ...info, preview: true, documentationURL: DOCS_URL });
  }
}

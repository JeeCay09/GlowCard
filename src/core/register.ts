const DOCS_URL = 'https://github.com/JeeCay09/GlowCard';

export interface CardInfo {
  /** Element name without the `custom:` prefix, e.g. `glowcard-switch`. */
  type: string;
  name: string;
  description: string;
  /**
   * Entity domains the card is made for. HA's "by entity" tab then lists the card
   * as a suggestion for such an entity and creates it with that entity filled in.
   */
  domains?: string[];
}

/** HA's card suggestion for a picked entity (`getEntitySuggestion` in `window.customCards`). */
function entitySuggestion(type: string, domains: string[]) {
  return (_hass: unknown, entityId: string) =>
    domains.includes(entityId.split('.')[0])
      ? { config: { type: `custom:${type}`, entity: entityId } }
      : null;
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
    const { domains, ...entry } = info;
    window.customCards.push({
      ...entry,
      preview: true,
      documentationURL: DOCS_URL,
      ...(domains?.length ? { getEntitySuggestion: entitySuggestion(info.type, domains) } : {}),
    });
  }
}

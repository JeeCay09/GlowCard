import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { fireEvent } from '../core/fire-event';

export interface Swatch {
  name: string;
  /** Hex colour, e.g. #FFC872. */
  color: string;
}

/** Colour presets from the light popup mockup. */
export const LIGHT_SWATCHES: Swatch[] = [
  { name: 'Warmweiß', color: '#FFC872' },
  { name: 'Neutralweiß', color: '#FFE7C2' },
  { name: 'Kaltweiß', color: '#CFE0FF' },
  { name: 'Amber', color: '#F5A524' },
  { name: 'Koralle', color: '#F26B3A' },
  { name: 'Violett', color: '#8B5CF6' },
  { name: 'Blau', color: '#3B82F6' },
];

/**
 * Row of 36 px colour circles; the selected one gets a ring and a glow in its colour.
 * Fires `value-changed` with `{ value: Swatch }`.
 */
export class GlowSwatches extends LitElement {
  @property({ attribute: false }) swatches: Swatch[] = LIGHT_SWATCHES;
  /** Name of the selected swatch. */
  @property() selected = '';

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 0 4px;
    }
    button {
      all: unset;
      box-sizing: border-box;
      width: 36px;
      height: 36px;
      border-radius: 999px;
      cursor: pointer;
      background: var(--c);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
      transition: box-shadow 0.2s;
    }
    button[aria-pressed='true'] {
      box-shadow:
        0 0 0 3px var(--glow-knob-ring),
        0 0 0 5px var(--c),
        0 0 18px var(--c);
    }
    button:focus-visible {
      outline: 2px solid var(--glow-text);
      outline-offset: 6px;
    }
  `;

  render() {
    return html`<div class="row">
      ${this.swatches.map(
        (s) =>
          html`<button
            style="--c:${s.color}"
            aria-label=${s.name}
            aria-pressed=${s.name === this.selected ? 'true' : 'false'}
            @click=${() => {
              this.selected = s.name;
              fireEvent(this, 'value-changed', { value: s });
            }}
          ></button>`,
      )}
    </div>`;
  }
}

defineOnce('glowcard-swatches', GlowSwatches);

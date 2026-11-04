import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { fireEvent } from '../core/fire-event';

/**
 * Segmented pill from the popups (e.g. Helligkeit / Farbtemperatur / Farbe).
 * Fires `value-changed` with `{ value }`. `highlight` gives the selected segment the
 * accent colour with glow (mode switches like Heizen/Kühlen).
 */
export class GlowSegments extends LitElement {
  @property({ attribute: false }) options: { value: string; label: string }[] = [];
  @property() value = '';
  @property({ type: Boolean, reflect: true }) highlight = false;

  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      display: flex;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: var(--glow-inset);
    }
    button {
      all: unset;
      box-sizing: border-box;
      flex: 1 1 0;
      height: 34px;
      border-radius: 999px;
      text-align: center;
      font: 700 12px var(--glow-font);
      color: var(--glow-muted);
      cursor: pointer;
      transition:
        background 0.2s,
        color 0.2s;
    }
    button:focus-visible {
      outline: 2px solid rgb(var(--glow-accent));
    }
    button[aria-pressed='true'] {
      background: var(--glow-tab-active);
      color: var(--glow-text);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }
    :host([highlight]) button[aria-pressed='true'] {
      background: rgb(var(--glow-accent));
      color: #fff;
      box-shadow: 0 0 16px rgba(var(--glow-accent), 0.6);
    }
  `;

  render() {
    return html`<div class="wrap">
      ${this.options.map(
        (o) =>
          html`<button
            aria-pressed=${o.value === this.value ? 'true' : 'false'}
            @click=${() => {
              this.value = o.value;
              fireEvent(this, 'value-changed', { value: o.value });
            }}
          >
            ${o.label}
          </button>`,
      )}
    </div>`;
  }
}

defineOnce('glowcard-segments', GlowSegments);

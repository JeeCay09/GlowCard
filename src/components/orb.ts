import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';

/** Round icon "orb": neutral glass when off, radial gradient with glow when active. */
export class GlowOrb extends LitElement {
  @property() icon = '';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Number }) size = 44;
  @property() label = '';

  // Tokens (--glow-*) are inherited from the card around the orb.
  static styles = [
    css`
      :host {
        display: inline-flex;
        -webkit-tap-highlight-color: transparent;
      }
      button {
        all: unset;
        box-sizing: border-box;
        display: grid;
        place-items: center;
        border-radius: 50%;
        cursor: pointer;
        color: var(--glow-text-2);
        background: var(--glow-track);
        border: 1px solid var(--glow-border);
        transition:
          background 240ms ease,
          box-shadow 240ms ease,
          color 240ms ease,
          transform 120ms ease;
      }
      button:active {
        transform: scale(0.94);
      }
      button:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: 3px;
      }
      :host([active]) button {
        color: #fff;
        border-color: rgb(255 255 255 / 0.35);
        background: radial-gradient(
          circle at 35% 30%,
          rgb(255 255 255 / 0.55),
          rgb(var(--glow-accent)) 45%,
          rgb(var(--glow-accent) / 0.85) 100%
        );
        box-shadow:
          0 0 0 4px rgb(var(--glow-accent) / 0.14),
          0 6px 22px rgb(var(--glow-accent) / var(--glow-glow));
      }
      ha-icon {
        --mdc-icon-size: calc(var(--orb-size) * 0.5);
        display: flex;
      }
    `,
  ];

  render() {
    return html`<button
      style="width:${this.size}px;height:${this.size}px;--orb-size:${this.size}px"
      aria-label=${this.label}
      aria-pressed=${this.active ? 'true' : 'false'}
    >
      <ha-icon .icon=${this.icon}></ha-icon>
    </button>`;
  }
}

defineOnce('glowcard-orb', GlowOrb);

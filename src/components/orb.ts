import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';

/**
 * Round icon "orb" (mockup: 52 px). Off: inset background, muted icon.
 * On: radial gradient with a white highlight and a glow in the accent colour.
 * `dark-icon` switches the icon to #3A2504 for very light colours (e.g. warm white).
 * Tokens (--glow-*) are inherited from the card or popup around it.
 */
export class GlowOrb extends LitElement {
  @property() icon = '';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true, attribute: 'dark-icon' }) darkIcon = false;
  @property({ type: Number }) size = 52;
  @property() label = '';

  static styles = css`
    :host {
      display: inline-flex;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }
    button {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      cursor: pointer;
      background: var(--glow-inset);
      color: var(--glow-muted);
      transition:
        box-shadow 0.2s,
        background 0.2s,
        transform 0.12s;
    }
    button:active {
      transform: scale(0.95);
    }
    button:focus-visible {
      outline: 2px solid rgb(var(--glow-accent));
      outline-offset: 3px;
    }
    :host([active]) button {
      background: radial-gradient(
        circle at 35% 30%,
        rgba(255, 255, 255, 0.6),
        rgb(var(--glow-accent)) 62%
      );
      box-shadow: var(--glow-orb-glow);
      color: #ffffff;
    }
    :host([active][dark-icon]) button {
      color: #3a2504;
    }
    ha-icon {
      display: flex;
      --mdc-icon-size: calc(var(--orb-size) * 0.44);
    }
  `;

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

import { LitElement, css, html } from 'lit';
import { ORB_ICON_COLOR, orbIconShadow, orbLitBackground } from '../core/orb-style';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';

/**
 * Round icon "orb" (mockup: 52 px). Off: inset background, muted icon.
 * On: radial gradient with a white highlight and a glow in the accent colour.
 * The lit look (always-white icon, #139) is defined once in core/orb-style.ts.
 * Tokens (--glow-*) are inherited from the card or popup around it.
 */
export class GlowOrb extends LitElement {
  @property() icon = '';
  @property({ type: Boolean, reflect: true }) active = false;
  /** Soft style for "all good" states: tinted background, icon in the accent colour. */
  @property({ type: Boolean, reflect: true }) calm = false;
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
      background: ${orbLitBackground('rgb(var(--glow-accent))')};
      box-shadow: var(--glow-orb-glow);
      color: ${ORB_ICON_COLOR};
    }
    :host([calm]:not([active])) button {
      background: rgba(var(--glow-accent), var(--glow-calm, 0.12));
      color: rgb(var(--glow-accent));
    }
    :host([active]) ha-icon {
      filter: ${orbIconShadow('rgb(var(--glow-accent))')};
    }
    ha-icon {
      display: flex;
      --mdc-icon-size: calc(var(--orb-size) * 0.44);
    }
  `;

  render() {
    return html`<button
      style="--orb-size:var(--glow-card-orb, ${this.size}px);width:var(--orb-size);height:var(--orb-size)"
      aria-label=${this.label}
      aria-pressed=${this.active ? 'true' : 'false'}
    >
      <ha-icon .icon=${this.icon}></ha-icon>
    </button>`;
  }
}

defineOnce('glowcard-orb', GlowOrb);

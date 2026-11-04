import { LitElement, css, html, nothing, type CSSResult, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { glowTokens } from '../core/theme';

/**
 * Glow popup frame. It is attached to document.body (see openPopup) because cards use
 * backdrop-filter, which would trap a fixed overlay inside the card.
 * Content is a Lit template from the card; event handlers in it must be arrow functions
 * because the template is rendered here, not in the card.
 */
export class GlowPopup extends LitElement {
  @property({ type: Boolean, reflect: true }) dark = false;
  @property({ reflect: true }) font?: string;
  @property() heading = '';
  @property({ attribute: false }) content: TemplateResult | typeof nothing = nothing;
  @property({ attribute: false }) contentStyles: CSSResult[] = [];

  static styles = [
    glowTokens,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 9;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        font-family: var(--glow-font);
        color: var(--glow-text);
        animation: fade 180ms ease-out;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: rgb(7 8 11 / 0.35);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      :host([dark]) .backdrop {
        background: rgb(0 0 0 / 0.55);
      }
      .panel {
        position: relative;
        width: min(420px, 100%);
        max-height: calc(100% - 32px);
        overflow: auto;
        box-sizing: border-box;
        padding: 20px 20px 24px;
        border-radius: var(--glow-radius-popup);
        background: var(--glow-glass-strong);
        border: 1px solid var(--glow-border);
        box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.5);
        backdrop-filter: blur(var(--glow-blur)) saturate(150%);
        -webkit-backdrop-filter: blur(var(--glow-blur)) saturate(150%);
        animation: rise 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      h2 {
        flex: 1;
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .close {
        all: unset;
        cursor: pointer;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--glow-track);
        color: var(--glow-text-2);
        font-size: 20px;
        line-height: 1;
      }
      .close:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
      }
      @media (max-width: 480px) {
        :host {
          align-items: flex-end;
          padding: 8px;
        }
        .panel {
          width: 100%;
        }
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
      @keyframes rise {
        from {
          transform: translateY(16px) scale(0.98);
        }
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKey);
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('contentStyles') && this.shadowRoot) {
      const own = (GlowPopup.styles as CSSResult[]).map((s) => s.styleSheet!);
      const extra = this.contentStyles.map((s) => s.styleSheet!).filter(Boolean);
      this.shadowRoot.adoptedStyleSheets = [...own, ...extra];
    }
  }

  close = (): void => {
    this.dispatchEvent(new CustomEvent('closed'));
    this.remove();
  };

  private onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') this.close();
  };

  render() {
    return html`<div class="backdrop" @click=${this.close}></div>
      <section class="panel" role="dialog" aria-modal="true" aria-label=${this.heading}>
        <header>
          <h2>${this.heading}</h2>
          <button class="close" aria-label="Close" @click=${this.close}>×</button>
        </header>
        ${this.content}
      </section>`;
  }
}

defineOnce('glowcard-popup', GlowPopup);

/** Opens a popup on document.body and returns it so the caller can update its content. */
export function openPopup(
  init: Partial<Pick<GlowPopup, 'dark' | 'font' | 'heading' | 'content' | 'contentStyles'>>,
): GlowPopup {
  const popup = document.createElement('glowcard-popup') as GlowPopup;
  Object.assign(popup, init);
  document.body.appendChild(popup);
  return popup;
}

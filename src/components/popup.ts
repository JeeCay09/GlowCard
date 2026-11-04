import { LitElement, css, html, nothing, type CSSResult, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { glowTokens } from '../core/theme';
import './orb';

/**
 * Glow popup from the mockups: 380 px panel, radius 32, padding 20, blur 30, dimmed
 * background. Header = orb (tap = on/off, fires `orb-tap`), title, subtitle and a
 * round close button. While `active`, the panel is tinted and glows in the accent colour.
 *
 * It is attached to document.body (see openPopup) because cards use backdrop-filter,
 * which would trap a fixed overlay inside the card. Content is a Lit template from the
 * card; event handlers in it must be arrow functions because it is rendered here.
 */
export class GlowPopup extends LitElement {
  @property({ type: Boolean, reflect: true }) dark = false;
  @property({ reflect: true }) font?: string;
  @property() heading = '';
  @property() subtitle = '';
  @property() icon = '';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean }) darkIcon = false;
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
        animation: fade 0.18s ease-out;
      }
      .dim {
        position: absolute;
        inset: 0;
        background: var(--glow-dim);
      }
      .panel {
        position: relative;
        width: min(380px, 100%);
        max-height: calc(100% - 16px);
        overflow: auto;
        box-sizing: border-box;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        border-radius: var(--glow-radius-popup);
        background: var(--glow-pop-glass);
        border: 1px solid var(--glow-pop-border);
        box-shadow: var(--glow-pop-shadow);
        backdrop-filter: var(--glow-blur-popup);
        -webkit-backdrop-filter: var(--glow-blur-popup);
        transition:
          background 0.3s,
          border-color 0.3s,
          box-shadow 0.3s;
        animation: rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      :host([active]) .panel {
        background: linear-gradient(
          170deg,
          rgba(var(--glow-accent), var(--glow-pop-lit-tint)),
          var(--glow-pop-lit-base) 55%
        );
        border-color: rgba(var(--glow-accent), var(--glow-pop-lit-border));
        box-shadow: var(--glow-pop-lit-shadow);
      }
      header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .titles {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      .subtitle {
        font-size: 13px;
        font-weight: 500;
        color: var(--glow-muted);
      }
      .close {
        all: unset;
        cursor: pointer;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: var(--glow-inset);
        color: var(--glow-text);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .close:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
      }
      @media (max-width: 480px) {
        :host {
          align-items: flex-end;
          padding: 8px;
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

  private onOrb = () => this.dispatchEvent(new CustomEvent('orb-tap'));

  render() {
    return html`<div class="dim" @click=${this.close}></div>
      <section class="panel" role="dialog" aria-modal="true" aria-label=${this.heading}>
        <header>
          <glowcard-orb
            .icon=${this.icon}
            ?active=${this.active}
            ?dark-icon=${this.darkIcon}
            label=${this.heading}
            @click=${this.onOrb}
          ></glowcard-orb>
          <div class="titles">
            <h2>${this.heading}</h2>
            ${this.subtitle ? html`<span class="subtitle">${this.subtitle}</span>` : nothing}
          </div>
          <button class="close" aria-label="Schließen" @click=${this.close}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18"></path>
            </svg>
          </button>
        </header>
        ${this.content}
      </section>`;
  }
}

defineOnce('glowcard-popup', GlowPopup);

export type PopupInit = Partial<
  Pick<
    GlowPopup,
    | 'dark'
    | 'font'
    | 'heading'
    | 'subtitle'
    | 'icon'
    | 'active'
    | 'darkIcon'
    | 'content'
    | 'contentStyles'
  >
>;

/** Opens a popup on document.body and returns it so the caller can update its content. */
export function openPopup(init: PopupInit): GlowPopup {
  const popup = document.createElement('glowcard-popup') as GlowPopup;
  Object.assign(popup, init);
  document.body.appendChild(popup);
  return popup;
}

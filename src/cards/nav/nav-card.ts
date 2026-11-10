import { css, html, nothing, type PropertyValues } from 'lit';
import { ORB_ICON_COLOR, orbIconShadow, orbLitBackground } from '../../core/orb-style';
import { state } from 'lit/decorators.js';
import { handleAction, type ActionConfig } from '../../core/action';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { rgbTriplet, type Rgb } from '../../core/color';
import { configForm, editorLabel, fontField } from '../../core/editor';
import { PressController } from '../../core/press';
import { registerCard } from '../../core/register';
import {
  buttonColor,
  currentIndex,
  dotActive,
  dotColor,
  glideStart,
  navSignature,
  nextHandoff,
  tapActionOf,
  type NavButtonConfig,
  type NavHandoff,
} from './nav-logic';

/**
 * Where the marker was last, shared by all bars on the page. A view change shows a new
 * (or re-attached) bar; it reads this to let the marker glide on from the old button.
 */
let handoff: NavHandoff | undefined;

export interface NavCardConfig extends GlowCardConfig {
  /** `float` (default): fixed at the bottom of the screen. `card`: a normal card in the grid. */
  position?: 'float' | 'card';
  buttons?: NavButtonConfig[];
}

const POSITIONS = ['float', 'card'] as const;

/**
 * Navigation bar from the approved GlowNav mockup (variant A, calm): one frosted glass
 * capsule with round icon buttons. The current view's button is a lit orb inside a soft
 * marker. On a change the buttons stay put, the marker glides over and only then the new
 * orb lights up. Floats at the bottom of the screen or sits in the grid as a normal card.
 */
export class GlowNavCard extends GlowCardBase<NavCardConfig> {
  @state() private current = -1;
  /** HA sets this on cards shown in the card editor preview. */
  preview = false;

  private placed = false;
  /** Button the marker starts on when a bar appears after a view change (-1: none). */
  @state() private glideFrom = -1;
  private gliding = false;
  private pressed = -1;
  private resize?: ResizeObserver;
  private buttonPress = new PressController(
    this,
    () => void this.run(this.pressed, 'tap'),
    () => void this.run(this.pressed, 'hold'),
  );

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        --nav-glass: var(--glow-glass);
        --nav-shadow: var(--glow-glass-shadow);
        --nav-float-glass: rgba(255, 255, 255, 0.7);
        --nav-float-shadow: 0 18px 40px -12px rgba(20, 24, 40, 0.28);
        --nav-btn-h: 46px;
        --nav-btn-w: 46px;
        --nav-orb: 36px;
        --nav-icon: 22px;
        --nav-pad: 4px;
        --nav-ease: cubic-bezier(0.4, 0, 0.2, 1);
        --nav-dur: 0.32s;
        --nav-glow-r: 20px;
        --nav-glow-a: 0.55;
      }
      :host([dark]) {
        --nav-float-glass: rgba(26, 28, 35, 0.62);
        --nav-float-shadow:
          0 18px 40px -10px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 255, 255, 0.05) inset;
        --nav-glow-r: 28px;
        --nav-glow-a: 0.8;
      }
      :host([floating]) {
        height: 0;
        --nav-btn-h: 50px;
        --nav-btn-w: 52px;
        --nav-orb: 38px;
        --nav-pad: 6px;
      }
      .dock {
        position: relative;
        box-sizing: border-box;
        display: flex;
        justify-content: space-between;
        gap: 2px;
        width: 100%;
        padding: var(--nav-pad);
        /* As a card it has the card radius of the mockup; floating it is a round capsule. */
        border-radius: var(--glow-radius);
        font-family: var(--glow-font);
        background: var(--nav-glass);
        border: 1px solid var(--glow-glass-border);
        box-shadow: var(--nav-shadow);
        backdrop-filter: var(--glow-blur);
        -webkit-backdrop-filter: var(--glow-blur);
      }
      :host([floating]) .dock {
        position: fixed;
        border-radius: 999px;
        z-index: 5;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        /* A fixed box at left: 50% would shrink to half the screen and squeeze the buttons. */
        width: max-content;
        max-width: calc(100vw - 32px);
        justify-content: center;
        background: var(--nav-float-glass);
        box-shadow: var(--nav-float-shadow);
        backdrop-filter: blur(30px) saturate(1.4);
        -webkit-backdrop-filter: blur(30px) saturate(1.4);
      }
      .pill {
        position: absolute;
        top: var(--nav-pad);
        height: var(--nav-btn-h);
        border-radius: 999px;
        pointer-events: none;
        box-sizing: border-box;
        background: linear-gradient(160deg, rgba(var(--nav-a), 0.26), rgba(var(--nav-a), 0.1));
        border: 1px solid rgba(var(--nav-a), 0.35);
        transition:
          left var(--nav-dur) var(--nav-ease),
          width var(--nav-dur) var(--nav-ease),
          opacity 0.2s,
          background 0.3s,
          border-color 0.3s;
      }
      .pill.off {
        opacity: 0;
      }
      .pill.still {
        transition: none;
      }
      button {
        all: unset;
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        flex: 0 1 auto;
        width: var(--nav-btn-w);
        min-width: 40px;
        height: var(--nav-btn-h);
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: transform 0.12s;
      }
      button:active {
        transform: scale(0.95);
      }
      button:focus-visible {
        outline: 2px solid rgb(var(--nav-a));
        outline-offset: 2px;
      }
      .orb {
        position: relative;
        width: var(--nav-orb);
        height: var(--nav-orb);
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--glow-muted);
        transition:
          box-shadow 0.18s,
          color 0.18s;
      }
      /* Gradients cannot be animated, so the lit orb is a layer that fades in. */
      .orb::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        opacity: 0;
        transition: opacity 0.18s;
        background: ${orbLitBackground('rgb(var(--nav-a))')};
      }
      ha-icon {
        position: relative;
        display: flex;
        --mdc-icon-size: var(--nav-icon);
      }
      /* The new orb lights up only once the marker has (nearly) arrived. */
      .cur .orb {
        color: ${ORB_ICON_COLOR};
        /* Written out here: --nav-a is set on the dock, so a shorthand on :host would not see it. */
        box-shadow: 0 0 var(--nav-glow-r) rgba(var(--nav-a), var(--nav-glow-a));
        transition:
          box-shadow 0.3s calc(var(--nav-dur) * 0.8),
          color 0.2s calc(var(--nav-dur) * 0.8);
      }
      .cur .orb::before {
        opacity: 1;
        transition: opacity 0.24s calc(var(--nav-dur) * 0.8);
      }
      .cur ha-icon {
        filter: ${orbIconShadow('rgb(var(--nav-a))')};
      }
      .dot {
        position: absolute;
        top: 9px;
        right: calc(50% - var(--nav-orb) / 2 - 2px);
        width: 7px;
        height: 7px;
        border-radius: 9px;
        background: rgb(var(--d));
        box-shadow: 0 0 8px rgba(var(--d), 0.9);
        transition: opacity 0.2s;
      }
      .cur .dot {
        opacity: 0;
      }
      .empty {
        padding: 12px 16px;
        color: var(--glow-muted);
        font: 500 13px var(--glow-font);
      }
      @media (prefers-reduced-motion: reduce) {
        :host {
          --nav-dur: 0s;
        }
      }
    `,
  ];

  static getConfigForm() {
    return configForm(
      [
        {
          name: 'buttons',
          selector: {
            object: {
              multiple: true,
              label_field: 'name',
              fields: {
                icon: { label: editorLabel('icon'), selector: { icon: {} }, required: true },
                name: { label: editorLabel('name'), selector: { text: {} } },
                navigation_path: {
                  label: editorLabel('nav_target'),
                  selector: { navigation: {} },
                },
                entity: { label: editorLabel('nav_dot'), selector: { entity: {} } },
                color: { label: editorLabel('color'), selector: { text: {} } },
              },
            },
          },
        },
        {
          name: '',
          type: 'grid',
          schema: [
            {
              name: 'position',
              default: 'float',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: POSITIONS.map((v) => ({
                    value: v,
                    label: editorLabel(`position_${v}`),
                  })),
                },
              },
            },
            { name: 'color', selector: { text: {} } },
          ],
        },
        fontField,
      ],
      {
        buttons: 'nav_buttons_helper',
        position: 'position_helper',
        color: 'nav_color_helper',
      },
      (config) => {
        const buttons = config.buttons;
        if (
          Array.isArray(buttons) &&
          buttons.some(
            (b) => b && typeof b === 'object' && ('tap_action' in b || 'hold_action' in b),
          )
        ) {
          throw new Error(editorLabel('nav_yaml_only'));
        }
      },
    );
  }

  static gestureSpec() {
    return undefined;
  }

  static getStubConfig(): Partial<NavCardConfig> {
    return {
      buttons: [
        { icon: 'mdi:home-outline', name: 'Home', navigation_path: '/lovelace/0' },
        { icon: 'mdi:sofa-outline', name: 'Wohnzimmer', navigation_path: '#wohnzimmer' },
        { icon: 'mdi:lightning-bolt-outline', name: 'Energie', navigation_path: '/energy' },
      ],
    };
  }

  protected validateConfig(config: NavCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.buttons !== undefined && !Array.isArray(config.buttons)) {
      throw new Error('"buttons" must be a list');
    }
    if (config.position && !POSITIONS.includes(config.position)) {
      throw new Error('"position" must be "float" or "card"');
    }
  }

  protected watchedEntities(): string[] {
    return (this.config?.buttons ?? []).flatMap((b) => (b?.entity ? [b.entity] : []));
  }

  getCardSize(): number {
    return this.floating ? 0 : 1;
  }

  getGridOptions() {
    return { columns: 'full', rows: this.floating ? 'auto' : 1, min_columns: 3 };
  }

  private get buttons(): NavButtonConfig[] {
    return (this.config?.buttons ?? []).filter((b): b is NavButtonConfig => !!b);
  }

  /** Floats only on the dashboard itself: in edit mode and in the editor preview it sits inline. */
  private get floating(): boolean {
    if ((this.config?.position ?? 'float') !== 'float' || this.preview) return false;
    return !(typeof location !== 'undefined' && /[?&]edit=1/.test(location.search));
  }

  private onLocation = (): void => {
    this.current = currentIndex(this.buttons, location);
    if (!this.placed && !this.preview) {
      this.glideFrom = glideStart(handoff, navSignature(this.buttons), this.current, Date.now());
    }
    this.requestUpdate();
  };

  /** Button shown as current: the old one for a moment while the marker takes over. */
  private get shown(): number {
    return this.glideFrom >= 0 ? this.glideFrom : this.current;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('location-changed', this.onLocation);
    window.addEventListener('popstate', this.onLocation);
    window.addEventListener('hashchange', this.onLocation);
    this.onLocation();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('location-changed', this.onLocation);
    window.removeEventListener('popstate', this.onLocation);
    window.removeEventListener('hashchange', this.onLocation);
    this.resize?.disconnect();
    this.resize = undefined;
    this.placed = false;
    this.glideFrom = -1;
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('config')) this.current = currentIndex(this.buttons, location);
  }

  /** Popup-free card: the accent is the current button's colour. */
  protected get accent(): Rgb {
    const b = this.buttons;
    return b.length
      ? this.color(b[this.current] ?? b[0])
      : buttonColor({}, this.config?.color, this.dark);
  }

  private color(b: NavButtonConfig): Rgb {
    return buttonColor(b, this.config?.color, this.dark);
  }

  render() {
    const buttons = this.buttons;
    if (!buttons.length) {
      return html`<div class="dock"><span class="empty">${editorLabel('nav_empty')}</span></div>`;
    }
    const cur = buttons[this.shown];
    const accent = this.color(cur ?? buttons[0]);
    return html`<nav
      class="dock"
      style="--nav-a:${rgbTriplet(accent)}"
      aria-label=${editorLabel('nav_label', this.hass?.language)}
    >
      <span class="pill ${cur ? '' : 'off'}"></span>
      ${buttons.map((b, i) => this.renderButton(b, i))}
    </nav>`;
  }

  private renderButton(b: NavButtonConfig, i: number) {
    const isCur = i === this.shown;
    const e = b.entity ? this.hass?.states[b.entity] : undefined;
    const own = b.color ? this.color(b) : undefined;
    const dot = dotActive(e) ? dotColor(e, own, this.dark) : undefined;
    return html`<button
      class="${isCur ? 'cur' : ''}"
      title=${b.name ?? nothing}
      aria-label=${b.name ?? b.icon ?? `${i + 1}`}
      aria-current=${isCur ? 'page' : 'false'}
      @pointerdown=${(ev: PointerEvent) => {
        this.pressed = i;
        this.buttonPress.down(ev);
      }}
      @pointerup=${this.buttonPress.up}
      @pointercancel=${this.buttonPress.cancel}
      @pointermove=${this.buttonPress.move}
      @click=${(ev: MouseEvent) => {
        // Keyboard (Enter/Space) sends a click without pointer events.
        if (ev.detail === 0) void this.run(i, 'tap');
      }}
    >
      <span class="orb"><ha-icon .icon=${b.icon ?? 'mdi:circle-outline'}></ha-icon></span>
      ${dot ? html`<span class="dot" style="--d:${rgbTriplet(dot)}"></span>` : nothing}
    </button>`;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.toggleAttribute('floating', this.floating);
    this.placePill();
    this.startGlide();
    if (!this.resize && typeof ResizeObserver !== 'undefined') {
      const dock = this.renderRoot.querySelector('.dock');
      if (dock) {
        this.resize = new ResizeObserver(() => {
          this.placePill(true);
          this.startGlide();
        });
        this.resize.observe(dock);
      }
    }
  }

  /**
   * After a view change the marker first sits on the old button. Once the bar is laid out
   * (HA may attach the view before it is visible), it glides to the current button two
   * frames later, after the first resize callback has placed it without animation.
   */
  private startGlide(): void {
    if (this.glideFrom < 0 || this.gliding) return;
    const dock = this.renderRoot.querySelector<HTMLElement>('.dock');
    if (!dock || !dock.offsetWidth) return;
    this.gliding = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.gliding = false;
        this.glideFrom = -1;
      }),
    );
  }

  /** Moves the marker under the current button; without animation the first time. */
  private placePill(still = false): void {
    const pill = this.renderRoot.querySelector<HTMLElement>('.pill');
    const btn = this.renderRoot.querySelectorAll<HTMLElement>('button')[this.shown];
    if (!pill || !btn) return;
    if (this.glideFrom < 0 && !this.preview) {
      handoff = nextHandoff(handoff, navSignature(this.buttons), this.current, Date.now());
    }
    const jump = still || !this.placed;
    pill.classList.toggle('still', jump);
    pill.style.left = `${btn.offsetLeft}px`;
    pill.style.width = `${btn.offsetWidth}px`;
    if (jump) {
      void pill.offsetWidth;
      pill.classList.remove('still');
    }
    this.placed = true;
  }

  private async run(i: number, kind: 'tap' | 'hold'): Promise<void> {
    const b = this.buttons[i];
    if (!b || !this.hass) return;
    const action: ActionConfig = kind === 'hold' && b.hold_action ? b.hold_action : tapActionOf(b);
    // Navigation: the marker starts moving at once, the location event confirms it.
    if (action.action === 'navigate' && action.navigation_path) {
      this.glideFrom = -1;
      this.current = i;
    }
    await handleAction({ element: this, hass: this.hass, entity: b.entity }, action);
  }
}

registerCard(
  {
    type: 'glowcard-nav',
    name: 'GlowCard Navigation',
    description: 'Glow bar of round buttons to switch views or open popups; floats or sits inline.',
  },
  GlowNavCard,
);

declare global {
  interface HTMLElementTagNameMap {
    'glowcard-nav': GlowNavCard;
  }
}

import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { fireEvent } from '../core/fire-event';
import { fillPercent, valueFromPosition } from '../core/slider-math';

/**
 * Drag bar from the mockups; the value is set by dragging the bar itself (no +/- buttons),
 * only the filled part glows, dragging to 0 means "off".
 *
 * - default (card): thin 8 px bar with a glowing knob, 36 px tall hit area.
 * - `vertical` (popup): 128 × 300 px column, fill from the bottom, big label at the top,
 *   handle line on the fill edge and a soft glow behind the fill.
 *
 * Fires `value-changing` while dragging and `value-changed` on release, both `{ value }`.
 * With `live`, it also fires `value-live` while dragging (at most every LIVE_MS), so the
 * light follows the finger instead of changing only on release.
 *
 * On touch, the horizontal bar lets the page scroll: a drag only starts once the finger
 * moves sideways more than it moves up or down. A vertical swipe over the bar scrolls the
 * dashboard and never changes the value.
 *
 * Colours come from --glow-accent; `--glow-fill` / `--glow-knob` can override them.
 */
export class GlowSlider extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property({ type: Boolean, reflect: true }) vertical = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  /** Horizontal only: bar without knob and a softer glow (light rows in the status popup). */
  @property({ type: Boolean, reflect: true }) plain = false;
  @property() label = '';
  /** Vertical: label turns dark on very light colours once the fill reaches it. */
  @property({ type: Boolean, attribute: 'dark-text' }) darkText = false;
  /** Vertical: text at the top of the column, e.g. "72%". Pill: the value on the right. */
  @property() caption = '';
  /**
   * Horizontal pill (media volume): a tall rounded bar, the fill glows, icon + label on the
   * left and `caption` on the right. Text over the fill turns white.
   */
  @property({ type: Boolean, reflect: true }) pill = false;
  /** Pill only: icon and label on the left. */
  @property() icon = '';
  @property() text = '';

  /** Fire `value-live` while dragging (throttled). */
  @property({ type: Boolean }) live = false;

  @state() private dragValue?: number;
  /** Touch on the horizontal bar: where it started, until it is clearly a sideways drag. */
  private pending?: { id: number; x: number; y: number; target: HTMLElement };
  private liveSent?: number;
  private liveAt = 0;
  private liveTimer?: number;

  static styles = css`
    :host {
      display: block;
      -webkit-tap-highlight-color: transparent;
    }
    .hit {
      position: relative;
      /* Own compositing layer: iOS/WebKit otherwise often skips repainting the fill and
         knob inside the backdrop-filter glass card until the card itself changes. */
      transform: translateZ(0);
      touch-action: none;
      user-select: none;
      outline: none;
    }
    .hit:focus-visible {
      outline: 2px solid rgb(var(--glow-accent));
      outline-offset: 2px;
      border-radius: 999px;
    }
    :host([disabled]) .hit {
      opacity: 0.5;
      cursor: default;
    }

    /* horizontal (card) */
    :host(:not([vertical])) .hit {
      /* Vertical swipes scroll the page; see onDown. */
      touch-action: pan-y;
      height: var(--glow-slider-hit, 36px);
      display: flex;
      align-items: center;
      cursor: ew-resize;
    }
    .bar {
      position: relative;
      width: 100%;
      height: var(--glow-slider-bar, 8px);
      border-radius: 999px;
      background: var(--glow-track);
      pointer-events: none;
    }
    .bar .fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 999px;
      background: var(--glow-fill-h, rgb(var(--glow-accent)));
      box-shadow: 0 0 14px rgba(var(--glow-accent), 0.8);
    }
    :host([plain]) .bar .fill {
      box-shadow: 0 0 10px rgba(var(--glow-accent), 0.7);
    }
    .knob {
      position: absolute;
      top: -6px;
      width: 20px;
      height: 20px;
      margin-left: -10px;
      border-radius: 999px;
      background: var(--glow-knob, #fff);
      box-shadow: 0 0 14px rgba(var(--glow-accent), 0.95);
    }
    .fill,
    .knob {
      transition:
        width 0.08s,
        height 0.08s,
        left 0.08s,
        bottom 0.08s,
        background 0.3s;
    }

    /* pill (media volume) */
    :host([pill]) .hit {
      height: var(--glow-pill-h, 44px);
      border-radius: var(--glow-pill-r, 14px);
      background: var(--glow-track);
      overflow: hidden;
    }
    .pill-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: inherit;
      background: linear-gradient(90deg, rgba(var(--glow-accent), 0.6), rgb(var(--glow-accent)));
      box-shadow: 0 0 18px rgba(var(--glow-accent), 0.55);
      pointer-events: none;
      transition: width 0.08s;
    }
    .pill-lab {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 var(--glow-pill-pad, 14px);
      font: 700 var(--glow-pill-font, 13px) / 1.25 var(--glow-font);
      color: var(--glow-text);
      white-space: nowrap;
      pointer-events: none;
    }
    .pill-lab.over {
      color: #fff;
    }
    .pill-lab ha-icon {
      display: flex;
      flex-shrink: 0;
      --mdc-icon-size: 18px;
    }
    .pill-lab .t {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pill-lab b {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
    .dragging .pill-fill {
      transition: none;
    }

    /* vertical (popup) */
    :host([vertical]) {
      width: 136px;
      height: 312px;
    }
    .column-wrap {
      position: relative;
      width: 136px;
      height: 312px;
    }
    .halo {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 6px;
      border-radius: 40px;
      background: rgba(var(--glow-accent), var(--glow-halo, 0.75));
      filter: blur(22px);
      transition: height 0.08s;
      pointer-events: none;
    }
    :host([vertical]) .hit {
      position: absolute;
      left: 4px;
      top: 6px;
      width: 128px;
      height: 300px;
      border-radius: 40px;
      background: var(--glow-track);
      overflow: hidden;
      cursor: ns-resize;
    }
    .column .fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--glow-fill-v, rgb(var(--glow-accent)));
      pointer-events: none;
    }
    .caption {
      position: absolute;
      left: 0;
      right: 0;
      top: 22px;
      text-align: center;
      font: 800 30px var(--glow-font);
      letter-spacing: -0.03em;
      color: var(--glow-caption, var(--glow-text));
      pointer-events: none;
    }
    .handle {
      position: absolute;
      left: 50%;
      width: 40px;
      height: 5px;
      margin-left: -20px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 1px 3px rgba(58, 37, 4, 0.4);
      pointer-events: none;
    }
    .dragging .fill,
    .dragging .knob,
    .dragging .handle {
      transition: none;
    }
  `;

  private get current(): number {
    return this.dragValue ?? this.value;
  }

  private fromPoint(ev: PointerEvent, target: HTMLElement): number {
    const r = target.getBoundingClientRect();
    return this.vertical
      ? valueFromPosition(r.bottom - ev.clientY, 0, r.height, this.min, this.max, this.step)
      : valueFromPosition(ev.clientX, r.left, r.width, this.min, this.max, this.step);
  }

  private onDown = (ev: PointerEvent) => {
    if (this.disabled) return;
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLElement;
    if (!this.vertical && ev.pointerType === 'touch') {
      // Wait: this may be the start of a scroll. See onMove.
      this.pending = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, target };
      return;
    }
    this.start(ev, target);
  };

  private start(ev: PointerEvent, target: HTMLElement) {
    this.pending = undefined;
    target.setPointerCapture?.(ev.pointerId);
    this.dragValue = this.fromPoint(ev, target);
    fireEvent(this, 'value-changing', { value: this.dragValue });
    this.sendLive(this.dragValue);
  }

  private onMove = (ev: PointerEvent) => {
    const p = this.pending;
    if (p && ev.pointerId === p.id) {
      const dx = Math.abs(ev.clientX - p.x);
      const dy = Math.abs(ev.clientY - p.y);
      if (dy > SLOP && dy >= dx) {
        this.pending = undefined; // a scroll: the browser takes over (pointercancel)
      } else if (dx > SLOP && dx > dy) {
        this.start(ev, p.target);
      }
      return;
    }
    if (this.dragValue === undefined) return;
    this.dragValue = this.fromPoint(ev, ev.currentTarget as HTMLElement);
    fireEvent(this, 'value-changing', { value: this.dragValue });
    this.sendLive(this.dragValue);
  };

  private onUp = (ev: PointerEvent) => {
    const p = this.pending;
    if (p && ev.pointerId === p.id) {
      // A tap without moving sets the value where the finger is.
      this.pending = undefined;
      ev.stopPropagation();
      this.finish(this.fromPoint(ev, p.target));
      return;
    }
    if (this.dragValue === undefined) return;
    ev.stopPropagation();
    this.finish(this.fromPoint(ev, ev.currentTarget as HTMLElement));
  };

  private onCancel = () => {
    // The browser took the gesture (page scroll) or lost it: keep the old value.
    this.pending = undefined;
    if (this.dragValue === undefined) return;
    this.dragValue = undefined;
    this.stopLive();
    fireEvent(this, 'value-changed', { value: this.value });
  };

  private finish(value: number) {
    this.dragValue = undefined;
    this.stopLive();
    this.value = value;
    fireEvent(this, 'value-changed', { value });
  }

  /** Throttled `value-live`: right away, then at most every LIVE_MS, plus the latest value. */
  private sendLive(value: number) {
    if (!this.live) return;
    const wait = this.liveAt + LIVE_MS - Date.now();
    window.clearTimeout(this.liveTimer);
    if (wait <= 0) {
      this.emitLive(value);
    } else {
      this.liveTimer = window.setTimeout(() => this.emitLive(value), wait);
    }
  }

  private emitLive(value: number) {
    if (value === this.liveSent || this.dragValue === undefined) return;
    this.liveSent = value;
    this.liveAt = Date.now();
    fireEvent(this, 'value-live', { value });
  }

  private stopLive() {
    window.clearTimeout(this.liveTimer);
    this.liveSent = undefined;
    this.liveAt = 0;
  }

  private onKey = (ev: KeyboardEvent) => {
    if (this.disabled) return;
    const big = (this.max - this.min) / 10;
    const delta: Record<string, number> = {
      ArrowRight: this.step,
      ArrowUp: this.step,
      ArrowLeft: -this.step,
      ArrowDown: -this.step,
      PageUp: big,
      PageDown: -big,
    };
    let next: number | undefined;
    if (ev.key in delta) next = this.value + delta[ev.key];
    if (ev.key === 'Home') next = this.min;
    if (ev.key === 'End') next = this.max;
    if (next === undefined) return;
    ev.preventDefault();
    this.value = Math.max(this.min, Math.min(this.max, next));
    fireEvent(this, 'value-changed', { value: this.value });
  };

  private hit(inner: unknown) {
    return html`<div
      class="hit ${this.vertical ? 'column' : ''} ${this.dragValue !== undefined ? 'dragging' : ''}"
      role="slider"
      tabindex=${this.disabled ? -1 : 0}
      aria-label=${this.label}
      aria-orientation=${this.vertical ? 'vertical' : 'horizontal'}
      aria-valuemin=${this.min}
      aria-valuemax=${this.max}
      aria-valuenow=${this.current}
      aria-disabled=${this.disabled ? 'true' : 'false'}
      @pointerdown=${this.onDown}
      @pointermove=${this.onMove}
      @pointerup=${this.onUp}
      @pointercancel=${this.onCancel}
      @click=${(e: Event) => e.stopPropagation()}
      @keydown=${this.onKey}
    >
      ${inner}
    </div>`;
  }

  render() {
    const pct = fillPercent(this.current, this.min, this.max);
    if (this.pill) {
      const lab = (over: boolean) =>
        html`<div
          class="pill-lab ${over ? 'over' : ''}"
          style=${over ? `clip-path:inset(0 ${100 - pct}% 0 0)` : ''}
        >
          ${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}
          ${this.text ? html`<span class="t">${this.text}</span>` : nothing}
          <b>${this.caption}</b>
        </div>`;
      return this.hit(
        html`<div class="pill-fill" style="width:${pct}%"></div>
          ${lab(false)}${lab(true)}`,
      );
    }
    if (!this.vertical) {
      return this.hit(
        html`<div class="bar">
          <div class="fill" style="width:${pct}%"></div>
          ${pct > 0 && !this.plain ? html`<div class="knob" style="left:${pct}%"></div>` : nothing}
        </div>`,
      );
    }
    return html`<div class="column-wrap">
      <div class="halo" style="height:${pct > 0 ? `calc(${pct}% * 0.96)` : '0px'}"></div>
      ${this.hit(
        html`<div class="fill" style="height:${pct}%"></div>
          <div
            class="caption"
            style=${pct > 80 ? `color:${this.darkText ? '#1F1A12' : '#FFFFFF'}` : ''}
          >
            ${this.caption}
          </div>
          ${
            pct > 8 ? html`<div class="handle" style="bottom:calc(${pct}% - 14px)"></div>` : nothing
          }`,
      )}
    </div>`;
  }
}

/** Finger movement (px) before a touch counts as a drag or a scroll. */
const SLOP = 8;
/** Minimum time between two live updates while dragging. */
const LIVE_MS = 250;

defineOnce('glowcard-slider', GlowSlider);

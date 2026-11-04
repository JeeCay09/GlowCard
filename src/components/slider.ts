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
  /** Vertical only: text at the top of the column, e.g. "72%". */
  @property() caption = '';

  @state() private dragValue?: number;

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
      height: 36px;
      display: flex;
      align-items: center;
      cursor: ew-resize;
    }
    .bar {
      position: relative;
      width: 100%;
      height: 8px;
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

  private fromEvent(ev: PointerEvent): number {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return this.vertical
      ? valueFromPosition(r.bottom - ev.clientY, 0, r.height, this.min, this.max, this.step)
      : valueFromPosition(ev.clientX, r.left, r.width, this.min, this.max, this.step);
  }

  private onDown = (ev: PointerEvent) => {
    if (this.disabled) return;
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    this.dragValue = this.fromEvent(ev);
    fireEvent(this, 'value-changing', { value: this.dragValue });
  };

  private onMove = (ev: PointerEvent) => {
    if (this.dragValue === undefined) return;
    this.dragValue = this.fromEvent(ev);
    fireEvent(this, 'value-changing', { value: this.dragValue });
  };

  private onUp = (ev: PointerEvent) => {
    if (this.dragValue === undefined) return;
    ev.stopPropagation();
    const value = this.fromEvent(ev);
    this.dragValue = undefined;
    this.value = value;
    fireEvent(this, 'value-changed', { value });
  };

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
      @pointercancel=${this.onUp}
      @click=${(e: Event) => e.stopPropagation()}
      @keydown=${this.onKey}
    >
      ${inner}
    </div>`;
  }

  render() {
    const pct = fillPercent(this.current, this.min, this.max);
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

defineOnce('glowcard-slider', GlowSlider);

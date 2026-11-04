import { LitElement, css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineOnce } from '../core/define';
import { fireEvent } from '../core/fire-event';
import { fillPercent, valueFromPosition } from '../core/slider-math';

/**
 * Drag bar: the value is set by dragging the bar itself (no +/- buttons).
 * Only the filled part glows. Fires `value-changing` while dragging and
 * `value-changed` on release, both with `{ value }`.
 */
export class GlowSlider extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property() label = '';
  /** Text shown inside the bar, e.g. "62 %". */
  @property() caption = '';

  @state() private dragValue?: number;

  static styles = css`
    :host {
      display: block;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    .track {
      position: relative;
      height: var(--glow-slider-height, 44px);
      border-radius: 16px;
      background: var(--glow-track);
      overflow: hidden;
      cursor: pointer;
    }
    :host([disabled]) .track {
      cursor: default;
      opacity: 0.5;
    }
    .track:focus-visible {
      outline: 2px solid rgb(var(--glow-accent));
      outline-offset: 2px;
    }
    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: inherit;
      background: linear-gradient(90deg, rgb(var(--glow-accent) / 0.75), rgb(var(--glow-accent)));
      box-shadow: 0 0 18px rgb(var(--glow-accent) / var(--glow-glow));
    }
    .fill.dragging {
      transition: none;
    }
    .fill:not(.dragging) {
      transition: width 200ms ease;
    }
    .caption {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      padding: 0 16px;
      font: 600 14px var(--glow-font);
      color: var(--glow-text);
      pointer-events: none;
    }
  `;

  private get current(): number {
    return this.dragValue ?? this.value;
  }

  private fromEvent(ev: PointerEvent): number {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return valueFromPosition(ev.clientX, rect.left, rect.width, this.min, this.max, this.step);
  }

  private onDown = (ev: PointerEvent) => {
    if (this.disabled) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
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

  render() {
    const pct = fillPercent(this.current, this.min, this.max);
    return html`<div
      class="track"
      role="slider"
      tabindex=${this.disabled ? -1 : 0}
      aria-label=${this.label}
      aria-valuemin=${this.min}
      aria-valuemax=${this.max}
      aria-valuenow=${this.current}
      aria-disabled=${this.disabled ? 'true' : 'false'}
      @pointerdown=${this.onDown}
      @pointermove=${this.onMove}
      @pointerup=${this.onUp}
      @pointercancel=${this.onUp}
      @keydown=${this.onKey}
    >
      ${
        pct > 0
          ? html`<div
              class="fill ${this.dragValue !== undefined ? 'dragging' : ''}"
              style="width:${pct}%"
            ></div>`
          : ''
      }
      <div class="caption">${this.caption}</div>
    </div>`;
  }
}

defineOnce('glowcard-slider', GlowSlider);

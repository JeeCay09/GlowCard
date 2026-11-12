import { LitElement, css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineOnce } from '../core/define';

/** Glide speed in px per second. */
const SPEED = 28;
/** Share of the loop spent moving (the rest is the pause at each end). */
const MOVING = 0.6;
/** Soft edge width while gliding. */
const FADE = 10;

/**
 * One line of text that never wraps. If it does not fit and `run` is set, it glides
 * slowly to its end and back (pause at both ends, soft edges); otherwise it ends in "…".
 * Users with "reduce motion" always get "…". Font and colour come from the parent.
 */
export class GlowMarquee extends LitElement {
  @property() text = '';
  @property({ type: Boolean }) run = false;
  @state() private dist = 0;

  private observer?: ResizeObserver;

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    :host([moving]) {
      text-overflow: clip;
      margin-inline: -${FADE}px;
      -webkit-mask-image: linear-gradient(
        90deg,
        transparent,
        #000 ${FADE}px,
        #000 calc(100% - ${FADE}px),
        transparent
      );
      mask-image: linear-gradient(
        90deg,
        transparent,
        #000 ${FADE}px,
        #000 calc(100% - ${FADE}px),
        transparent
      );
    }
    span {
      white-space: nowrap;
    }
    :host([moving]) span {
      display: inline-block;
      padding-inline: ${FADE}px;
      animation: glide var(--mq-dur) ease-in-out infinite;
    }
    @keyframes glide {
      0%,
      ${(1 - MOVING) * 50}% {
        transform: translateX(0);
      }
      50%,
      ${50 + (1 - MOVING) * 50}% {
        transform: translateX(var(--mq-dist));
      }
      100% {
        transform: translateX(0);
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('text') || changed.has('run')) this.measure();
  }

  private get reduced(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** Overflow in px of the plain text (measured without the gliding padding). */
  private measure(): void {
    const span = this.renderRoot.querySelector('span');
    if (!span) return;
    const moving = this.hasAttribute('moving');
    const avail = this.clientWidth - (moving ? 2 * FADE : 0);
    const need = span.getBoundingClientRect().width - (moving ? 2 * FADE : 0);
    const over = Math.ceil(need - avail);
    const glide = this.run && over > 1 && !this.reduced;
    this.dist = glide ? over : 0;
    this.toggleAttribute('moving', glide);
    if (glide) {
      const dur = Math.max(8, (over / SPEED / MOVING) * 2);
      this.style.setProperty('--mq-dist', `-${over}px`);
      this.style.setProperty('--mq-dur', `${dur.toFixed(1)}s`);
    }
  }

  render() {
    return html`<span title=${this.dist ? this.text : ''}>${this.text}</span>`;
  }
}

defineOnce('glowcard-marquee', GlowMarquee);

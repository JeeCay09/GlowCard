import { css } from 'lit';

/**
 * Shared pieces of the GlowChips board, values taken from its renderVals():
 * `.dot` = small orb (off / on / calm) with optional pulse ring, plus the per-theme
 * colours the board uses on top of the core tokens.
 * Set `--c` (r,g,b), `--s` (size), `--i` (icon size) and `--g` (glow radius) per dot.
 */
export const statusTokens = css`
  :host {
    --gc-glass: rgba(255, 255, 255, 0.62);
    --gc-glass-border: rgba(255, 255, 255, 0.9);
    --gc-chip-lit-base: rgba(255, 255, 255, 0.72);
    --gc-chip-lit-tint: 0.18;
    --gc-chip-lit-border: 0.35;
    --gc-chip-lit-shadow: 0 10px 24px -10px;
    --gc-chip-lit-glow: 0.55;
    --gc-chip-inner: rgba(255, 255, 255, 0.96);
    --gc-seg-sel: 0.16;
    --gc-dock-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.2);
    --gc-glow-a: 0.5;
    --gc-glow-f: 0.7;
    --gc-ring-glow: 0.4;
    --gc-avatar-bg: #ffffff;
    --gc-badge-bg: #14161a;
    --gc-badge-fg: #ffffff;
    --gc-line: rgba(20, 22, 26, 0.08);
    --gc-inset: rgba(20, 22, 26, 0.06);
    --gc-alert-bg: 0.08;
  }
  :host([dark]) {
    --gc-glass: rgba(20, 22, 28, 0.55);
    --gc-glass-border: rgba(255, 255, 255, 0.08);
    --gc-chip-lit-base: rgba(20, 22, 28, 0.55);
    --gc-chip-lit-tint: 0.22;
    --gc-chip-lit-border: 0.3;
    --gc-chip-lit-shadow: 0 10px 28px -10px;
    --gc-chip-lit-glow: 0.65;
    --gc-chip-inner: rgba(20, 22, 28, 0.92);
    --gc-seg-sel: 0.14;
    --gc-dock-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.8);
    --gc-glow-a: 0.75;
    --gc-glow-f: 1;
    --gc-ring-glow: 0.55;
    --gc-avatar-bg: #1f232b;
    --gc-badge-bg: #f3f4f6;
    --gc-badge-fg: #14161a;
    --gc-line: rgba(255, 255, 255, 0.08);
    --gc-inset: rgba(255, 255, 255, 0.07);
    --gc-alert-bg: 0.12;
  }
`;

export const dotStyles = css`
  .dot {
    position: relative;
    box-sizing: border-box;
    width: calc(var(--s, 40px) * var(--dot-scale, 1));
    height: calc(var(--s, 40px) * var(--dot-scale, 1));
    flex-shrink: 0;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot ha-icon,
  .ico ha-icon {
    display: flex;
    --mdc-icon-size: calc(var(--i, 19px) * var(--dot-scale, 1));
  }
  .dot.off {
    background: var(--gc-inset);
    color: var(--glow-muted);
  }
  .dot.bare {
    background: transparent;
    color: var(--glow-muted);
  }
  .dot.on {
    background: radial-gradient(
      circle at 35% 30%,
      color-mix(in srgb, #ffffff 60%, rgb(var(--c))),
      rgb(var(--c)) 62%
    );
    box-shadow: 0 0 calc(var(--g, 22px) * var(--gc-glow-f)) rgba(var(--c), var(--gc-glow-a));
    color: #ffffff;
  }
  .dot.calm {
    background: rgba(var(--c), var(--glow-calm));
    color: rgb(var(--c));
  }
  .ping {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 2px solid rgb(var(--c));
    animation: gcping 1.8s ease-out infinite;
    pointer-events: none;
  }
  @keyframes gcping {
    0% {
      transform: scale(1);
      opacity: 0.75;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ping {
      animation: none;
      opacity: 0.5;
    }
  }
`;

/** Popup content: light rows, info rows, alert box and the action buttons. */
export const statusPopupStyles = css`
  .panel {
    gap: 16px;
  }
  :host(:not([dark])) .panel,
  :host(:not([dark])[glow-only]) .panel {
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 30px 70px -20px rgba(20, 24, 40, 0.25);
  }
  :host(:not([dark])[glow-only][active]) .panel {
    box-shadow:
      0 30px 70px -20px rgba(20, 24, 40, 0.25),
      0 0 80px -30px rgba(var(--glow-accent), 0.6);
  }
  header glowcard-orb {
    --glow-orb-glow: 0 0 calc(26px * var(--gc-glow-f)) rgba(var(--glow-accent), var(--gc-glow-a));
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lrow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 22px;
    background: var(--gc-inset);
    border: 1px solid transparent;
    transition:
      background 0.3s,
      border-color 0.3s;
  }
  .lrow.lit {
    background: rgba(var(--glow-accent), 0.1);
    border-color: rgba(var(--glow-accent), 0.22);
  }
  .lrow glowcard-orb {
    --glow-orb-glow: 0 0 calc(18px * var(--gc-glow-f)) rgba(var(--glow-accent), var(--gc-glow-a));
  }
  .lbody {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lhead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .lname {
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lpct {
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .lpct.off,
  .ival.off {
    color: var(--glow-muted);
  }
  .lrow glowcard-slider {
    margin: -14px 0;
    --glow-track: var(--gc-inset);
  }
  .since {
    font-size: 12px;
    font-weight: 500;
    color: var(--glow-muted);
  }
  .empty {
    font-size: 13px;
    font-weight: 500;
    color: var(--glow-muted);
    padding: 4px 2px;
  }
  .info {
    display: flex;
    flex-direction: column;
  }
  .irow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--gc-line);
  }
  .itext {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ilabel {
    font-size: 14px;
    font-weight: 700;
  }
  .isub {
    font-size: 12px;
    font-weight: 500;
    color: var(--glow-muted);
  }
  .ival {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .alert {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    border-radius: 22px;
    background: rgba(var(--glow-accent), var(--gc-alert-bg));
    border: 1px solid rgba(var(--glow-accent), 0.3);
  }
  .alert svg {
    flex-shrink: 0;
    color: rgb(var(--glow-accent));
  }
  .alert .atext {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .alert .atitle {
    font-size: 15px;
    font-weight: 800;
  }
  .alert .asub {
    font-size: 13px;
    font-weight: 500;
    color: var(--glow-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions button {
    all: unset;
    box-sizing: border-box;
    flex: 1;
    height: 48px;
    border-radius: 999px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    background: var(--gc-inset);
    color: var(--glow-text);
    transition: transform 0.12s;
  }
  .actions button.primary {
    background: var(--glow-text);
    color: var(--glow-wall);
  }
  .actions button:active {
    transform: scale(0.98);
  }
  .actions button:focus-visible {
    outline: 2px solid rgb(var(--glow-accent));
    outline-offset: 2px;
  }
`;

/** Person avatars (header: 40 px, chip: 36 px). */
export const avatarStyles = css`
  .avatar {
    position: relative;
    box-sizing: border-box;
    width: calc(var(--s) * var(--dot-scale, 1));
    height: calc(var(--s) * var(--dot-scale, 1));
    flex-shrink: 0;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-weight: 800;
    color: var(--glow-text);
    background: var(--gc-avatar-bg);
    border: 2px solid var(--gc-glass-border);
  }
  .avatar.home {
    border-color: rgb(var(--c));
    box-shadow: 0 0 var(--ag, 14px) rgba(var(--c), var(--gc-ring-glow));
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar.overlap {
    margin-left: -10px;
  }
`;

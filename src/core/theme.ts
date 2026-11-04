import { css } from 'lit';

/**
 * Compact sizes for phones: smaller value text, orb and padding, lower cards.
 * Used automatically below 600 px viewport width (`size: auto`, the default),
 * always with `size: compact`, never with `size: normal`.
 */
const compactSizes = css`
  --glow-pad: 14px;
  --glow-radius: 24px;
  --glow-card-h: 120px;
  --glow-card-h-wide: 164px;
  --glow-orb-size: 40px;
  --glow-value-size: 30px;
  --glow-word-size: 20px;
  --glow-word-big: 24px;
  --glow-name-size: 15px;
  --glow-name-small: 14px;
  --glow-sub-size: 12px;
`;

/**
 * Glow design tokens, taken 1:1 from the approved mockups (GlowCards, GlowPopups,
 * GlowSwitches). Set on a card's or popup's host and inherited by its parts.
 * The host sets the `dark` attribute from hass.themes.darkMode and `--glow-accent`
 * as an "r, g, b" triplet (used as rgba(var(--glow-accent), a)).
 */
export const glowTokens = css`
  :host {
    --glow-font:
      'Plus Jakarta Sans Variable', 'Plus Jakarta Sans',
      var(--primary-font-family, system-ui, sans-serif);
    --glow-radius: 28px;
    --glow-radius-popup: 32px;
    --glow-blur: blur(24px);
    --glow-blur-popup: blur(30px);

    /* light */
    --glow-text: #14161a;
    --glow-muted: #4e5562;
    --glow-inset: rgba(20, 22, 26, 0.06);
    --glow-track: rgba(20, 22, 26, 0.08);
    --glow-glass: rgba(255, 255, 255, 0.62);
    --glow-glass-border: rgba(255, 255, 255, 0.9);
    --glow-glass-shadow: 0 10px 30px -8px rgba(20, 24, 40, 0.12);
    --glow-lit-base: rgba(255, 255, 255, 0.72);
    --glow-lit-tint: 0.2;
    --glow-lit-border: 0.4;
    --glow-lit-shadow: 0 20px 48px -14px rgba(var(--glow-accent), 0.55);
    --glow-orb-glow: 0 0 20px rgba(var(--glow-accent), 0.55);
    --glow-pop-glass: rgba(255, 255, 255, 0.7);
    --glow-pop-border: rgba(255, 255, 255, 0.95);
    --glow-pop-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.25);
    --glow-pop-lit-base: rgba(255, 255, 255, 0.78);
    --glow-pop-lit-tint: 0.18;
    --glow-pop-lit-border: 0.35;
    --glow-pop-lit-shadow:
      0 30px 70px -20px rgba(20, 24, 40, 0.25), 0 0 80px -24px rgba(var(--glow-accent), 0.6);
    --glow-dim: rgba(231, 233, 239, 0.35);
    --glow-tab-active: #ffffff;
    --glow-knob-ring: #ffffff;
    --glow-halo: 0.6;
    --glow-pop-plain: rgba(255, 255, 255, 0.8);
    --glow-pop-glow: 0 0 80px -30px rgba(var(--glow-accent), 0.6);
    --glow-line: rgba(20, 22, 26, 0.07);
    --glow-calm: 0.12;
    --glow-wall: #e7e9ef;

    /* card sizes (normal); see compactSizes */
    --glow-pad: 18px;
    --glow-card-h: 164px;
    --glow-card-h-wide: 200px;
    --glow-orb-size: 52px;
    --glow-value-size: 44px;
    --glow-word-size: 24px;
    --glow-word-big: 32px;
    --glow-name-size: 16px;
    --glow-name-small: 15px;
    --glow-sub-size: 13px;
  }
  @media (max-width: 600px) {
    :host(:not([size='normal'])) {
      ${compactSizes}
    }
  }
  :host([size='compact']) {
    ${compactSizes}
  }
  :host([dark]) {
    --glow-text: #f3f4f6;
    --glow-muted: rgba(255, 255, 255, 0.66);
    --glow-inset: rgba(255, 255, 255, 0.08);
    --glow-track: rgba(255, 255, 255, 0.1);
    --glow-glass: rgba(20, 22, 28, 0.55);
    --glow-glass-border: rgba(255, 255, 255, 0.08);
    --glow-glass-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
    --glow-lit-base: rgba(20, 22, 28, 0.55);
    --glow-lit-tint: 0.24;
    --glow-lit-border: 0.32;
    --glow-lit-shadow: 0 24px 60px -14px rgba(var(--glow-accent), 0.5);
    --glow-orb-glow: 0 0 28px rgba(var(--glow-accent), 0.8);
    --glow-pop-glass: rgba(24, 26, 32, 0.62);
    --glow-pop-border: rgba(255, 255, 255, 0.08);
    --glow-pop-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.8);
    --glow-pop-lit-base: rgba(24, 26, 32, 0.66);
    --glow-pop-lit-tint: 0.22;
    --glow-pop-lit-border: 0.28;
    --glow-pop-lit-shadow:
      0 40px 80px -20px rgba(0, 0, 0, 0.8), 0 0 90px -20px rgba(var(--glow-accent), 0.55);
    --glow-dim: rgba(0, 0, 0, 0.45);
    --glow-tab-active: rgba(255, 255, 255, 0.14);
    --glow-knob-ring: #16181d;
    --glow-halo: 0.75;
    --glow-pop-plain: rgba(24, 26, 32, 0.68);
    --glow-pop-glow: 0 0 90px -30px rgba(var(--glow-accent), 0.5);
    --glow-line: rgba(255, 255, 255, 0.07);
    --glow-calm: 0.14;
    --glow-wall: #07080b;
  }
  :host([font='theme']) {
    --glow-font: var(--primary-font-family, inherit);
  }
`;

/**
 * Card surface: frosted glass; `.active` tints it in the accent colour (160° gradient),
 * colours the border and casts a coloured shadow. `.unavailable` = dashed + dimmed.
 * Typography helpers: `.value` (big number top right), `.word` (An/Aus), `.name`, `.sub`.
 */
export const glassStyles = css`
  .glass {
    position: relative;
    box-sizing: border-box;
    border-radius: var(--glow-radius);
    padding: var(--glow-pad);
    font-family: var(--glow-font);
    color: var(--glow-text);
    background: var(--glow-glass);
    border: 1px solid var(--glow-glass-border);
    box-shadow: var(--glow-glass-shadow);
    backdrop-filter: var(--glow-blur);
    -webkit-backdrop-filter: var(--glow-blur);
    transition:
      background 0.3s,
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .glass.active {
    background: linear-gradient(
      160deg,
      rgba(var(--glow-accent), var(--glow-lit-tint)),
      var(--glow-lit-base) 62%
    );
    border-color: rgba(var(--glow-accent), var(--glow-lit-border));
    box-shadow: var(--glow-lit-shadow);
  }
  /* Orbs in switch/plug/light cards follow the card size (row variant keeps its own). */
  .glass.sized:not(.row) {
    --glow-card-orb: var(--glow-orb-size);
  }
  .glass.unavailable {
    border-style: dashed;
    opacity: 0.55;
  }
  .value {
    font-size: var(--glow-value-size);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .word {
    font-size: var(--glow-word-size);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .name {
    font-size: var(--glow-name-size);
    font-weight: 700;
    line-height: 1.25;
  }
  .sub {
    font-size: var(--glow-sub-size);
    font-weight: 500;
    color: var(--glow-muted);
  }
`;

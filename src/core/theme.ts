import { css } from 'lit';

/**
 * Glow design tokens, set on a card's (or popup's) host and inherited by its parts.
 * The host sets the `dark` attribute from hass.themes.darkMode and `--glow-accent`
 * as an "r g b" triplet.
 */
export const glowTokens = css`
  :host {
    --glow-font:
      'Plus Jakarta Sans Variable', 'Plus Jakarta Sans',
      var(--primary-font-family, system-ui, sans-serif);
    --glow-radius: 28px;
    --glow-radius-popup: 32px;
    --glow-blur: 24px;

    /* light */
    --glow-wall: #e7e9ef;
    --glow-glass: rgb(255 255 255 / 0.62);
    --glow-glass-strong: rgb(255 255 255 / 0.8);
    --glow-border: rgb(255 255 255 / 0.85);
    --glow-text: #14161b;
    --glow-text-2: rgb(20 22 27 / 0.6);
    --glow-track: rgb(20 22 27 / 0.08);
    --glow-shadow: 0 10px 30px -12px rgb(20 22 27 / 0.18);
    --glow-tint: 0.14;
    --glow-glow: 0.35;
  }
  :host([dark]) {
    --glow-wall: #07080b;
    --glow-glass: rgb(255 255 255 / 0.06);
    --glow-glass-strong: rgb(28 30 36 / 0.82);
    --glow-border: rgb(255 255 255 / 0.1);
    --glow-text: #f5f6f8;
    --glow-text-2: rgb(245 246 248 / 0.6);
    --glow-track: rgb(255 255 255 / 0.08);
    --glow-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.6);
    --glow-tint: 0.16;
    --glow-glow: 0.5;
  }
  :host([font='theme']) {
    --glow-font: var(--primary-font-family, inherit);
  }
`;

/** Frosted glass surface; add the `active` class for the tinted, glowing state. */
export const glassStyles = css`
  .glass {
    position: relative;
    box-sizing: border-box;
    font-family: var(--glow-font);
    color: var(--glow-text);
    background: var(--glow-glass);
    border: 1px solid var(--glow-border);
    border-radius: var(--glow-radius);
    box-shadow: var(--glow-shadow);
    backdrop-filter: blur(var(--glow-blur)) saturate(140%);
    -webkit-backdrop-filter: blur(var(--glow-blur)) saturate(140%);
    transition:
      background 240ms ease,
      border-color 240ms ease,
      box-shadow 240ms ease;
  }
  .glass.active {
    background:
      linear-gradient(
        rgb(var(--glow-accent) / var(--glow-tint)),
        rgb(var(--glow-accent) / var(--glow-tint))
      ),
      var(--glow-glass);
    border-color: rgb(var(--glow-accent) / 0.4);
    box-shadow:
      var(--glow-shadow),
      0 14px 40px -10px rgb(var(--glow-accent) / var(--glow-glow));
  }
  .glass.unavailable {
    border-style: dashed;
    opacity: 0.55;
  }
`;

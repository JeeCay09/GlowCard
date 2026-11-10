import { unsafeCSS, type CSSResult } from 'lit';

/**
 * The one definition of a lit orb (#139). Every round, glowing icon in GlowCard uses it:
 * the orb component, the nav bar, the heading icon, status dots, chips and the small
 * energy source circles. The icon on it is always white; the orb is a touch deeper than
 * its colour and the icon has a fine shadow in a dark tone of it, so white stays
 * readable on light colours such as warm or cool white.
 *
 * `color` is a CSS colour expression, e.g. `rgb(var(--glow-accent))` or `var(--e-solar)`.
 */
export const ORB_ICON_COLOR = unsafeCSS('#ffffff');

/** Background of a lit orb. The highlight is opaque so a dark card cannot show through. */
export function orbLitBackground(color: string): CSSResult {
  return unsafeCSS(
    `radial-gradient(circle at 35% 30%, ` +
      `color-mix(in srgb, #ffffff 45%, ${color}), ` +
      `color-mix(in srgb, ${color} 82%, #5a2e00) 62%)`,
  );
}

/** `filter` value for the icon on a lit orb. */
export function orbIconShadow(color: string): CSSResult {
  return unsafeCSS(`drop-shadow(0 1px 2px color-mix(in srgb, ${color} 45%, #3a1c00))`);
}

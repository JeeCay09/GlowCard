import type { ActionConfig } from '../../core/action';
import { ACCENTS, hexToRgb, lightColor, resolveAccent, type Rgb } from '../../core/color';
import type { HassEntity } from '../../types/hass';

/** One button of the navigation bar. */
export interface NavButtonConfig {
  icon?: string;
  /** Shown as tooltip and read out by screen readers. */
  name?: string;
  /** Short form for a navigate action: a view path (`/dashboard/view`) or a popup hash (`#kitchen`). */
  navigation_path?: string;
  /** Any HA action; wins over `navigation_path`. */
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  /** Optional: a small status dot shows while this entity is on (light on, vacuum cleaning …). */
  entity?: string;
  /** Glow colour of this button (accent name or hex); default: the card's `color`. */
  color?: string | number[];
}

/** States that count as "on" for the status dot. */
const ACTIVE_STATES = new Set(['on', 'open', 'home', 'playing', 'heat', 'cool', 'cleaning']);

/** The action a tap runs: `tap_action`, else navigate to `navigation_path`, else nothing. */
export function tapActionOf(b: NavButtonConfig): ActionConfig {
  if (b.tap_action) return b.tap_action;
  if (b.navigation_path) return { action: 'navigate', navigation_path: b.navigation_path };
  return { action: 'none' };
}

/** The place a button leads to, used to find the current button. */
export function targetOf(b: NavButtonConfig): string | undefined {
  const a = tapActionOf(b);
  return a.action === 'navigate' ? a.navigation_path || undefined : undefined;
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Index of the button for the current location, or -1. A popup hash (`#kitchen`) wins
 * while it is open; otherwise the view path must match (query and trailing slash ignored).
 * Relative paths (`kitchen`) match the last part of the current path.
 */
export function currentIndex(
  buttons: NavButtonConfig[],
  loc: { pathname: string; hash: string },
): number {
  const targets = buttons.map(targetOf);
  if (loc.hash && loc.hash !== '#') {
    const i = targets.findIndex((t) => t === loc.hash);
    if (i >= 0) return i;
  }
  const path = trimSlash(loc.pathname);
  return targets.findIndex((t) => {
    if (!t || t.startsWith('#')) return false;
    const bare = trimSlash(t.split(/[?#]/)[0]);
    if (bare.startsWith('/')) return bare === path;
    return path === bare || path.endsWith(`/${bare}`);
  });
}

/** True while the dot entity is on (on, open, home, playing, heating, cleaning). */
export function dotActive(e: HassEntity | undefined): boolean {
  return !!e && ACTIVE_STATES.has(e.state);
}

/** Colour from the config: accent name, hex string or [r, g, b] from the colour picker. */
export function configColor(color: unknown, dark: boolean): Rgb | null {
  if (Array.isArray(color) && color.length === 3 && color.every((c) => typeof c === 'number')) {
    return [color[0], color[1], color[2]];
  }
  if (typeof color === 'string' && color) {
    if (ACCENTS[color.toLowerCase()]) return resolveAccent(color, dark, 'indigo');
    return hexToRgb(color);
  }
  return null;
}

/** Glow colour of a button: its own colour, else the card's colour, else indigo. */
export function buttonColor(b: NavButtonConfig, cardColor: unknown, dark: boolean): Rgb {
  return (
    configColor(b.color, dark) ??
    configColor(cardColor, dark) ??
    resolveAccent('indigo', dark, 'indigo')
  );
}

/**
 * Dot colour as in the mockup: a light's current colour (warm Glow tone without one),
 * else the button's own colour, else green ("running").
 */
export function dotColor(e: HassEntity | undefined, own: Rgb | undefined, dark: boolean): Rgb {
  if (e?.entity_id.startsWith('light.'))
    return lightColor(e) ?? resolveAccent('warm', dark, 'warm');
  return own ?? resolveAccent('green', dark, 'green');
}

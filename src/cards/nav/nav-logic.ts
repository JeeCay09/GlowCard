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

/** Where the marker of a bar was last placed, shared by all bars on the page. */
export interface NavHandoff {
  /** Identifies the bar by its buttons, so only an identical bar continues the glide. */
  sig: string;
  /** Button the marker was on before `index` (-1: none). */
  prev: number;
  index: number;
  /** Time of the last move (ms). */
  at: number;
}

/** How long after a tap a new bar still continues the glide from the old button. */
export const HANDOFF_MS = 1500;

/** Signature of a bar: its button targets and icons. */
export function navSignature(buttons: NavButtonConfig[]): string {
  return JSON.stringify(buttons.map((b) => [targetOf(b) ?? '', b.icon ?? '']));
}

/** New handoff after the marker of a bar was placed on `index`. */
export function nextHandoff(
  h: NavHandoff | undefined,
  sig: string,
  index: number,
  now: number,
): NavHandoff {
  if (h && h.sig === sig && h.index === index) return h;
  return { sig, prev: h && h.sig === sig ? h.index : -1, index, at: now };
}

/**
 * Button a freshly shown bar should start its marker on, so it glides on to `target`;
 * -1 to place it right away. After a tap in the old bar the marker continues from the
 * button before it; if the old bar never saw the change, it starts where that bar left it.
 */
export function glideStart(
  h: NavHandoff | undefined,
  sig: string,
  target: number,
  now: number,
): number {
  if (!h || h.sig !== sig || target < 0) return -1;
  if (h.index !== target) return h.index;
  return now - h.at < HANDOFF_MS && h.prev !== target ? h.prev : -1;
}

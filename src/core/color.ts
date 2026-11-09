import type { HassEntity } from '../types/hass';

/**
 * Named accent colours from the mockups (same value in light and dark, except teal,
 * which the plug board uses in two shades).
 */
export const ACCENTS: Record<string, { dark: string; light: string }> = {
  amber: { dark: '#F5A524', light: '#F5A524' },
  heat: { dark: '#F26B3A', light: '#F26B3A' },
  orange: { dark: '#F26B3A', light: '#F26B3A' },
  blue: { dark: '#3B82F6', light: '#3B82F6' },
  violet: { dark: '#8B5CF6', light: '#8B5CF6' },
  sky: { dark: '#0EA5E9', light: '#0EA5E9' },
  green: { dark: '#10B981', light: '#10B981' },
  cyan: { dark: '#06B6D4', light: '#06B6D4' },
  indigo: { dark: '#6366F1', light: '#6366F1' },
  teal: { dark: '#2DD4BF', light: '#14B8A6' },
  warm: { dark: '#FFC872', light: '#FFC872' },
  red: { dark: '#EF4444', light: '#EF4444' },
  pink: { dark: '#EC4899', light: '#EC4899' },
  yellow: { dark: '#EAB308', light: '#EAB308' },
  purple: { dark: '#8B5CF6', light: '#8B5CF6' },
};

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "r,g,b" so CSS can use it as rgb(var(--x)) and rgba(var(--x), 0.4). */
export function rgbTriplet([r, g, b]: Rgb): string {
  return `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
}

/** Mixes two colours; f = 0 gives a, f = 1 gives b. */
export function mix(a: Rgb, b: Rgb, f: number): Rgb {
  return a.map((v, i) => Math.round(v + (b[i] - v) * f)) as Rgb;
}

/** True when a colour is so light that icons on it need a dark colour (mockup rule). */
export function isBright([r, g, b]: Rgb): boolean {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

/** Hue 0–360, saturation 0–100 (as in hs_color) at full brightness. */
export function hsToRgb(h: number, s: number): Rgb {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

/** Approximate colour of white light at a colour temperature (Tanner Helland). */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g =
    t <= 66
      ? clamp(99.4708025861 * Math.log(t) - 161.1195681661)
      : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return [r, g, b];
}

/** Resolves a configured colour (accent name or hex) for the current theme. */
export function resolveAccent(color: string | undefined, dark: boolean, fallback: string): Rgb {
  const pick = (name: string) => {
    const accent = ACCENTS[name];
    return accent ? hexToRgb(dark ? accent.dark : accent.light) : null;
  };
  if (color) {
    const rgb = pick(color.toLowerCase()) ?? hexToRgb(color);
    if (rgb) return rgb;
  }
  return pick(fallback) ?? [245, 165, 36];
}

/** The light's current colour, or null when it is off or has no colour info. */
export function lightColor(entity: HassEntity | undefined): Rgb | null {
  if (!entity || entity.state !== 'on') return null;
  const a = entity.attributes;
  if (Array.isArray(a.rgb_color) && a.rgb_color.length === 3) return [...a.rgb_color] as Rgb;
  if (Array.isArray(a.hs_color) && a.hs_color.length === 2)
    return hsToRgb(a.hs_color[0], a.hs_color[1]);
  if (typeof a.color_temp_kelvin === 'number') return kelvinToRgb(a.color_temp_kelvin);
  return null;
}

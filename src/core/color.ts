import type { HassEntity } from '../types/hass';

/** Named accent colours of the Glow design, one value per theme. */
export const ACCENTS: Record<string, { dark: string; light: string }> = {
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  orange: { dark: '#FB923C', light: '#F97316' },
  red: { dark: '#F87171', light: '#EF4444' },
  pink: { dark: '#F472B6', light: '#EC4899' },
  violet: { dark: '#A78BFA', light: '#8B5CF6' },
  blue: { dark: '#60A5FA', light: '#3B82F6' },
  sky: { dark: '#38BDF8', light: '#0EA5E9' },
  teal: { dark: '#2DD4BF', light: '#14B8A6' },
  green: { dark: '#34D399', light: '#10B981' },
  warm: { dark: '#FFC872', light: '#F5A524' },
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

/** "r, g, b" so CSS can use it as rgb(var(--x)) and rgb(var(--x) / 0.4). */
export function rgbTriplet([r, g, b]: Rgb): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
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
  return pick(fallback) ?? [251, 191, 36];
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

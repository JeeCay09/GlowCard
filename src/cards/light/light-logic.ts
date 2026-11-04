import type { HassEntity } from '../../types/hass';
import { hexToRgb, kelvinToRgb, type Rgb } from '../../core/color';
import type { LocalizeKey } from '../../core/localize';

/** What a light can do, from `supported_color_modes`. */
export interface LightCaps {
  brightness: boolean;
  colorTemp: boolean;
  color: boolean;
}

const COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];

export function lightCaps(e?: HassEntity): LightCaps {
  const modes = e?.attributes.supported_color_modes ?? [];
  const color = modes.some((m) => COLOR_MODES.includes(m));
  const colorTemp = modes.includes('color_temp');
  const brightness =
    color ||
    colorTemp ||
    modes.includes('brightness') ||
    modes.includes('white') ||
    (modes.length === 0 && typeof e?.attributes.brightness === 'number');
  return { brightness, colorTemp, color };
}

/** Brightness in percent (0 when off). */
export function brightnessPct(e?: HassEntity): number {
  if (e?.state !== 'on') return 0;
  const b = e.attributes.brightness;
  return typeof b === 'number' ? Math.max(1, Math.round((b / 255) * 100)) : 100;
}

/** Supported colour temperature range in kelvin. */
export function kelvinRange(e?: HassEntity): [number, number] {
  const min = Number(e?.attributes.min_color_temp_kelvin);
  const max = Number(e?.attributes.max_color_temp_kelvin);
  return [
    Number.isFinite(min) && min > 0 ? min : 2000,
    Number.isFinite(max) && max > 0 ? max : 6500,
  ];
}

/** Current hue 0–360 (0 without colour info). */
export function hue(e?: HassEntity): number {
  const hs = e?.attributes.hs_color;
  return Array.isArray(hs) ? Math.round(hs[0]) : 0;
}

export interface LightSwatch {
  key: LocalizeKey;
  color: string;
  /** White presets are set as colour temperature where the light supports it. */
  kelvin?: number;
}

/** The colour circles of the light popup mockup, in order. */
export const SWATCHES: LightSwatch[] = [
  { key: 'warm_white', color: '#FFC872', kelvin: 2700 },
  { key: 'neutral_white', color: '#FFE7C2', kelvin: 4000 },
  { key: 'cool_white', color: '#CFE0FF', kelvin: 6500 },
  { key: 'amber', color: '#F5A524' },
  { key: 'coral', color: '#F26B3A' },
  { key: 'violet', color: '#8B5CF6' },
  { key: 'blue', color: '#3B82F6' },
];

/** Swatches the light can show: whites need colour temp or colour, the rest need colour. */
export function swatchesFor(caps: LightCaps): LightSwatch[] {
  if (caps.color) return SWATCHES;
  if (caps.colorTemp) return SWATCHES.filter((s) => s.kelvin);
  return [];
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The swatch matching the light's current colour, if any. */
export function matchSwatch(e?: HassEntity): LightSwatch | undefined {
  if (e?.state !== 'on') return undefined;
  const a = e.attributes;
  if (a.color_mode === 'color_temp' && typeof a.color_temp_kelvin === 'number') {
    const k = a.color_temp_kelvin;
    return SWATCHES.find((s) => s.kelvin && Math.abs(s.kelvin - k) <= 300);
  }
  if (Array.isArray(a.rgb_color)) {
    const rgb = a.rgb_color as Rgb;
    let best: LightSwatch | undefined;
    let bestD = 36;
    for (const s of SWATCHES) {
      const d = dist(rgb, hexToRgb(s.color)!);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }
  return undefined;
}

/** Service data for picking a swatch. */
export function swatchServiceData(s: LightSwatch, caps: LightCaps): Record<string, unknown> {
  if (s.kelvin && caps.colorTemp) return { color_temp_kelvin: s.kelvin };
  return { rgb_color: hexToRgb(s.color) };
}

/** Vertical fill for the colour temperature tab: warm at the bottom, cold at the top. */
export function kelvinGradient([min, max]: [number, number]): string {
  const c = (k: number) => `rgb(${kelvinToRgb(k).map(Math.round).join(',')})`;
  return `linear-gradient(0deg, ${c(min)}, ${c((min + max) / 2)}, ${c(max)})`;
}

/** Vertical fill for the colour tab: the hue circle from bottom to top. */
export const HUE_GRADIENT =
  'linear-gradient(0deg, #ff0000, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000)';

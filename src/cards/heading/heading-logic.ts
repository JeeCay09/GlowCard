import type { HassEntity, HomeAssistant } from '../../types/hass';
import { hexToRgb, lightColor, resolveAccent, ACCENTS, type Rgb } from '../../core/color';
import { language } from '../../core/localize';
import {
  entityName,
  formatPct,
  isProblem,
  isUnavailable,
  paletteColor,
  segmentView,
  stateText,
  type SegmentConfig,
  type SegmentView,
} from '../status/status-logic';
import { st } from '../status/status-i18n';

/**
 * Data side of the heading card (board GlowHeading): badges and the optional glowing
 * icon. Only standard entities are used.
 */

/** A badge is an entity id or a segment config (type defaults to `entity`). */
export type BadgeConfig = string | (Partial<SegmentConfig> & { entity?: string });

export function badgeSegment(b: BadgeConfig): SegmentConfig {
  if (typeof b === 'string') return { type: 'entity', entity: b };
  return { ...b, type: b.type ?? 'entity' } as SegmentConfig;
}

/** Battery levels at or below this are shown as a red warning badge. */
export const LOW_BATTERY = 15;

const ACTIVE_STATES = new Set(['on', 'open', 'home', 'playing', 'heat', 'cool', 'cleaning']);

const DC_ICONS: Record<string, string> = {
  temperature: 'mdi:thermometer',
  humidity: 'mdi:water-percent',
  power: 'mdi:flash',
  energy: 'mdi:lightning-bolt',
  illuminance: 'mdi:brightness-5',
  co2: 'mdi:molecule-co2',
  pressure: 'mdi:gauge',
  moisture: 'mdi:water',
};

const DOMAIN_ICONS: Record<string, string> = {
  light: 'mdi:lightbulb',
  switch: 'mdi:toggle-switch-variant',
  input_boolean: 'mdi:toggle-switch-variant',
  fan: 'mdi:fan',
  media_player: 'mdi:speaker',
  lock: 'mdi:lock',
  person: 'mdi:account',
  binary_sensor: 'mdi:checkbox-blank-circle-outline',
  climate: 'mdi:thermostat',
  cover: 'mdi:window-shutter',
  vacuum: 'mdi:robot-vacuum',
};

function num(hass: HomeAssistant, v: number, digits: number): string {
  return new Intl.NumberFormat(language(hass), { maximumFractionDigits: digits }).format(v);
}

function batteryIcon(level: number): string {
  if (level <= LOW_BATTERY) return 'mdi:battery-alert-variant-outline';
  const step = Math.min(90, Math.max(10, Math.round(level / 10) * 10));
  return level >= 95 ? 'mdi:battery' : `mdi:battery-${step}`;
}

/** Short value as in the mockup: "21,5°", "60 %", else the formatted state. */
export function compactValue(hass: HomeAssistant, e: HassEntity): string {
  const dc = e.attributes.device_class;
  const n = Number(e.state);
  if (e.entity_id.startsWith('sensor.') && e.state !== '' && Number.isFinite(n)) {
    if (dc === 'temperature') return `${num(hass, n, 1)}°`;
    if (dc === 'humidity' || dc === 'battery' || dc === 'moisture') return formatPct(hass, n);
  }
  return stateText(hass, e);
}

/** Badge of the heading card: segment types reuse the status views, entities get short values. */
export function badgeView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  if (cfg.type !== 'entity') return segmentView(hass, cfg, dark);
  const e = cfg.entity ? hass.states[cfg.entity] : undefined;
  const name = cfg.name ?? entityName(hass, cfg.entity ?? '');
  const domain = cfg.entity?.split('.')[0] ?? '';
  const dc = String(e?.attributes.device_class ?? '');
  const base = { label: name, chipText: name, pulse: false, popup: false, entity: cfg.entity };
  const ownIcon = cfg.icon ?? (typeof e?.attributes.icon === 'string' ? e.attributes.icon : '');

  if (!e || isUnavailable(e)) {
    const u = st(hass, 'unreachable');
    return {
      ...base,
      icon: ownIcon || DOMAIN_ICONS[domain] || DC_ICONS[dc] || 'mdi:circle-outline',
      value: '–',
      chipSub: u,
      tone: 'unavailable',
      rgb: resolveAccent(cfg.color, dark, 'amber'),
    };
  }

  const value = compactValue(hass, e);
  const level = Number(e.state);
  if (domain === 'sensor' && dc === 'battery' && Number.isFinite(level)) {
    const low = level <= LOW_BATTERY;
    return {
      ...base,
      icon: ownIcon || batteryIcon(level),
      value: low ? st(hass, 'battery_low', { v: value }) : value,
      chipSub: value,
      tone: low ? 'warning' : 'neutral',
      pulse: low,
      rgb: low ? paletteColor('red', dark) : resolveAccent(cfg.color, dark, 'green'),
    };
  }

  const icon = ownIcon || DC_ICONS[dc] || DOMAIN_ICONS[domain] || 'mdi:circle-outline';
  if (
    domain === 'binary_sensor' &&
    ['problem', 'smoke', 'moisture', 'gas', 'safety'].includes(dc)
  ) {
    const alarm = isProblem(e);
    return {
      ...base,
      icon,
      value,
      chipSub: value,
      tone: alarm ? 'warning' : 'neutral',
      pulse: alarm,
      rgb: alarm ? paletteColor('red', dark) : resolveAccent(cfg.color, dark, 'green'),
    };
  }

  const active = ACTIVE_STATES.has(e.state);
  const rgb =
    (!cfg.color && domain === 'light' ? lightColor(e) : null) ??
    (domain === 'light' && !cfg.color
      ? paletteColor('warm', dark)
      : resolveAccent(cfg.color, dark, 'amber'));
  return { ...base, icon, value, chipSub: value, tone: active ? 'active' : 'neutral', rgb };
}

/** Glow colour from the config: accent name, hex string or [r, g, b] from the colour picker. */
export function parseColor(color: unknown, dark: boolean): Rgb | null {
  if (Array.isArray(color) && color.length === 3 && color.every((c) => typeof c === 'number')) {
    return [color[0], color[1], color[2]];
  }
  if (typeof color === 'string' && color) {
    if (ACCENTS[color.toLowerCase()] || hexToRgb(color)) return resolveAccent(color, dark, 'amber');
  }
  return null;
}

/** True when the entity that lets the icon glow is "on" (on, open, playing, home …). */
export function glowActive(e: HassEntity | undefined): boolean {
  return !!e && !isUnavailable(e) && ACTIVE_STATES.has(e.state);
}

/**
 * Glow colour of the icon: the chosen colour wins; without one a light uses its current
 * colour, everything else the warm Glow tone.
 */
export function glowColor(e: HassEntity | undefined, color: unknown, dark: boolean): Rgb {
  return parseColor(color, dark) ?? lightColor(e) ?? paletteColor('warm', dark);
}

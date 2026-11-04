import type { HassEntity, HomeAssistant } from '../../types/hass';
import type { ActionConfig } from '../../core/action';
import { hexToRgb, lightColor, resolveAccent, ACCENTS, type Rgb } from '../../core/color';
import { language } from '../../core/localize';
import { sameDay } from '../../core/format';
import { isStatusKey, st, type StatusKey } from './status-i18n';

/**
 * Data side of the header, status bar and chips (board GlowChips): turns a segment
 * config plus `hass` into what a segment, chip or icon-only chip shows.
 * Only standard entities are used (weather, light, person, power/battery sensors,
 * binary_sensor, lock, alarm_control_panel, vacuum).
 */

export type SegmentType =
  'weather' | 'lights' | 'energy' | 'battery' | 'security' | 'alert' | 'person' | 'entity';

export const SEGMENT_TYPES: SegmentType[] = [
  'weather',
  'lights',
  'energy',
  'battery',
  'security',
  'alert',
  'person',
  'entity',
];

export type EntityRef = string | { entity: string; name?: string };

export interface SegmentConfig {
  type: SegmentType;
  entity?: string;
  /** lights: list or "all" (default); security: sensors, locks, alarm panels. */
  entities?: EntityRef[] | 'all';
  name?: string;
  icon?: string;
  color?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  // energy / battery (power in W or kW; battery_power > 0 = charging, grid > 0 = import)
  solar?: string;
  battery?: string;
  battery_power?: string;
  grid?: string;
  home?: string;
  navigation_path?: string;
  // alert
  detail_entity?: string;
  vacuum?: string;
  /** alert: hide the segment/chip while there is nothing to report (default true). */
  hide_when_ok?: boolean;
}

/** neutral = plain glass, active = tinted + glow, calm = soft green, warning = red + pulse. */
export type Tone = 'neutral' | 'active' | 'calm' | 'warning' | 'unavailable';

export interface SegmentView {
  icon: string;
  /** Status bar: bold value + small label. */
  value: string;
  label: string;
  /** Chip: text + muted sub text. */
  chipText: string;
  chipSub?: string;
  tone: Tone;
  rgb: Rgb;
  pulse: boolean;
  /** Weather chip: icon without orb background. */
  bareIcon?: boolean;
  /** Battery chip: ring progress 0–100. */
  ring?: number;
  avatar?: { initial: string; picture?: string; home: boolean };
  badge?: string;
  hidden?: boolean;
  /** Segment has its own popup (lights, energy, battery, security, alert). */
  popup: boolean;
  /** Entity for more-info. */
  entity?: string;
}

// ---------- colours (board GlowChips, per theme) ----------

const PALETTE = {
  warm: { dark: [255, 165, 110], light: [249, 140, 80] },
  solar: { dark: [251, 191, 36], light: [245, 158, 11] },
  green: { dark: [52, 211, 153], light: [16, 185, 129] },
  red: { dark: [251, 113, 133], light: [225, 29, 72] },
  grid: { dark: [96, 165, 250], light: [59, 130, 246] },
  home: { dark: [255, 231, 176], light: [245, 158, 11] },
} satisfies Record<string, { dark: Rgb; light: Rgb }>;

export type PaletteName = keyof typeof PALETTE;

export function paletteColor(name: PaletteName, dark: boolean): Rgb {
  return PALETTE[name][dark ? 'dark' : 'light'] as Rgb;
}

/** Configured colour (accent name or hex) or the board's colour for this segment. */
export function segmentColor(color: string | undefined, fallback: PaletteName, dark: boolean): Rgb {
  if (color && (ACCENTS[color.toLowerCase()] || hexToRgb(color))) {
    return resolveAccent(color, dark, 'amber');
  }
  return paletteColor(fallback, dark);
}

// ---------- entity helpers ----------

const UNAVAILABLE = new Set(['unavailable', 'unknown']);

export function isUnavailable(e: HassEntity | undefined): boolean {
  return !e || UNAVAILABLE.has(e.state);
}

export function refId(ref: EntityRef): string {
  return typeof ref === 'string' ? ref : ref.entity;
}

export function refName(hass: HomeAssistant, ref: EntityRef): string {
  const id = refId(ref);
  if (typeof ref !== 'string' && ref.name) return ref.name;
  return entityName(hass, id);
}

export function entityName(hass: HomeAssistant, id: string): string {
  return hass.states[id]?.attributes.friendly_name ?? id;
}

/** Name of the device an entity belongs to, e.g. "Vesta" for binary_sensor.vesta_problem. */
export function deviceName(hass: HomeAssistant, id: string): string | undefined {
  const dev = hass.entities?.[id]?.device_id;
  const name = dev ? hass.devices?.[dev]?.name : undefined;
  return name?.trim() || undefined;
}

export function areaOf(hass: HomeAssistant, id: string): string | undefined {
  const entry = hass.entities?.[id];
  const areaId =
    entry?.area_id ?? (entry?.device_id ? hass.devices?.[entry.device_id]?.area_id : undefined);
  return areaId ? hass.areas?.[areaId]?.name : undefined;
}

function isGroup(e: HassEntity | undefined): boolean {
  return Array.isArray(e?.attributes.entity_id);
}

/** Lights of a lights segment; "all" skips light groups and hidden entities. */
export function lightIds(hass: HomeAssistant, cfg: SegmentConfig): string[] {
  if (Array.isArray(cfg.entities) && cfg.entities.length) return cfg.entities.map(refId);
  return Object.keys(hass.states).filter((id) => {
    if (!id.startsWith('light.')) return false;
    const entry = hass.entities?.[id];
    if (entry?.hidden || entry?.entity_category) return false;
    return !isGroup(hass.states[id]);
  });
}

export function lightsOn(hass: HomeAssistant, ids: string[]): string[] {
  return ids.filter((id) => hass.states[id]?.state === 'on');
}

/** Colour of the first light that is on (rule: lights use their current colour). */
export function lightsColor(hass: HomeAssistant, on: string[], dark: boolean, color?: string): Rgb {
  if (!color) {
    for (const id of on) {
      const c = lightColor(hass.states[id]);
      if (c) return c;
    }
  }
  return segmentColor(color, 'warm', dark);
}

/** Power in W from a sensor in W or kW (null when missing or not a number). */
export function powerW(hass: HomeAssistant, id?: string): number | null {
  const e = id ? hass.states[id] : undefined;
  if (!e || isUnavailable(e)) return null;
  const v = Number(e.state);
  if (!Number.isFinite(v)) return null;
  const unit = String(e.attributes.unit_of_measurement ?? 'W');
  if (unit === 'kW') return v * 1000;
  if (unit === 'MW') return v * 1_000_000;
  return v;
}

export function numberState(hass: HomeAssistant, id?: string): number | null {
  const e = id ? hass.states[id] : undefined;
  if (!e || isUnavailable(e)) return null;
  const v = Number(e.state);
  return Number.isFinite(v) ? v : null;
}

/** "2,35 kW", "0 kW", or signed "+2,05 kW" / "−0,40 kW". */
export function formatKw(hass: HomeAssistant | undefined, watts: number, signed = false): string {
  const kw = Math.abs(watts) < 5 ? 0 : watts / 1000;
  if (kw === 0) return '0 kW';
  const n = new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(kw));
  const sign = signed ? (kw > 0 ? '+' : '−') : kw < 0 ? '−' : '';
  return `${sign}${n} kW`;
}

export function formatPct(hass: HomeAssistant | undefined, v: number): string {
  return `${new Intl.NumberFormat(language(hass), { maximumFractionDigits: 0 }).format(v)} %`;
}

/** "heute 06:31", "gestern 17:02", "Mo. 02.11 17:02". */
export function formatWhen(hass: HomeAssistant | undefined, date: Date, now = new Date()): string {
  const lang = language(hass);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (sameDay(date, now)) return `${st(hass, 'today')} ${time}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (sameDay(date, y)) return `${st(hass, 'yesterday')} ${time}`;
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(date)
    .replace(/\.$/, '');
  return `${day} ${time}`;
}

export function formatTime(hass: HomeAssistant | undefined, date: Date): string {
  return new Intl.DateTimeFormat(language(hass), { hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
}

/** Translated state from Home Assistant, falling back to the raw state. */
export function stateText(hass: HomeAssistant, e: HassEntity | undefined): string {
  if (!e) return '';
  try {
    if (hass.formatEntityState) return hass.formatEntityState(e);
  } catch {
    /* older frontends */
  }
  return e.state;
}

// ---------- weather ----------

const WEATHER_ICONS: Record<string, string> = {
  'clear-night': 'mdi:weather-night',
  cloudy: 'mdi:weather-cloudy',
  exceptional: 'mdi:alert-circle-outline',
  fog: 'mdi:weather-fog',
  hail: 'mdi:weather-hail',
  lightning: 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  partlycloudy: 'mdi:weather-partly-cloudy',
  pouring: 'mdi:weather-pouring',
  rainy: 'mdi:weather-rainy',
  snowy: 'mdi:weather-snowy',
  'snowy-rainy': 'mdi:weather-snowy-rainy',
  sunny: 'mdi:weather-sunny',
  windy: 'mdi:weather-windy',
  'windy-variant': 'mdi:weather-windy-variant',
};

function weatherView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const e = cfg.entity ? hass.states[cfg.entity] : undefined;
  const base = {
    icon: cfg.icon ?? WEATHER_ICONS[e?.state ?? ''] ?? 'mdi:weather-partly-cloudy',
    rgb: segmentColor(cfg.color, 'warm', dark),
    pulse: false,
    bareIcon: true,
    popup: false,
    entity: cfg.entity,
  };
  if (!e || isUnavailable(e)) {
    const u = st(hass, 'unreachable');
    return { ...base, value: '–', label: u, chipText: '–', chipSub: u, tone: 'unavailable' };
  }
  const t = e.attributes.temperature;
  const temp =
    typeof t === 'number'
      ? `${new Intl.NumberFormat(language(hass), { maximumFractionDigits: 1 }).format(t)}°`
      : '–';
  const cond = stateText(hass, e);
  const hum = e.attributes.humidity;
  const label = typeof hum === 'number' ? `${cond} · ${formatPct(hass, hum)}` : cond;
  return { ...base, value: temp, label, chipText: temp, chipSub: cond, tone: 'neutral' };
}

// ---------- lights ----------

export function lightsLabel(hass: HomeAssistant, n: number): string {
  if (n === 0) return st(hass, 'no_lights_on');
  return n === 1 ? st(hass, 'one_light_on') : st(hass, 'n_lights_on', { n });
}

function lightsView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const on = lightsOn(hass, lightIds(hass, cfg));
  const n = on.length;
  return {
    icon: cfg.icon ?? 'mdi:lightbulb',
    value: n ? st(hass, 'lights_on_short', { n }) : st(hass, 'lights_off_short'),
    label: cfg.name ?? st(hass, 'lights'),
    chipText: cfg.name && n ? `${cfg.name} · ${n}` : lightsLabel(hass, n),
    tone: n ? 'active' : 'neutral',
    rgb: lightsColor(hass, on, dark, cfg.color),
    pulse: false,
    badge: n ? String(n) : undefined,
    popup: true,
  };
}

// ---------- energy / battery ----------

export interface EnergyNow {
  solar: number | null;
  home: number | null;
  battery: number | null;
  soc: number | null;
  grid: number | null;
}

export function energyNow(hass: HomeAssistant, cfg: SegmentConfig): EnergyNow {
  return {
    solar: powerW(hass, cfg.solar),
    home: powerW(hass, cfg.home),
    battery: powerW(hass, cfg.battery_power),
    soc: numberState(hass, cfg.battery),
    grid: powerW(hass, cfg.grid),
  };
}

/** "lädt", "entlädt", "ruht" from battery power (±20 W counts as idle). */
export function batteryMode(hass: HomeAssistant, w: number | null): string | undefined {
  if (w === null) return undefined;
  if (w > 20) return st(hass, 'charging');
  if (w < -20) return st(hass, 'discharging');
  return st(hass, 'idle');
}

function batteryText(hass: HomeAssistant, now: EnergyNow): string | undefined {
  const parts: string[] = [];
  if (now.soc !== null) parts.push(`${st(hass, 'battery')} ${formatPct(hass, now.soc)}`);
  const mode = batteryMode(hass, now.battery);
  if (mode) parts.push(mode);
  return parts.length ? parts.join(' · ') : undefined;
}

function energyView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const now = energyNow(hass, cfg);
  const solar = now.solar ?? 0;
  const producing = solar >= 5;
  const label = cfg.name ?? batteryText(hass, now) ?? st(hass, 'solar');
  const value =
    now.solar !== null ? formatKw(hass, solar) : now.home !== null ? formatKw(hass, now.home) : '–';
  return {
    icon: cfg.icon ?? 'mdi:white-balance-sunny',
    value,
    label,
    chipText: value,
    chipSub: now.solar !== null ? st(hass, 'solar') : st(hass, 'home'),
    tone: producing ? 'active' : 'neutral',
    rgb: segmentColor(cfg.color, 'solar', dark),
    pulse: false,
    popup: true,
  };
}

function batteryView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const now = energyNow(hass, cfg);
  const soc = now.soc;
  const mode = batteryMode(hass, now.battery);
  const text =
    soc !== null ? `${st(hass, 'battery')} ${formatPct(hass, soc)}` : st(hass, 'battery');
  const unavailable = soc === null && now.battery === null;
  return {
    icon: cfg.icon ?? 'mdi:battery',
    value: soc !== null ? formatPct(hass, soc) : '–',
    label: cfg.name ?? [st(hass, 'battery'), mode].filter(Boolean).join(' · '),
    chipText: cfg.name ? `${cfg.name} ${soc !== null ? formatPct(hass, soc) : ''}`.trim() : text,
    chipSub: mode,
    tone: unavailable ? 'unavailable' : 'active',
    rgb: segmentColor(cfg.color, 'green', dark),
    pulse: false,
    ring: soc ?? 0,
    popup: !!(cfg.solar || cfg.grid || cfg.home || cfg.battery_power),
    entity: cfg.battery,
  };
}

// ---------- security ----------

/** True when a security entity reports something (open, smoke, unlocked, triggered …). */
export function isProblem(e: HassEntity | undefined): boolean {
  if (!e || isUnavailable(e)) return false;
  const domain = e.entity_id.split('.')[0];
  if (domain === 'lock') return e.state !== 'locked';
  if (domain === 'alarm_control_panel') return e.state === 'triggered';
  if (domain === 'cover') return e.state !== 'closed';
  return e.state === 'on' || e.state === 'open';
}

export function deviceClass(e: HassEntity | undefined): string {
  if (!e) return '';
  const domain = e.entity_id.split('.')[0];
  if (domain === 'lock') return 'lock';
  if (domain === 'alarm_control_panel') return 'alarm';
  return String(e.attributes.device_class ?? '');
}

const SECURITY_ICONS: Record<string, [string, string]> = {
  window: ['mdi:window-closed-variant', 'mdi:window-open-variant'],
  door: ['mdi:door-closed', 'mdi:door-open'],
  garage_door: ['mdi:garage', 'mdi:garage-open'],
  opening: ['mdi:square-outline', 'mdi:square-rounded-outline'],
  smoke: ['mdi:smoke-detector-variant', 'mdi:smoke-detector-variant-alert'],
  gas: ['mdi:meter-gas', 'mdi:meter-gas-outline'],
  carbon_monoxide: ['mdi:molecule-co', 'mdi:molecule-co'],
  moisture: ['mdi:water-off', 'mdi:water-alert'],
  safety: ['mdi:shield-check', 'mdi:shield-alert'],
  lock: ['mdi:lock', 'mdi:lock-open-variant'],
  alarm: ['mdi:bell', 'mdi:bell-ring'],
  motion: ['mdi:motion-sensor-off', 'mdi:motion-sensor'],
  occupancy: ['mdi:home-outline', 'mdi:home'],
  tamper: ['mdi:check-circle', 'mdi:alert-circle'],
  problem: ['mdi:check-circle', 'mdi:alert-circle'],
};

export function securityIcon(e: HassEntity | undefined): string {
  if (typeof e?.attributes.icon === 'string') return e.attributes.icon;
  const pair = SECURITY_ICONS[deviceClass(e)] ?? ['mdi:shield-check', 'mdi:shield-alert'];
  return pair[isProblem(e) ? 1 : 0];
}

/** Short state like the mockup: "Zu", "Kein Rauch", "Kein Alarm". */
export function securityState(hass: HomeAssistant, e: HassEntity | undefined): string {
  if (!e) return '';
  if (isUnavailable(e)) return st(hass, 'unreachable');
  const p = isProblem(e);
  const dc = deviceClass(e);
  const pick = (ok: StatusKey, bad: StatusKey) => st(hass, p ? bad : ok);
  switch (dc) {
    case 'window':
    case 'door':
    case 'garage_door':
    case 'opening':
      return pick('st_closed', 'st_open');
    case 'smoke':
      return pick('st_no_smoke', 'st_smoke');
    case 'gas':
    case 'carbon_monoxide':
      return pick('st_no_gas', 'st_gas');
    case 'moisture':
      return pick('st_dry', 'st_wet');
    case 'safety':
      return pick('st_safe', 'st_unsafe');
    case 'motion':
    case 'occupancy':
    case 'vibration':
    case 'sound':
      return pick('st_clear', 'st_detected');
    case 'lock':
      return pick('st_locked', 'st_unlocked');
    case 'alarm':
      if (p) return st(hass, 'st_alarm');
      return e.state === 'disarmed' ? st(hass, 'st_disarmed') : st(hass, 'st_armed');
    case 'tamper':
    case 'problem':
      return pick('st_ok', 'st_problem');
    default:
      return e.entity_id.startsWith('binary_sensor.')
        ? pick('st_no_alarm', 'st_alarm')
        : stateText(hass, e);
  }
}

/** Status bar label for a calm security segment: "Fenster, Rauch". */
export function securityKinds(hass: HomeAssistant, ids: string[]): string {
  const kinds: string[] = [];
  for (const id of ids) {
    const dc = deviceClass(hass.states[id]);
    const key = `dc_${dc}`;
    const label = dc && isStatusKey(key) ? st(hass, key) : '';
    if (label && !kinds.includes(label)) kinds.push(label);
  }
  return kinds.length ? kinds.join(', ') : st(hass, 'sensors');
}

export function securityRefs(cfg: SegmentConfig): EntityRef[] {
  if (Array.isArray(cfg.entities)) return cfg.entities;
  return cfg.entity ? [cfg.entity] : [];
}

function securityView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const refs = securityRefs(cfg);
  const ids = refs.map(refId);
  const problems = refs.filter((r) => isProblem(hass.states[refId(r)]));
  const k = problems.length;
  const value =
    k === 0
      ? st(hass, 'all_closed')
      : k === 1
        ? st(hass, 'one_alert')
        : st(hass, 'n_alerts', { n: k });
  return {
    icon: cfg.icon ?? (k ? 'mdi:shield-alert' : 'mdi:shield-check'),
    value: cfg.name && !k ? cfg.name : value,
    label: k ? problems.map((r) => refName(hass, r)).join(', ') : securityKinds(hass, ids),
    chipText: cfg.name && !k ? cfg.name : value,
    chipSub: k ? problems.map((r) => refName(hass, r)).join(', ') : undefined,
    tone: k ? 'warning' : 'calm',
    rgb: k ? paletteColor('red', dark) : segmentColor(cfg.color, 'green', dark),
    pulse: k > 0,
    badge: k ? String(k) : undefined,
    popup: true,
  };
}

// ---------- alert ----------

export interface AlertParts {
  detail?: string;
  vacuum?: string;
}

/** Error text sensor and vacuum on the same device as the alert entity. */
export function findAlertParts(hass: HomeAssistant, cfg: SegmentConfig): AlertParts {
  const id = cfg.entity ?? '';
  const parts: AlertParts = { detail: cfg.detail_entity, vacuum: cfg.vacuum };
  if (id.startsWith('vacuum.')) parts.vacuum ??= id;
  const dev = hass.entities?.[id]?.device_id;
  if (!dev) return parts;
  const siblings = Object.values(hass.entities ?? {}).filter((x) => x?.device_id === dev);
  for (const s of siblings) {
    if (!s) continue;
    const sid = s.entity_id;
    if (!parts.vacuum && sid.startsWith('vacuum.')) parts.vacuum = sid;
    if (
      !parts.detail &&
      sid.startsWith('sensor.') &&
      (s.translation_key === 'error' || /_error$/.test(sid))
    ) {
      parts.detail = sid;
    }
  }
  return parts;
}

/** Active = problem/on, or a vacuum in state error. */
export function alertActive(e: HassEntity | undefined): boolean {
  if (!e || isUnavailable(e)) return false;
  if (e.entity_id.startsWith('vacuum.')) return e.state === 'error';
  return e.state === 'on' || e.state === 'problem' || e.state === 'error';
}

export function alertName(hass: HomeAssistant, cfg: SegmentConfig): string {
  if (cfg.name) return cfg.name;
  const id = cfg.entity ?? '';
  return deviceName(hass, id) ?? entityName(hass, id);
}

export function alertDetail(hass: HomeAssistant, cfg: SegmentConfig): string {
  const parts = findAlertParts(hass, cfg);
  const d = parts.detail ? hass.states[parts.detail] : undefined;
  if (d && !isUnavailable(d)) return stateText(hass, d);
  return stateText(hass, cfg.entity ? hass.states[cfg.entity] : undefined);
}

function alertView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const e = cfg.entity ? hass.states[cfg.entity] : undefined;
  const active = alertActive(e);
  const name = alertName(hass, cfg);
  const detail = active ? alertDetail(hass, cfg) : st(hass, 'ok');
  return {
    icon: cfg.icon ?? (active ? 'mdi:alert' : 'mdi:check-circle'),
    value: name,
    label: detail,
    chipText: name,
    chipSub: detail,
    tone: active ? 'warning' : isUnavailable(e) ? 'unavailable' : 'calm',
    rgb: active ? segmentColor(cfg.color, 'red', dark) : paletteColor('green', dark),
    pulse: active,
    badge: active ? '1' : undefined,
    hidden: !active && cfg.hide_when_ok !== false,
    popup: active,
    entity: cfg.entity,
  };
}

// ---------- person ----------

export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function personView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const e = cfg.entity ? hass.states[cfg.entity] : undefined;
  const name = cfg.name ?? entityName(hass, cfg.entity ?? '');
  const home = e?.state === 'home';
  const sub = isUnavailable(e)
    ? st(hass, 'unreachable')
    : home
      ? st(hass, 'at_home')
      : e?.state === 'not_home'
        ? st(hass, 'away')
        : stateText(hass, e);
  const picture = e?.attributes.entity_picture;
  return {
    icon: cfg.icon ?? 'mdi:account',
    value: name,
    label: sub,
    chipText: name,
    chipSub: sub,
    tone: home ? 'calm' : 'neutral',
    rgb: segmentColor(cfg.color, 'green', dark),
    pulse: false,
    avatar: {
      initial: initial(name),
      picture: typeof picture === 'string' ? picture : undefined,
      home,
    },
    popup: false,
    entity: cfg.entity,
  };
}

// ---------- any entity ----------

const ACTIVE_STATES = new Set(['on', 'open', 'home', 'playing', 'heat', 'cool', 'cleaning']);

function entityView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  const e = cfg.entity ? hass.states[cfg.entity] : undefined;
  const name = cfg.name ?? entityName(hass, cfg.entity ?? '');
  const unavailable = isUnavailable(e);
  const text = unavailable ? st(hass, 'unreachable') : stateText(hass, e);
  const icon =
    cfg.icon ?? (typeof e?.attributes.icon === 'string' ? e.attributes.icon : 'mdi:circle-outline');
  return {
    icon,
    value: text,
    label: name,
    chipText: name,
    chipSub: text,
    tone: unavailable ? 'unavailable' : ACTIVE_STATES.has(e?.state ?? '') ? 'active' : 'neutral',
    rgb: resolveAccent(cfg.color, dark, 'amber'),
    pulse: false,
    popup: false,
    entity: cfg.entity,
  };
}

export function segmentView(hass: HomeAssistant, cfg: SegmentConfig, dark: boolean): SegmentView {
  switch (cfg.type) {
    case 'weather':
      return weatherView(hass, cfg, dark);
    case 'lights':
      return lightsView(hass, cfg, dark);
    case 'energy':
      return energyView(hass, cfg, dark);
    case 'battery':
      return batteryView(hass, cfg, dark);
    case 'security':
      return securityView(hass, cfg, dark);
    case 'alert':
      return alertView(hass, cfg, dark);
    case 'person':
      return personView(hass, cfg, dark);
    default:
      return entityView(hass, cfg, dark);
  }
}

/** Entities a segment depends on, so the card only re-renders when they change. */
export function segmentEntities(hass: HomeAssistant | undefined, cfg: SegmentConfig): string[] {
  const ids: string[] = [];
  if (cfg.entity) ids.push(cfg.entity);
  if (cfg.type === 'lights' && hass) ids.push(...lightIds(hass, cfg));
  else if (Array.isArray(cfg.entities)) ids.push(...cfg.entities.map(refId));
  for (const k of [
    'solar',
    'battery',
    'battery_power',
    'grid',
    'home',
    'detail_entity',
    'vacuum',
  ] as const) {
    const v = cfg[k];
    if (v) ids.push(v);
  }
  if (cfg.type === 'alert' && hass) {
    const p = findAlertParts(hass, cfg);
    if (p.detail) ids.push(p.detail);
    if (p.vacuum) ids.push(p.vacuum);
  }
  return ids;
}

/** Default tap: own popup when the segment has one, else more-info (none without entity). */
export function defaultTap(view: SegmentView): ActionConfig {
  if (view.popup) return { action: 'popup' };
  return view.entity ? { action: 'more-info' } : { action: 'none' };
}

/** Validates a segment config and throws a readable error. */
export function validateSegment(cfg: SegmentConfig, where: string): void {
  if (!cfg || typeof cfg !== 'object') throw new Error(`${where}: invalid entry`);
  if (!SEGMENT_TYPES.includes(cfg.type)) {
    throw new Error(`${where}: unknown type "${String(cfg.type)}" (${SEGMENT_TYPES.join(', ')})`);
  }
  const needsEntity: SegmentType[] = ['weather', 'alert', 'person', 'entity'];
  if (needsEntity.includes(cfg.type) && !cfg.entity) {
    throw new Error(`${where}: "${cfg.type}" needs an entity`);
  }
  if (cfg.type === 'security' && !cfg.entity && !Array.isArray(cfg.entities)) {
    throw new Error(`${where}: "security" needs entities`);
  }
  if (cfg.type === 'battery' && !cfg.battery && !cfg.battery_power) {
    throw new Error(`${where}: "battery" needs battery (state of charge) or battery_power`);
  }
  if (cfg.type === 'energy' && !cfg.solar && !cfg.home && !cfg.grid && !cfg.battery_power) {
    throw new Error(`${where}: "energy" needs at least one of solar, home, grid, battery_power`);
  }
}

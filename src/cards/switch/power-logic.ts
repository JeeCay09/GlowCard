import type { HassEntity, HomeAssistant } from '../../types/hass';

/** Entities of a smart plug that the card can show next to the switch. */
export interface PlugParts {
  power?: string;
  energy?: string;
  countdown?: string;
  child_lock?: string;
  power_on?: string;
  indicator?: string;
}

export type PlugPartKey = keyof PlugParts;

const PATTERNS: Record<Exclude<PlugPartKey, 'power' | 'energy'>, RegExp> = {
  countdown: /countdown/,
  child_lock: /child_lock/,
  power_on: /power_on_behavio|power_outage_memory|power_on_state|restore|relay_status|startup/,
  indicator: /indicator|backlight|_led/,
};

const DOMAINS: Record<Exclude<PlugPartKey, 'power' | 'energy'>, string[]> = {
  countdown: ['number'],
  child_lock: ['switch', 'lock'],
  power_on: ['select'],
  indicator: ['select'],
};

function objectId(id: string): string {
  return id.split('.')[1] ?? id;
}

function unit(e?: HassEntity): string {
  return String(e?.attributes.unit_of_measurement ?? '');
}

/** Candidate entities for the plug parts: same device first, then by object id prefix. */
type PlugPools = [sameDevice: string[], byPrefix: string[]];

function plugPools(hass: HomeAssistant, entityId: string): PlugPools {
  const device = hass.entities?.[entityId]?.device_id;
  const base = objectId(entityId);
  const all = Object.keys(hass.states).filter((id) => id !== entityId);
  const sameDevice = device ? all.filter((id) => hass.entities?.[id]?.device_id === device) : [];
  const byPrefix = all.filter((id) => objectId(id).startsWith(`${base}_`));
  return [sameDevice, byPrefix];
}

/**
 * Finds the plug's power/energy sensors, countdown, child lock and selects: first among the
 * entities of the same device, then by the switch's object id as prefix
 * (switch.office → sensor.office_power).
 */
export function findPlugParts(hass: HomeAssistant, entityId: string): PlugParts {
  return pickPlugParts(hass, plugPools(hass, entityId));
}

/**
 * Same result as findPlugParts, but remembers the candidate entities between calls. Only
 * the scan over all states is cached: it depends on entity ids and the entity registry,
 * which change rarely, while Home Assistant sends a new `hass` on every state change.
 * The parts themselves are picked from the current states on every call.
 */
export function plugPartsFinder(): (hass: HomeAssistant, entityId: string) => PlugParts {
  let key: { entityId: string; entities: unknown; count: number } | undefined;
  let pools: PlugPools = [[], []];
  return (hass, entityId) => {
    const count = Object.keys(hass.states).length;
    const stale =
      !key ||
      key.entityId !== entityId ||
      key.entities !== hass.entities ||
      key.count !== count ||
      pools.some((pool) => pool.some((id) => !hass.states[id]));
    if (stale) {
      pools = plugPools(hass, entityId);
      key = { entityId, entities: hass.entities, count };
    }
    return pickPlugParts(hass, pools);
  };
}

function pickPlugParts(hass: HomeAssistant, pools: PlugPools): PlugParts {
  const pick = (test: (id: string, e: HassEntity) => boolean): string | undefined => {
    for (const pool of pools) {
      const hit = pool.find((id) => test(id, hass.states[id]!));
      if (hit) return hit;
    }
    return undefined;
  };
  const key = (id: string) => `${hass.entities?.[id]?.translation_key ?? ''} ${id}`;

  const parts: PlugParts = {
    power: pick(
      (id, e) =>
        id.startsWith('sensor.') &&
        (e.attributes.device_class === 'power' || ['W', 'kW'].includes(unit(e))),
    ),
    energy: pick(
      (id, e) =>
        id.startsWith('sensor.') &&
        (e.attributes.device_class === 'energy' || ['kWh', 'Wh'].includes(unit(e))),
    ),
  };
  for (const part of Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]) {
    parts[part] = pick(
      (id) => DOMAINS[part].includes(id.split('.')[0]) && PATTERNS[part].test(key(id)),
    );
  }
  return parts;
}

/** Current power in watts, or undefined if unknown. */
export function watts(e?: HassEntity): number | undefined {
  const v = Number(e?.state);
  if (!e || !Number.isFinite(v)) return undefined;
  return unit(e) === 'kW' ? v * 1000 : v;
}

/** Energy in kWh. */
export function toKwh(value: number, e?: HassEntity): number {
  return unit(e) === 'Wh' ? value / 1000 : value;
}

/** "186 W", "0 W", "4,5 W", "1,2 kW". */
export function formatWatts(lang: string, w: number): string {
  if (Math.abs(w) >= 1000) {
    return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(w / 1000)} kW`;
  }
  const digits = Math.abs(w) < 10 && Math.round(w * 10) % 10 !== 0 ? 1 : 0;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(w)} W`;
}

/** Round chart ceiling above the peak, e.g. 186 → 200. */
export function niceMax(peak: number): number {
  const target = Math.max(peak * 1.02, 10);
  const mag = 10 ** Math.floor(Math.log10(target));
  for (const step of [1, 2, 5, 10]) if (step * mag >= target) return step * mag;
  return 10 * mag;
}

/** Line and area paths of a series, laid out like the mockup charts. */
export function chartPaths(
  series: number[],
  w: number,
  h: number,
  max: number,
): { line: string; area: string; lastY: number } {
  const n = series.length;
  if (n === 0) return { line: '', area: '', lastY: h - 4 };
  const pts = series.map((v, i) => [
    +(n === 1 ? w : (i * w) / (n - 1)).toFixed(1),
    +(h - 4 - (Math.max(0, v) / max) * (h - 12)).toFixed(1),
  ]);
  if (n === 1) pts.unshift([0, pts[0][1]]);
  const line = 'M' + pts.map((p) => p.join(',')).join(' L');
  return { line, area: `${line} L${w},${h} L0,${h} Z`, lastY: pts[pts.length - 1][1] };
}

/** "Ausschalten in" options in seconds. */
export const TIMER_OPTIONS = [0, 1800, 3600, 7200];

/** Seconds per unit of the countdown number entity. */
export function countdownFactor(e?: HassEntity): number {
  const u = unit(e).toLowerCase();
  if (u === 'min') return 60;
  if (u === 'h') return 3600;
  return 1;
}

/** Remaining countdown in seconds (0 = no timer). */
export function countdownSeconds(e?: HassEntity): number {
  const v = Number(e?.state);
  return Number.isFinite(v) && v > 0 ? v * countdownFactor(e) : 0;
}

/** The option that the running countdown belongs to (e.g. 25 min left → 30 Min). */
export function selectedTimer(remaining: number, options = TIMER_OPTIONS): number {
  if (remaining <= 0) return 0;
  return options.find((o) => o > 0 && remaining <= o) ?? options[options.length - 1];
}

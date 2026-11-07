import type { HomeAssistant } from '../../types/hass';
import { language } from '../../core/localize';
import { numberState, powerW } from '../status/status-logic';

/** A measured device: entity id or `{ entity, name }`. */
export type DeviceConfig = string | { entity: string; name?: string };

/**
 * Entities of the energy card "Lastring". Only one is needed: the house consumption
 * (`home`) or the grid power (`grid`, + = import, − = export). Everything else is optional
 * and extends the same card: devices, today's kWh, price, solar and battery.
 */
export interface EnergyEntities {
  home?: string;
  grid?: string;
  solar?: string;
  battery?: string;
  battery_power?: string;
  devices?: DeviceConfig[];
  energy_today?: string;
  /** Price sensor (or a fixed price as a number in YAML). */
  price?: string | number;
  /** Fixed price per kWh, used when `price` is not set (the editor's number field). */
  fixed_price?: number;
  cost_today?: string;
  solar_energy?: string;
  grid_import_energy?: string;
  grid_export_energy?: string;
  /** Upper end of the ring in kW (default 3). */
  max_power?: number;
}

/** Below this (W) a flow counts as idle. */
export const IDLE_W = 10;

export interface EnergyNow {
  /** House consumption in W (measured or derived), null if unknown. */
  home: number | null;
  solar: number | null;
  /** + charging, − discharging. */
  battery: number | null;
  soc: number | null;
  /** + import, − export. */
  grid: number | null;
}

export function readNow(hass: HomeAssistant, c: EnergyEntities): EnergyNow {
  const solar = powerW(hass, c.solar);
  const battery = powerW(hass, c.battery_power);
  const grid = powerW(hass, c.grid);
  let home = powerW(hass, c.home);
  if (home === null && grid !== null) {
    home = Math.max(0, grid + (solar ?? 0) - (battery ?? 0));
  }
  return { home, solar, battery, soc: numberState(hass, c.battery), grid };
}

/** kWh of an energy sensor (Wh / MWh are converted). */
export function energyKwh(hass: HomeAssistant, id?: string): number | null {
  const v = numberState(hass, id);
  if (v === null || !id) return null;
  const unit = String(hass.states[id]?.attributes.unit_of_measurement ?? 'kWh');
  if (unit === 'Wh') return v / 1000;
  if (unit === 'MWh') return v * 1000;
  return v;
}

/** The price: sensor or number from the config, the fixed price field, else the energy dashboard. */
export function priceSource(
  c: EnergyEntities,
  dashboard?: string | number,
): string | number | undefined {
  return c.price ?? c.fixed_price ?? dashboard;
}

/** Price in currency per kWh: a number or a sensor. */
export function priceValue(hass: HomeAssistant, price?: string | number): number | null {
  if (typeof price === 'number') return price;
  return numberState(hass, price);
}

/** Currency of the price sensor (default €). */
export function currency(hass: HomeAssistant, price?: string | number): string {
  if (typeof price !== 'string') return '€';
  const unit = String(hass.states[price]?.attributes.unit_of_measurement ?? '€');
  const cur = unit.split('/')[0].trim();
  return cur === 'EUR' ? '€' : cur || '€';
}

// ---------- tariff from HA's energy dashboard ----------

interface GridFlow {
  stat_energy_from?: string;
  stat_cost?: string | null;
  entity_energy_price?: string | null;
  number_energy_price?: number | null;
}

export interface EnergyPrefs {
  energy_sources?: (GridFlow & { type: string; flow_from?: GridFlow[] })[];
}

export interface EnergyInfo {
  /** Cost entity HA creates per energy statistic when a price is set. */
  cost_sensors?: Record<string, string>;
}

export interface Tariff {
  /** Cost statistics of all grid imports (they apply the price of each moment). */
  costIds: string[];
  /** Price sensor or fixed price from the dashboard (first grid import). */
  price?: string | number;
}

/**
 * Grid tariff from the energy dashboard (`energy/get_prefs` + `energy/info`). Handles the
 * flat grid source (HA 2025.x) and the older `flow_from` list.
 */
export function dashboardTariff(prefs?: EnergyPrefs | null, info?: EnergyInfo | null): Tariff {
  const flows: GridFlow[] = (prefs?.energy_sources ?? [])
    .filter((s) => s.type === 'grid')
    .flatMap((s) => (s.flow_from?.length ? s.flow_from : s.stat_energy_from ? [s] : []));
  const costIds: string[] = [];
  let price: string | number | undefined;
  for (const f of flows) {
    const cost =
      f.stat_cost || (f.stat_energy_from ? info?.cost_sensors?.[f.stat_energy_from] : undefined);
    if (cost && !costIds.includes(cost)) costIds.push(cost);
    price ??= f.entity_energy_price || (f.number_energy_price ?? undefined);
  }
  return { costIds, price };
}

// ---------- devices ----------

export interface DeviceNow {
  entity?: string;
  name: string;
  watts: number;
  /** Colour slot 1–5 for measured devices, 0 = "Nicht erfasst" (not measured). */
  slot: number;
}

export function deviceId(d: DeviceConfig): string {
  return typeof d === 'string' ? d : d.entity;
}

/**
 * Devices sorted by power (colour slot follows the config order, so a device keeps its
 * colour), plus "Nicht erfasst" for the unmeasured rest of the house consumption.
 */
export function readDevices(
  hass: HomeAssistant,
  devices: DeviceConfig[] | undefined,
  home: number | null,
  restName: string,
): DeviceNow[] {
  const list: DeviceNow[] = (devices ?? []).slice(0, 5).map((d, i) => {
    const id = deviceId(d);
    const name =
      (typeof d === 'object' && d.name) || hass.states[id]?.attributes.friendly_name || id;
    return {
      entity: id,
      name: String(name),
      watts: Math.max(0, powerW(hass, id) ?? 0),
      slot: i + 1,
    };
  });
  if (!list.length) return [];
  list.sort((a, b) => b.watts - a.watts);
  const sum = list.reduce((s, d) => s + d.watts, 0);
  if (home !== null && home - sum > IDLE_W) {
    list.push({ name: restName, watts: home - sum, slot: 0 });
  }
  return list;
}

// ---------- sources ----------

export type Source = 'grid' | 'solar' | 'bat';

export interface Flows {
  /** Shares of the house consumption by source, W. */
  toHome: Record<Source, number>;
  /** Solar surplus beyond the house, W. */
  toBattery: number;
  toGrid: number;
  /** The source covering most of the house now. */
  main: Source;
}

export function flows(n: EnergyNow): Flows {
  const home = Math.max(0, n.home ?? 0);
  const solar = Math.max(0, n.solar ?? 0);
  const bat = n.battery ?? 0;
  const fromSolar = Math.min(solar, home);
  const fromBat = Math.min(Math.max(0, -bat), home - fromSolar);
  const fromGrid = Math.max(0, home - fromSolar - fromBat);
  const surplus = Math.max(0, solar - fromSolar);
  const toBattery = Math.min(surplus, Math.max(0, bat));
  const toGrid = Math.max(0, surplus - toBattery);
  const toHome = { solar: fromSolar, bat: fromBat, grid: fromGrid };
  const main = (Object.keys(toHome) as Source[]).reduce(
    (a, b) => (toHome[b] > toHome[a] + 1 ? b : a),
    'grid' as Source,
  );
  return { toHome, toBattery, toGrid, main };
}

// ---------- "usual now" from long-term statistics ----------

export interface HourStat {
  start: number;
  mean: number | null;
  min: number | null;
}

/** Value at quantile q (0–1) of a list (linear interpolation). */
export function quantile(values: number[], q: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export interface Usual {
  /** P20–P80 of the hourly means at this hour of day (W). */
  lo: number;
  hi: number;
}

/** Usual range per hour of day (0–23) from hourly statistics of the last days. */
export function usualByHour(stats: HourStat[], scale = 1): (Usual | null)[] {
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const s of stats) {
    if (s.mean === null || !Number.isFinite(s.mean)) continue;
    byHour[new Date(s.start).getHours()].push(s.mean * scale);
  }
  return byHour.map((v) => {
    if (v.length < 3) return null;
    return { lo: quantile(v, 0.2)!, hi: quantile(v, 0.8)! };
  });
}

/** Base load: 10th percentile of the hourly minimums (W). */
export function baseLoad(stats: HourStat[], scale = 1): number | null {
  const mins = stats.map((s) => s.min).filter((x): x is number => x !== null && Number.isFinite(x));
  if (mins.length < 12) return null;
  return Math.max(0, quantile(mins, 0.1)! * scale);
}

export type Verdict = 'normal' | 'high' | 'low';

export function verdict(home: number, usual: Usual | null): Verdict | null {
  if (!usual) return null;
  if (home > usual.hi) return 'high';
  if (home < usual.lo) return 'low';
  return 'normal';
}

// ---------- ring geometry (Lastring mockup) ----------

export const RING = { a0: -125, a1: 125 } as const;

/** Angle (deg from top) on the ring for a power in W, sqrt scale up to `maxKw`. */
export function ringAngle(watts: number, maxKw: number): number {
  const v = Math.max(0, Math.min(watts / 1000, maxKw));
  return RING.a0 + (RING.a1 - RING.a0) * Math.sqrt(v / maxKw);
}

export function ringPoint(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

export function ringArc(cx: number, cy: number, r: number, a: number, b: number): string {
  if (b - a < 0.01) b = a + 0.01;
  const [x0, y0] = ringPoint(cx, cy, r, a);
  const [x1, y1] = ringPoint(cx, cy, r, b);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Fraction of the local day that has passed (0–1). */
export function dayFraction(now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

// ---------- formatting ----------

function num(hass: HomeAssistant | undefined, v: number, digits: number): string {
  return new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** "0,62 kW" (no sign). */
export function kw(hass: HomeAssistant | undefined, watts: number, digits = 2): string {
  if (Math.abs(watts) < IDLE_W) return '0 kW';
  return `${num(hass, Math.abs(watts) / 1000, digits)} kW`;
}

/** "0,62" (kW value without unit). */
export function kwValue(hass: HomeAssistant | undefined, watts: number, digits = 2): string {
  return num(hass, Math.abs(watts) / 1000, digits);
}

export function kwh(hass: HomeAssistant | undefined, v: number, digits = 1): string {
  return `${num(hass, v, digits)} kWh`;
}

export function money(hass: HomeAssistant | undefined, v: number, cur = '€'): string {
  return `${num(hass, v, 2)} ${cur}`;
}

export function range(hass: HomeAssistant | undefined, u: Usual): string {
  return `${num(hass, u.lo / 1000, 1)}–${num(hass, u.hi / 1000, 1)}`;
}

// ---------- texts ----------

const de = {
  energy: 'Energie',
  consumption_caps: 'VERBRAUCH',
  usual_now: 'üblich',
  normal: 'normal',
  high: 'erhöht',
  low: 'niedrig',
  normal_range: 'Im üblichen Bereich',
  high_range: 'Über dem üblichen Bereich',
  low_range: 'Unter dem üblichen Bereich',
  battery_charge: 'Akkuladung',
  no_production: 'keine Erzeugung',
  all_grid: 'alles aus dem Netz',
  grid_short: 'Netz',
  solar_all_export: 'Solar deckt alles · Rest geht ins Netz',
  solar_all_charge: 'Solar deckt alles · Akku lädt',
  solar_all: 'Solar deckt alles',
  battery_home: 'Akku versorgt das Haus',
  grid_idle: 'Netz ruht',
  house_consumption: 'Hausverbrauch',
  who_draws: 'Verbraucher',
  devices: 'Geräte',
  rest: 'Nicht erfasst',
  not_measured: '(nicht gemessen)',
  today: 'Heute',
  yesterday_so_far: 'Vortag bis jetzt',
  cost_today: 'Kosten heute',
  consumed: 'Verbraucht',
  solar: 'Solar',
  import: 'Bezug',
  export: 'Einspeisung',
  solar_produced: 'Erzeugung',
  night: 'Nacht',
  charging: 'Ladung',
  delivering: 'Entladung',
  idle: 'inaktiv',
  battery: 'Akku',
  base_load: 'Grundlast',
  base_load_long: 'Grundlast',
  per_day: '/Tag',
  consumption_now: 'Verbrauch jetzt',
  usual_this_time: 'Üblicher Bereich',
  sum: 'Summe',
  history_today: 'Verlauf heute',
  legend_today: 'heute',
  legend_yesterday: 'gestern',
  legend_usual: 'üblich',
  today_so_far: 'Heute',
  yesterday_at: 'Vortag bis',
  yesterday_total: 'Vortag gesamt',
  hour_axis: 'Uhr',
  from: 'aus',
};

const en: typeof de = {
  energy: 'Energy',
  consumption_caps: 'CONSUMPTION',
  usual_now: 'usual',
  normal: 'normal',
  high: 'high',
  low: 'low',
  normal_range: 'Within usual range',
  high_range: 'Above usual range',
  low_range: 'Below usual range',
  battery_charge: 'Battery charging',
  no_production: 'no production',
  all_grid: 'all from the grid',
  grid_short: 'grid',
  solar_all_export: 'Solar covers all · rest to the grid',
  solar_all_charge: 'Solar covers all · battery charging',
  solar_all: 'Solar covers all',
  battery_home: 'Battery powers the home',
  grid_idle: 'grid idle',
  house_consumption: 'Home consumption',
  who_draws: 'Consumers',
  devices: 'devices',
  rest: 'Not measured',
  not_measured: '(not measured)',
  today: 'Today',
  yesterday_so_far: 'Previous day so far',
  cost_today: 'Cost today',
  consumed: 'Consumed',
  solar: 'Solar',
  import: 'Import',
  export: 'Export',
  solar_produced: 'Production',
  night: 'Night',
  charging: 'Charging',
  delivering: 'Discharging',
  idle: 'idle',
  battery: 'Battery',
  base_load: 'Base load',
  base_load_long: 'Base load',
  per_day: '/day',
  consumption_now: 'Consumption now',
  usual_this_time: 'Usual range',
  sum: 'Total',
  history_today: 'Today',
  legend_today: 'today',
  legend_yesterday: 'yesterday',
  legend_usual: 'usual',
  today_so_far: 'Today',
  yesterday_at: 'Previous day until',
  yesterday_total: 'previous day total',
  hour_axis: 'h',
  from: 'from',
};

export type EnergyKey = keyof typeof de;

export function et(hass: HomeAssistant | undefined, key: EnergyKey): string {
  const dict = language(hass).startsWith('de') ? de : en;
  return dict[key];
}

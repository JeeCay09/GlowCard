import type { HassEntity, HomeAssistant } from '../../types/hass';
import { language } from '../../core/localize';
import { quantile } from '../energy/energy-logic';

/**
 * Energy flow card (#152, "Schaltplan"): where the power of the home comes from and goes
 * to. Everything is read from HA's energy dashboard (`energy/get_prefs`): grid, solar,
 * battery, gas, water, individual devices and the solar forecast. Live power (kW) comes
 * from optional power sensors; without them the card shows kWh of the chosen period.
 */

// ---------- energy dashboard setup ----------

interface RawFlow {
  stat_energy_from?: string | null;
  stat_energy_to?: string | null;
  stat_cost?: string | null;
  stat_compensation?: string | null;
  entity_energy_price?: string | null;
  number_energy_price?: number | null;
}

export interface RawPrefs {
  energy_sources?: (RawFlow & {
    type: string;
    flow_from?: RawFlow[];
    flow_to?: RawFlow[];
    config_entry_solar_forecast?: string[] | null;
    stat_rate?: string | null;
  })[];
  device_consumption?: {
    stat_consumption: string;
    name?: string | null;
    stat_rate?: string | null;
  }[];
}

export interface RawInfo {
  cost_sensors?: Record<string, string>;
}

export interface FlowDevice {
  stat: string;
  name?: string;
  /** Power sensor of the device (HA 2025.x `stat_rate`), for "now". */
  rate?: string;
}

/** What the energy dashboard is set up with (statistic ids). */
export interface FlowSetup {
  import: string[];
  export: string[];
  solar: string[];
  charge: string[];
  discharge: string[];
  gas: string[];
  water: string[];
  /** Cost statistics of grid import, gas and water; compensation of export (all in currency). */
  importCost: string[];
  exportComp: string[];
  gasCost: string[];
  waterCost: string[];
  devices: FlowDevice[];
  /** Config entries of solar forecasts (Forecast.Solar, Solcast, …). */
  forecast: string[];
}

export const emptySetup = (): FlowSetup => ({
  import: [],
  export: [],
  solar: [],
  charge: [],
  discharge: [],
  gas: [],
  water: [],
  importCost: [],
  exportComp: [],
  gasCost: [],
  waterCost: [],
  devices: [],
  forecast: [],
});

const add = (list: string[], id?: string | null) => {
  if (id && !list.includes(id)) list.push(id);
};

/** Reads the energy dashboard (flat grid source of HA 2025.x and the older flow lists). */
export function parseSetup(prefs?: RawPrefs | null, info?: RawInfo | null): FlowSetup {
  const s = emptySetup();
  const cost = (f: RawFlow, stat?: string | null) =>
    f.stat_cost || (stat ? info?.cost_sensors?.[stat] : undefined);
  const comp = (f: RawFlow, stat?: string | null) =>
    f.stat_compensation || (stat ? info?.cost_sensors?.[stat] : undefined);
  for (const src of prefs?.energy_sources ?? []) {
    if (src.type === 'grid') {
      const from = src.flow_from?.length ? src.flow_from : src.stat_energy_from ? [src] : [];
      const to = src.flow_to?.length ? src.flow_to : src.stat_energy_to ? [src] : [];
      for (const f of from) {
        add(s.import, f.stat_energy_from);
        add(s.importCost, cost(f, f.stat_energy_from));
      }
      for (const f of to) {
        add(s.export, f.stat_energy_to);
        add(s.exportComp, comp(f, f.stat_energy_to));
      }
    } else if (src.type === 'solar') {
      add(s.solar, src.stat_energy_from);
      for (const id of src.config_entry_solar_forecast ?? []) add(s.forecast, id);
    } else if (src.type === 'battery') {
      add(s.discharge, src.stat_energy_from);
      add(s.charge, src.stat_energy_to);
    } else if (src.type === 'gas') {
      add(s.gas, src.stat_energy_from);
      add(s.gasCost, cost(src, src.stat_energy_from));
    } else if (src.type === 'water') {
      add(s.water, src.stat_energy_from);
      add(s.waterCost, cost(src, src.stat_energy_from));
    }
  }
  for (const d of prefs?.device_consumption ?? []) {
    if (!d.stat_consumption || s.devices.some((x) => x.stat === d.stat_consumption)) continue;
    s.devices.push({
      stat: d.stat_consumption,
      name: d.name ?? undefined,
      rate: d.stat_rate ?? undefined,
    });
  }
  return s;
}

/** All statistic ids whose changes the card sums. */
export function setupIds(s: FlowSetup): string[] {
  return [
    ...s.import,
    ...s.export,
    ...s.solar,
    ...s.charge,
    ...s.discharge,
    ...s.gas,
    ...s.water,
    ...s.importCost,
    ...s.exportComp,
    ...s.gasCost,
    ...s.waterCost,
    ...s.devices.map((d) => d.stat),
  ].filter((id, i, all) => all.indexOf(id) === i);
}

// ---------- periods ----------

export type Range = 'day' | 'week' | 'month' | 'year';
export const RANGES: Range[] = ['day', 'week', 'month', 'year'];
export type StatPeriod = 'hour' | 'day' | 'month';

export interface Period {
  range: Range;
  /** 0 = the current period, −1 the one before … */
  offset: number;
  start: Date;
  end: Date;
  /** Number of chart buckets (24 hours, 7 / 28–31 days, 12 months). */
  buckets: number;
  stat: StatPeriod;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function period(range: Range, offset: number, now = new Date()): Period {
  const today = startOfDay(now);
  if (range === 'day') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { range, offset, start, end, buckets: 24, stat: 'hour' };
  }
  if (range === 'week') {
    const monday = today.getDate() - ((today.getDay() + 6) % 7);
    const start = new Date(today.getFullYear(), today.getMonth(), monday + 7 * offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { range, offset, start, end, buckets: 7, stat: 'day' };
  }
  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    return { range, offset, start, end, buckets: days, stat: 'day' };
  }
  const start = new Date(today.getFullYear() + offset, 0, 1);
  const end = new Date(start.getFullYear() + 1, 0, 1);
  return { range, offset, start, end, buckets: 12, stat: 'month' };
}

/** Offset of the period that contains `date`, counted from the period of `now` (#193). */
export function offsetFor(range: Range, date: Date, now = new Date()): number {
  const a = period(range, 0, now).start;
  if (range === 'year') return date.getFullYear() - a.getFullYear();
  if (range === 'month') {
    return (date.getFullYear() - a.getFullYear()) * 12 + date.getMonth() - a.getMonth();
  }
  // whole days between local midnights, safe across daylight saving changes
  const days = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000,
  );
  return range === 'day' ? days : Math.floor(days / 7);
}

/** The weeks (Monday first) that cover a month, as six rows at most. */
export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const last = new Date(year, month + 1, 0).getDate();
  const rows: Date[][] = [];
  for (let d = 1 - lead; d <= last; d += 7) {
    rows.push(Array.from({ length: 7 }, (_, i) => new Date(year, month, d + i)));
  }
  return rows;
}

/** The period before (same length), for "previous" comparisons. */
export function previous(p: Period, now = new Date()): Period {
  return period(p.range, p.offset - 1, now);
}

/** Bucket index of a statistics row that starts at `t` (epoch ms). */
export function bucketOf(p: Period, t: number): number {
  const d = new Date(t);
  if (p.range === 'day') {
    // Hours since midnight (DST: 23/25 h days fold into 24 buckets).
    return Math.min(23, Math.max(0, Math.floor((t - p.start.getTime()) / 3_600_000)));
  }
  if (p.range === 'year') return d.getMonth();
  const days = Math.round((startOfDay(d).getTime() - p.start.getTime()) / 86_400_000);
  return Math.min(p.buckets - 1, Math.max(0, days));
}

/** Buckets that have started (all for past periods). */
export function filledBuckets(p: Period, now = new Date()): number {
  if (now >= p.end) return p.buckets;
  if (now < p.start) return 0;
  return bucketOf(p, now.getTime()) + 1;
}

/** True while showing today: the only view with live power. */
export const isLive = (p: Period) => p.range === 'day' && p.offset === 0;

/** ISO 8601 week number. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

export interface PeriodLabels {
  /** Date picker on wide cards, e.g. "Heute, 13. Nov.", "KW 46 · 9.–15. Nov.". */
  long: string;
  /** Date picker on phones, e.g. "Heute", "KW 46", "Nov. 2026". */
  short: string;
  /** In sentences and section headers, e.g. "Heute", "Diese Woche", "November 2026". */
  name: string;
  /** Chart unit: "Stunde" / "Tag" / "Monat". */
  unit: string;
}

export function periodLabels(hass: HomeAssistant | undefined, p: Period): PeriodLabels {
  const lang = language(hass);
  const de = lang.startsWith('de');
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) =>
    new Intl.DateTimeFormat(lang, o).format(d);
  const dayMonth = (d: Date) => fmt({ day: 'numeric', month: 'short' }, d);
  if (p.range === 'day') {
    const named =
      p.offset === 0 ? ft(hass, 'today') : p.offset === -1 ? ft(hass, 'yesterday') : undefined;
    const wd = fmt({ weekday: 'short' }, p.start);
    return {
      long: named ? `${named}, ${dayMonth(p.start)}` : `${wd}, ${dayMonth(p.start)}`,
      short: named ?? dayMonth(p.start),
      name: named ?? `${wd} ${dayMonth(p.start)}`,
      unit: ft(hass, 'per_hour'),
    };
  }
  if (p.range === 'week') {
    const last = new Date(p.end.getTime() - 86_400_000);
    const wk = `${de ? 'KW' : 'Week'} ${isoWeek(p.start)}`;
    let span: string;
    try {
      span = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).formatRange(
        p.start,
        last,
      );
    } catch {
      span = `${dayMonth(p.start)} – ${dayMonth(last)}`;
    }
    const named =
      p.offset === 0 ? ft(hass, 'this_week') : p.offset === -1 ? ft(hass, 'last_week') : wk;
    return { long: `${wk} · ${span}`, short: wk, name: named, unit: ft(hass, 'per_day') };
  }
  if (p.range === 'month') {
    const long = fmt({ month: 'long', year: 'numeric' }, p.start);
    return {
      long,
      short: fmt({ month: 'short', year: 'numeric' }, p.start),
      name: p.offset === 0 ? ft(hass, 'this_month') : long,
      unit: ft(hass, 'per_day'),
    };
  }
  const y = String(p.start.getFullYear());
  return {
    long: y,
    short: y,
    name: p.offset === 0 ? ft(hass, 'this_year') : y,
    unit: ft(hass, 'per_month'),
  };
}

/** Axis labels of a chart: [bucket position (0…buckets), text]. */
export function axisLabels(hass: HomeAssistant | undefined, p: Period): [number, string][] {
  const lang = language(hass);
  if (p.range === 'day') return [0, 6, 12, 18, 24].map((h) => [h, String(h)]);
  if (p.range === 'week') {
    const wd = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i);
      return [i + 0.5, wd.format(d)] as [number, string];
    });
  }
  if (p.range === 'month') {
    return [1, 8, 15, 22, p.buckets].map((d) => [d - 0.5, String(d)]);
  }
  const mo = new Intl.DateTimeFormat(lang, { month: 'narrow' });
  return Array.from({ length: 12 }, (_, i) => [i + 0.5, mo.format(new Date(2024, i, 1))]);
}

// ---------- sums per bucket ----------

/** Statistics `change` rows per id (as `recorder/statistics_during_period` returns them). */
export type ChangeRows = Record<string, { start: number; change: number | null }[]>;

/** Per statistic: values per bucket. */
export type Buckets = Record<string, number[]>;

export function toBuckets(p: Period, rows: ChangeRows): Buckets {
  const out: Buckets = {};
  for (const [id, list] of Object.entries(rows)) {
    const b = new Array(p.buckets).fill(0);
    for (const r of list) {
      if (r.change === null || !Number.isFinite(r.change)) continue;
      b[bucketOf(p, r.start)] += r.change;
    }
    out[id] = b;
  }
  return out;
}

/** Sum of some ids per bucket; undefined when none of them has data. */
export function sumIds(b: Buckets, ids: string[], buckets: number): number[] | undefined {
  const have = ids.filter((id) => id in b);
  if (!have.length) return undefined;
  return Array.from({ length: buckets }, (_, i) => have.reduce((s, id) => s + b[id][i], 0));
}

export const total = (v?: number[]) => (v ? v.reduce((a, b) => a + b, 0) : undefined);

/** kWh per bucket of each flow, as HA's energy dashboard computes them. */
export interface FlowSeries {
  buckets: number;
  import?: number[];
  export?: number[];
  solar?: number[];
  charge?: number[];
  discharge?: number[];
  /** House consumption = import + solar + discharge − export − charge (≥ 0). */
  home?: number[];
  /** Solar used by the house = solar − export − charge (≥ 0). */
  solarUsed?: number[];
  gas?: number[];
  water?: number[];
  importCost?: number[];
  exportComp?: number[];
  gasCost?: number[];
  waterCost?: number[];
}

export function flowSeries(p: Period, b: Buckets, s: FlowSetup): FlowSeries {
  const n = p.buckets;
  const f: FlowSeries = {
    buckets: n,
    import: sumIds(b, s.import, n),
    export: sumIds(b, s.export, n),
    solar: sumIds(b, s.solar, n),
    charge: sumIds(b, s.charge, n),
    discharge: sumIds(b, s.discharge, n),
    gas: sumIds(b, s.gas, n),
    water: sumIds(b, s.water, n),
    importCost: sumIds(b, s.importCost, n),
    exportComp: sumIds(b, s.exportComp, n),
    gasCost: sumIds(b, s.gasCost, n),
    waterCost: sumIds(b, s.waterCost, n),
  };
  const at = (v: number[] | undefined, i: number) => v?.[i] ?? 0;
  if (f.import || f.solar || f.discharge) {
    f.home = Array.from({ length: n }, (_, i) =>
      Math.max(
        0,
        at(f.import, i) + at(f.solar, i) + at(f.discharge, i) - at(f.export, i) - at(f.charge, i),
      ),
    );
  }
  if (f.solar) {
    f.solarUsed = Array.from({ length: n }, (_, i) =>
      Math.max(0, at(f.solar, i) - at(f.export, i) - at(f.charge, i)),
    );
  }
  return f;
}

export interface Totals {
  import?: number;
  export?: number;
  solar?: number;
  charge?: number;
  discharge?: number;
  home?: number;
  gas?: number;
  water?: number;
  /** Grid cost − export compensation (+ gas and water in `all`). */
  energyCost?: number;
  gasCost?: number;
  waterCost?: number;
  importCost?: number;
  exportComp?: number;
}

export function totals(f: FlowSeries): Totals {
  const t: Totals = {
    import: total(f.import),
    export: total(f.export),
    solar: total(f.solar),
    charge: total(f.charge),
    discharge: total(f.discharge),
    home: total(f.home),
    gas: total(f.gas),
    water: total(f.water),
    importCost: total(f.importCost),
    exportComp: total(f.exportComp),
    gasCost: total(f.gasCost),
    waterCost: total(f.waterCost),
  };
  if (t.importCost !== undefined || t.exportComp !== undefined) {
    t.energyCost = (t.importCost ?? 0) - (t.exportComp ?? 0);
  }
  return t;
}

/** Share of the consumption not taken from the grid (HA "Autarkie" / self-sufficiency). */
export function selfSufficiency(t: Totals): number | undefined {
  if (!t.home || t.import === undefined) return undefined;
  return Math.min(100, Math.max(0, (1 - t.import / t.home) * 100));
}

/** Share of the solar production used at home (HA "Selbst verbrauchter Solarstrom"). */
export function selfConsumption(t: Totals): number | undefined {
  if (!t.solar) return undefined;
  return Math.min(100, Math.max(0, ((t.solar - (t.export ?? 0)) / t.solar) * 100));
}

/** Export − import in kWh (HA "Netzneutralität"): > 0 = more fed in than taken. */
export function gridNeutrality(t: Totals): number | undefined {
  if (t.import === undefined || t.export === undefined) return undefined;
  return t.export - t.import;
}

/** Low-carbon share of the grid import from HA's fossil fuel statistics (%). */
export function lowCarbon(importKwh: number | undefined, fossilKwh: number | undefined) {
  if (!importKwh || fossilKwh === undefined) return undefined;
  return Math.min(100, Math.max(0, (1 - fossilKwh / importKwh) * 100));
}

/**
 * Usual range per bucket from earlier periods: P20–P80 of the same hour over the last
 * days (day view) or of the bucket values of earlier periods (week/month).
 */
export function usualBand(history: number[][]): { lo: number; hi: number }[] | undefined {
  if (history.length < 3) return undefined;
  const n = Math.max(...history.map((h) => h.length));
  const out: { lo: number; hi: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = history.map((h) => h[i]).filter((x) => Number.isFinite(x));
    if (v.length < 3) return undefined;
    out.push({ lo: quantile(v, 0.2)!, hi: quantile(v, 0.8)! });
  }
  return out;
}

// ---------- solar forecast ----------

/** `energy/solar_forecast`: Wh per hour (ISO time) per config entry. */
export type ForecastData = Record<string, { wh_hours?: Record<string, number> }>;

/** kWh per hour of the day [start, start + 24 h) from the configured forecasts. */
export function forecastHours(
  data: ForecastData | null | undefined,
  entries: string[],
  p: Period,
): number[] | undefined {
  if (!data || p.range !== 'day') return undefined;
  const out = new Array(24).fill(0);
  let seen = false;
  for (const id of entries) {
    for (const [iso, wh] of Object.entries(data[id]?.wh_hours ?? {})) {
      const t = new Date(iso).getTime();
      if (t < p.start.getTime() || t >= p.end.getTime()) continue;
      out[bucketOf(p, t)] += wh / 1000;
      seen = true;
    }
  }
  return seen ? out : undefined;
}

/** Forecast for one day: kWh per hour (when known) and the total. */
export interface DayForecast {
  hours?: number[];
  total?: number;
}

const ENERGY_FACTOR: Record<string, number> = { wh: 0.001, kwh: 1, mwh: 1000 };

/**
 * Forecast from a chosen sensor (#179), for today only. The state is the expected energy
 * of the day (Wh, kWh or MWh). Hourly values come from common attributes when present:
 * Solcast `detailedHourly` / `detailedForecast` (kW per hour / half hour) and
 * Forecast.Solar style `wh_hours` / `wh_period` (Wh per ISO time).
 */
export function sensorForecast(entity: HassEntity | undefined, p: Period): DayForecast | undefined {
  if (!entity || p.range !== 'day') return undefined;
  const unit = String(entity.attributes.unit_of_measurement ?? 'kWh').toLowerCase();
  const raw = Number.parseFloat(entity.state);
  const total = Number.isFinite(raw) ? raw * (ENERGY_FACTOR[unit] ?? 1) : undefined;

  const hours = new Array(24).fill(0);
  let seen = false;
  const put = (iso: unknown, kwh: number) => {
    const t = new Date(String(iso)).getTime();
    if (!Number.isFinite(t) || !Number.isFinite(kwh)) return;
    if (t < p.start.getTime() || t >= p.end.getTime()) return;
    hours[bucketOf(p, t)] += kwh;
    seen = true;
  };
  type Row = { period_start?: unknown; pv_estimate?: unknown };
  const a = entity.attributes as Record<string, unknown>;
  const rows = (key: string) => (Array.isArray(a[key]) ? (a[key] as Row[]) : undefined);
  const hourly = rows('detailedHourly');
  const half = rows('detailedForecast');
  if (hourly) for (const r of hourly) put(r.period_start, Number(r.pv_estimate));
  else if (half) for (const r of half) put(r.period_start, Number(r.pv_estimate) / 2);
  else {
    const wh = (a.wh_hours ?? a.wh_period) as Record<string, unknown> | undefined;
    if (wh && typeof wh === 'object') {
      for (const [iso, v] of Object.entries(wh)) put(iso, Number(v) / 1000);
    }
  }
  if (!seen && total === undefined) return undefined;
  return {
    hours: seen ? hours : undefined,
    total: total ?? (seen ? hours.reduce((x, y) => x + y, 0) : undefined),
  };
}

// ---------- the line plan ----------

export type NodeKind = 'grid' | 'solar' | 'bat' | 'home';

/**
 * Values along the line Netz — (Solar) — (Akku) — Haus, in W (live) or kWh (period).
 * Positive segment values flow towards the house, negative ones towards the grid.
 */
export interface PlanFlows {
  /** grid ↔ first junction: + import, − export. */
  grid: number;
  /** solar → its junction (≥ 0). */
  solar?: number;
  /** junction → battery: + charging, − discharging. */
  bat?: number;
  /** between the solar and the battery junction (+ towards the house). */
  middle?: number;
  /** last junction → house (≥ 0). */
  home: number;
}

/** Live: from the power values (W). */
export function livePlan(n: {
  grid: number | null;
  solar: number | null;
  battery: number | null;
  home: number | null;
}): PlanFlows {
  const grid = n.grid ?? 0;
  const solar = n.solar === null ? undefined : Math.max(0, n.solar);
  const bat = n.battery === null ? undefined : n.battery;
  const middle = grid + (solar ?? 0);
  const home = n.home ?? Math.max(0, middle - (bat ?? 0));
  return {
    grid,
    solar,
    bat,
    middle: solar !== undefined && bat !== undefined ? middle : undefined,
    home,
  };
}

/** Period: from the kWh totals (net values per segment). */
export function periodPlan(t: Totals, hasSolar: boolean, hasBattery: boolean): PlanFlows {
  const grid = (t.import ?? 0) - (t.export ?? 0);
  const solar = hasSolar ? (t.solar ?? 0) : undefined;
  const bat = hasBattery ? (t.charge ?? 0) - (t.discharge ?? 0) : undefined;
  const middle = hasSolar && hasBattery ? grid + (solar ?? 0) : undefined;
  return {
    grid,
    solar,
    bat,
    middle,
    home: t.home ?? Math.max(0, grid + (solar ?? 0) - (bat ?? 0)),
  };
}

// ---------- formatting ----------

export function fnum(hass: HomeAssistant | undefined, v: number, digits?: number): string {
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2);
  return new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
}

/** kWh with sensible digits: "0,62", "6,8", "312". */
export function fkwh(hass: HomeAssistant | undefined, v: number): string {
  const a = Math.abs(v);
  return fnum(hass, v, a >= 100 ? 0 : 1);
}

export function fmoney(hass: HomeAssistant | undefined, v: number, cur: string): string {
  return `${fnum(hass, v, Math.abs(v) >= 100 ? 0 : 2)} ${cur}`;
}

// ---------- texts ----------

const de = {
  title: 'Energiefluss',
  grid: 'Netz',
  solar: 'Solar',
  battery: 'Akku',
  home: 'Haus',
  gas: 'Gas',
  water: 'Wasser',
  today: 'Heute',
  yesterday: 'Gestern',
  this_week: 'Diese Woche',
  last_week: 'Letzte Woche',
  this_month: 'Dieser Monat',
  this_year: 'Dieses Jahr',
  per_hour: 'je Stunde',
  per_day: 'je Tag',
  per_month: 'je Monat',
  range_day: 'Tag',
  range_week: 'Woche',
  range_month: 'Monat',
  range_year: 'Jahr',
  back: 'Zurück',
  next: 'Weiter',
  pick_date: 'Datum wählen',
  pick_month: 'Monat wählen',
  pick_year: 'Jahr wählen',
  week_short: 'KW',
  import: 'Bezug',
  export: 'Einspeisung',
  imported: 'bezogen',
  exported: 'eingespeist',
  produced: 'erzeugt',
  production: 'Erzeugung',
  charging: 'lädt',
  discharging: 'entlädt',
  charged: 'geladen',
  discharged: 'entladen',
  idle: 'ruht',
  consumption: 'Verbrauch',
  consumed: 'verbraucht',
  usual: 'üblich',
  usual_now: 'üblich zu dieser Zeit',
  usual_range: 'im üblichen Bereich',
  above_usual: 'über dem üblichen Bereich',
  below_usual: 'unter dem üblichen Bereich',
  of_forecast: 'von {f} Prognose',
  forecast: 'Prognose',
  forecast_short: 'Prognose {f}',
  still_expected: 'noch erwartet {v}',
  forecast_reached: '{p} der Prognose erreicht',
  kpi_consumption: 'Verbrauch',
  kpi_import: 'Netzbezug',
  kpi_low_carbon: 'CO₂-arm bezogen',
  kpi_cost: 'Kosten',
  kpi_self_sufficiency: 'Autarkie',
  kpi_self_consumption: 'Solar selbst genutzt',
  kpi_neutrality: 'Netzneutralität',
  today_suffix: 'heute',
  sec_usage: 'Energieverbrauch',
  sec_sources: 'Quellen',
  sec_solar: 'Solarproduktion',
  sec_devices: 'Einzelne Geräte',
  legend_import: 'Netzbezug',
  legend_below: 'unter der Linie: eingespeist / Akku geladen',
  row_import: 'Netz bezogen',
  row_export: 'Netz eingespeist',
  row_solar: 'Solar erzeugt',
  row_discharge: 'Akku entladen',
  row_charge: 'Akku geladen',
  row_total: 'Gesamt',
  now_today: 'jetzt · heute',
  off: 'aus',
  not_measured: 'Nicht erfasst',
  before: 'davor {v}',
  yesterday_v: 'gestern {v}',
  from_grid_sub: '{v} aus dem Netz · {p}',
  autarky_sub: 'Autarkie {v} · {p}',
  live_grid: 'Netz → Haus · {v}',
  live_solar: 'Solar versorgt das Haus',
  live_solar_export: 'Solar versorgt Haus und Netz',
  live_solar_charge: 'Solar versorgt Haus und Akku',
  live_solar_all: 'Solar versorgt Haus, Akku und Netz',
  live_battery: 'Akku versorgt das Haus',
  live_mixed: 'Haus · {v}',
  no_setup: 'Energie-Dashboard einrichten',
  no_setup_sub: 'Netz, Solar und Akku kommen aus den HA-Energie-Einstellungen',
  no_data: 'Keine Daten für diesen Zeitraum',
  loading: 'Lädt …',
};

const en: typeof de = {
  title: 'Energy flow',
  grid: 'Grid',
  solar: 'Solar',
  battery: 'Battery',
  home: 'Home',
  gas: 'Gas',
  water: 'Water',
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  this_year: 'This year',
  per_hour: 'per hour',
  per_day: 'per day',
  per_month: 'per month',
  range_day: 'Day',
  range_week: 'Week',
  range_month: 'Month',
  range_year: 'Year',
  back: 'Back',
  next: 'Next',
  pick_date: 'Pick a date',
  pick_month: 'pick a month',
  pick_year: 'pick a year',
  week_short: 'Wk',
  import: 'Import',
  export: 'Export',
  imported: 'imported',
  exported: 'exported',
  produced: 'produced',
  production: 'Production',
  charging: 'charging',
  discharging: 'discharging',
  charged: 'charged',
  discharged: 'discharged',
  idle: 'idle',
  consumption: 'Consumption',
  consumed: 'consumed',
  usual: 'usual',
  usual_now: 'usual at this time',
  usual_range: 'within the usual range',
  above_usual: 'above the usual range',
  below_usual: 'below the usual range',
  of_forecast: 'of {f} forecast',
  forecast: 'Forecast',
  forecast_short: 'Forecast {f}',
  still_expected: '{v} still expected',
  forecast_reached: '{p} of the forecast reached',
  kpi_consumption: 'Consumption',
  kpi_import: 'Grid import',
  kpi_low_carbon: 'Low-carbon import',
  kpi_cost: 'Cost',
  kpi_self_sufficiency: 'Self-sufficiency',
  kpi_self_consumption: 'Solar used at home',
  kpi_neutrality: 'Grid neutrality',
  today_suffix: 'today',
  sec_usage: 'Energy usage',
  sec_sources: 'Sources',
  sec_solar: 'Solar production',
  sec_devices: 'Individual devices',
  legend_import: 'Grid import',
  legend_below: 'below the line: exported / battery charged',
  row_import: 'Grid import',
  row_export: 'Grid export',
  row_solar: 'Solar produced',
  row_discharge: 'Battery discharged',
  row_charge: 'Battery charged',
  row_total: 'Total',
  now_today: 'now · today',
  off: 'off',
  not_measured: 'Not measured',
  before: 'before {v}',
  yesterday_v: 'yesterday {v}',
  from_grid_sub: '{v} from the grid · {p}',
  autarky_sub: 'Self-sufficiency {v} · {p}',
  live_grid: 'Grid → home · {v}',
  live_solar: 'Solar powers the home',
  live_solar_export: 'Solar powers home and grid',
  live_solar_charge: 'Solar powers home and battery',
  live_solar_all: 'Solar powers home, battery and grid',
  live_battery: 'Battery powers the home',
  live_mixed: 'Home · {v}',
  no_setup: 'Set up the energy dashboard',
  no_setup_sub: 'Grid, solar and battery come from the HA energy settings',
  no_data: 'No data for this period',
  loading: 'Loading …',
};

export type FlowKey = keyof typeof de;

export function ft(
  hass: HomeAssistant | undefined,
  key: FlowKey,
  vars: Record<string, string> = {},
): string {
  const dict = language(hass).startsWith('de') ? de : en;
  return dict[key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

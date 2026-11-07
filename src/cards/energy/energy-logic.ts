import type { HomeAssistant } from '../../types/hass';
import { language } from '../../core/localize';
import { numberState, powerW } from '../status/status-logic';

/**
 * Entities of the energy card. Power sensors in W or kW (sign conventions as in HA's
 * energy dashboard): battery_power > 0 = charging, grid > 0 = import, grid < 0 = export.
 * Daily energy sensors (kWh, reset at midnight) are optional and feed the tiles + popup.
 */
export interface EnergyEntities {
  solar?: string;
  home?: string;
  battery?: string;
  battery_power?: string;
  grid?: string;
  solar_energy?: string;
  home_energy?: string;
  grid_import_energy?: string;
  grid_export_energy?: string;
  battery_charge_energy?: string;
  battery_discharge_energy?: string;
}

/** Below this (W) a flow counts as idle. */
export const IDLE_W = 10;

export interface EnergyNow {
  solar: number | null;
  home: number | null;
  battery: number | null;
  soc: number | null;
  grid: number | null;
}

export interface EnergyToday {
  solar: number | null;
  home: number | null;
  gridImport: number | null;
  gridExport: number | null;
  batteryCharge: number | null;
  batteryDischarge: number | null;
}

export function readNow(hass: HomeAssistant, c: EnergyEntities): EnergyNow {
  return {
    solar: powerW(hass, c.solar),
    home: powerW(hass, c.home),
    battery: powerW(hass, c.battery_power),
    soc: numberState(hass, c.battery),
    grid: powerW(hass, c.grid),
  };
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

export function readToday(hass: HomeAssistant, c: EnergyEntities): EnergyToday {
  return {
    solar: energyKwh(hass, c.solar_energy),
    home: energyKwh(hass, c.home_energy),
    gridImport: energyKwh(hass, c.grid_import_energy),
    gridExport: energyKwh(hass, c.grid_export_energy),
    batteryCharge: energyKwh(hass, c.battery_charge_energy),
    batteryDischarge: energyKwh(hass, c.battery_discharge_energy),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Share of the consumption not taken from the grid (0–100), or null. */
export function autarky(t: EnergyToday): number | null {
  if (t.home === null || t.gridImport === null || t.home <= 0) return null;
  return Math.round(clamp01(1 - t.gridImport / t.home) * 100);
}

/** Share of the solar energy used in the house or battery (0–100), or null. */
export function selfConsumption(t: EnergyToday): number | null {
  if (t.solar === null || t.gridExport === null || t.solar <= 0) return null;
  return Math.round(clamp01(1 - t.gridExport / t.solar) * 100);
}

export type Situation =
  | 'solar_charges'
  | 'solar_exports'
  | 'solar_home'
  | 'battery_home'
  | 'grid_home'
  | 'grid_charges'
  | 'idle';

/** What the house is doing now, for the line under the title. */
export function situation(n: EnergyNow): Situation {
  const solar = n.solar ?? 0;
  const bat = n.battery ?? 0;
  const grid = n.grid ?? 0;
  // A little evening sun next to a discharging battery: the battery is what counts.
  const pv = solar > IDLE_W && solar >= -bat;
  if (pv && bat > IDLE_W) return 'solar_charges';
  if (pv && grid < -IDLE_W) return 'solar_exports';
  if (pv) return 'solar_home';
  if (bat < -IDLE_W) return 'battery_home';
  if (solar > IDLE_W) return 'solar_home';
  if (grid > IDLE_W && bat > IDLE_W) return 'grid_charges';
  if (grid > IDLE_W) return 'grid_home';
  return 'idle';
}

/** Dash animation length (s): faster for more power, as in the board. */
export function flowSpeed(watts: number): number {
  const kw = Math.abs(watts) / 1000;
  return Math.max(1.2, Math.min(8, 5 / (kw + 0.3)));
}

/** "0,42 kW" without sign (board labels). */
export function kw(hass: HomeAssistant | undefined, watts: number, digits = 2): string {
  const n = new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(watts) / 1000);
  return `${n} kW`;
}

export function kwh(hass: HomeAssistant | undefined, v: number, digits = 2): string {
  const n = new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
  return `${n} kWh`;
}

// ---------- day chart (popup) ----------

export interface ChartSeries {
  /** Solar power per slot in W. */
  solar: number[];
  /** House power per slot in W. */
  home: number[];
  /** Battery state of charge per slot in %. */
  soc: number[];
}

export const CHART = { w: 400, top: 10, base: 140, socTop: 10 } as const;

/** Upper end of the power axis in W: 6 kW like the board, more if the day needs it. */
export function chartMax(series: ChartSeries): number {
  const peak = Math.max(0, ...series.solar, ...series.home);
  return Math.max(6000, Math.ceil(peak / 1000) * 1000);
}

/**
 * SVG path through the values of a day. Slots cover [0, `upTo`] of the day (0–1);
 * x runs over the full 24 h width.
 */
export function chartPath(values: number[], upTo: number, y: (v: number) => number): string {
  if (!values.length) return '';
  const step = (upTo * CHART.w) / values.length;
  return values
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step + step / 2).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
}

/** Fraction of the local day that has passed (0–1). */
export function dayFraction(now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

// ---------- texts ----------

const de = {
  energy: 'Energie',
  solar: 'Solar',
  solar_caps: 'SOLAR',
  consumption_caps: 'VERBRAUCH',
  house: 'Haus',
  battery: 'Akku',
  grid: 'Netz',
  out: 'raus',
  in: 'rein',
  grid_idle: 'Netz ruht',
  pv_today: 'PV heute',
  autarky_today: 'Autarkie heute',
  import_today: 'Netzbezug heute',
  autarky: 'Autarkie',
  self_use: 'Eigenverbrauch',
  self_covered: 'selbst gedeckt',
  solar_used: 'Solar selbst genutzt',
  charging_with: 'lädt mit',
  discharging_with: 'entlädt mit',
  idle: 'ruht',
  history_today: 'Verlauf heute',
  consumption: 'Verbrauch',
  soc: 'Akku %',
  now_caps: 'JETZT',
  balance_today: 'Bilanz heute',
  produced: 'erzeugt',
  yesterday: 'gestern',
  consumed: 'verbraucht',
  now: 'jetzt',
  charged_discharged: 'geladen · entladen',
  imported_exported: 'bezogen · eingespeist',
  hour_axis: 'Uhr',
  today: 'Heute',
  week: 'Woche',
  month: 'Monat',
  year: 'Jahr',
  solar_charges: 'Solar lädt den Akku',
  solar_exports: 'Solar speist ins Netz',
  solar_home: 'Solar versorgt das Haus',
  battery_home: 'Der Akku versorgt das Haus',
  grid_home: 'Strom kommt aus dem Netz',
  grid_charges: 'Das Netz lädt den Akku',
};

const en: typeof de = {
  energy: 'Energy',
  solar: 'Solar',
  solar_caps: 'SOLAR',
  consumption_caps: 'CONSUMPTION',
  house: 'Home',
  battery: 'Battery',
  grid: 'Grid',
  out: 'out',
  in: 'in',
  grid_idle: 'Grid idle',
  pv_today: 'Solar today',
  autarky_today: 'Self-sufficiency',
  import_today: 'Grid today',
  autarky: 'Self-sufficiency',
  self_use: 'Self-consumption',
  self_covered: 'covered by own power',
  solar_used: 'solar used at home',
  charging_with: 'charging at',
  discharging_with: 'discharging at',
  idle: 'idle',
  history_today: 'Today',
  consumption: 'Consumption',
  soc: 'Battery %',
  now_caps: 'NOW',
  balance_today: 'Today’s balance',
  produced: 'produced',
  yesterday: 'yesterday',
  consumed: 'consumed',
  now: 'now',
  charged_discharged: 'charged · discharged',
  imported_exported: 'imported · exported',
  hour_axis: 'h',
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  solar_charges: 'Solar is charging the battery',
  solar_exports: 'Solar is feeding the grid',
  solar_home: 'Solar is powering the home',
  battery_home: 'The battery is powering the home',
  grid_home: 'Power comes from the grid',
  grid_charges: 'The grid is charging the battery',
};

export type EnergyKey = keyof typeof de;

export function et(hass: HomeAssistant | undefined, key: EnergyKey | 'idle'): string {
  const dict = language(hass).startsWith('de') ? de : en;
  return dict[key];
}

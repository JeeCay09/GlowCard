import { css, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import { fireEvent } from '../../core/fire-event';
import type { Rgb } from '../../core/color';
import {
  configForm,
  fontField,
  lookSection,
  nameIconFields,
  type FormSchema,
  type GestureSpec,
} from '../../core/editor';
import { numberState, powerW } from '../status/status-logic';
import { flows, readNow, type EnergyNow } from '../energy/energy-logic';
import type { HomeAssistant } from '../../types/hass';
import { language } from '../../core/localize';
import {
  RANGES,
  axisLabels,
  emptySetup,
  filledBuckets,
  fkwh,
  flowSeries,
  fmoney,
  fnum,
  forecastHours,
  mixSlots,
  planMix,
  type SourceShare,
  sensorForecast,
  type DayForecast,
  isoWeek,
  monthWeeks,
  offsetFor,
  ft,
  gridNeutrality,
  isLive,
  livePlan,
  lowCarbon,
  parseSetup,
  period,
  periodLabels,
  periodPlan,
  previous,
  selfConsumption,
  selfSufficiency,
  setupIds,
  toBuckets,
  totals,
  usualBand,
  type ChangeRows,
  type FlowKey,
  type FlowSeries,
  type FlowSetup,
  type ForecastData,
  type NodeKind,
  type Period,
  type PlanFlows,
  type Range,
  type RawInfo,
  type RawPrefs,
  type Totals,
} from './flow-logic';

export type FlowSection = 'usage' | 'sources' | 'solar' | 'devices' | 'gas' | 'water';
export const SECTIONS: FlowSection[] = ['usage', 'sources', 'solar', 'devices', 'gas', 'water'];

export interface FlowCardConfig extends GlowCardConfig {
  /** Live power sensors (optional): grid (+ import), solar, battery power (+ charging). */
  grid?: string;
  solar?: string;
  battery?: string;
  battery_power?: string;
  home?: string;
  invert_grid?: boolean;
  invert_battery?: boolean;
  /** Areas below the line plan, in this order (default: all that have data). */
  sections?: FlowSection[];
  /** Period the card opens with. */
  period?: Range;
  /** Own solar forecast sensor (energy of today); default: the energy dashboard's forecast. */
  solar_forecast?: string;
}

type Kind = NodeKind | 'gas' | 'water' | 'rest';

/** Colours of the flows (dark / light), like the energy card and the mockup. */
const COLORS: Record<Kind, { dark: Rgb; light: Rgb }> = {
  grid: { dark: [96, 165, 250], light: [59, 130, 246] },
  solar: { dark: [251, 191, 36], light: [245, 158, 11] },
  bat: { dark: [52, 211, 153], light: [16, 185, 129] },
  home: { dark: [167, 139, 250], light: [139, 92, 246] },
  gas: { dark: [251, 146, 60], light: [234, 88, 12] },
  water: { dark: [34, 211, 238], light: [6, 182, 212] },
  rest: { dark: [148, 163, 184], light: [148, 163, 184] },
};

/** MDI paths for the neon icons (drawn as outlines with a bright core). */
const ICON: Record<string, string> = {
  home: 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z',
  grid: 'M8.28,5.45L6.5,4.55L7.76,2H16.23L17.5,4.55L15.72,5.44L15,4H9L8.28,5.45M18.62,8H14.09L13.3,5H10.7L9.91,8H5.38L4.1,10.55L5.89,11.44L6.62,10H17.38L18.1,11.45L19.89,10.56L18.62,8M17.77,22H15.7L15.46,21.1L12,15.9L8.53,21.1L8.3,22H6.23L9.12,11H11.19L10.83,12.35L12,14.1L13.16,12.35L12.81,11H14.88L17.77,22M11.4,15L10.5,13.65L9.32,18.13L11.4,15M14.68,18.12L13.5,13.64L12.6,15L14.68,18.12Z',
  solar:
    'M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z',
  bat: 'M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4Z',
  gas: 'M12 2.5c.6 3.2 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-3.3 2-4.6 2.3-7.6 1.6 1.2 2.6 2.9 2.7 4.6 1.3-2.2 1.2-5.2.5-8z',
  water: 'M12,20.5A6,6 0 0,1 6,14.5C6,10.5 12,3.5 12,3.5C12,3.5 18,10.5 18,14.5A6,6 0 0,1 12,20.5Z',
  plug: 'M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4.5',
  list: 'M4 6h16M4 12h16M4 18h16',
  chart: 'M4 20V10M9.3 20V5M14.6 20v-8M20 20V8',
};

const CAL_ICON = svg`<svg viewBox="0 0 24 24" aria-hidden="true">
  <path
    d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;
type CalLevel = 'days' | 'months' | 'years';
const CHEV_L = 'M15 5l-7 7 7 7';
const CHEV_R = 'M9 5l7 7-7 7';
const CHEV_D = 'M5 9l7 7 7-7';

/** Width below which the plan turns vertical and the date picker gets its own row. */
const NARROW = 560;
/** Below this the line plan runs top to bottom (phones); above it, left to right (#187). */
const VERTICAL = 420;
/** Width from which sections sit side by side in the 12 column layout. */
const WIDE = 900;
/** Screen height on phones that is not for the plan (HA top bar, card header, bottom bar). */
const PHONE_RESERVE = 340;
/** Below this the flow counts as idle (W live, kWh for a period). */
const IDLE_W = 10;
const IDLE_KWH = 0.05;
const RELOAD_LIVE = 5 * 60_000;

/** Preferred column spans (of 12) on wide and medium cards. */
const SPAN: Record<FlowSection, [number, number]> = {
  usage: [8, 12],
  sources: [4, 6],
  solar: [6, 6],
  devices: [6, 6],
  gas: [3, 6],
  water: [3, 6],
};

/** Packs sections into rows of 12 columns; a short last row is stretched to full width. */
export function packSpans(spans: number[]): number[] {
  const out: number[] = [];
  let row: number[] = [];
  const flush = () => {
    if (!row.length) return;
    const rest = 12 - row.reduce((a, b) => a + b, 0);
    const each = Math.floor(rest / row.length);
    row = row.map((s) => s + each);
    row[row.length - 1] += rest - each * row.length;
    out.push(...row);
    row = [];
  };
  for (const s of spans) {
    if (row.reduce((a, b) => a + b, 0) + s > 12) flush();
    row.push(Math.min(12, s));
  }
  flush();
  return out;
}

interface PeriodData {
  series: FlowSeries;
  totals: Totals;
  prev: Totals;
  /** kWh per device in the period. */
  devices: Record<string, number>;
  usual?: { lo: number; hi: number }[];
  fossil?: number;
  /** False until the comparison, usual range and low-carbon share arrived (#203). */
  full: boolean;
  loadedAt: number;
}

interface PlanNode {
  k: NodeKind;
  x: number;
  y: number;
  lab: 'r' | 'l' | 'b';
  t1: string;
  t2: TemplateResult | string;
  /** State word (import, charging, …): not shown, read out by screen readers. */
  t3: string;
  entity?: string;
}

interface PlanSeg {
  a: [number, number];
  b: [number, number];
  /** Where its energy comes from: sets the colour, mixed for several sources (#198). */
  mix: SourceShare;
  /** Signed value: + = from a to b. */
  v: number;
  idle: boolean;
}

/**
 * Energy flow card "Schaltplan" (#152): a calm line plan Netz — Solar — Akku — Haus with
 * neon icons and light dots moving with the power. Below it the key figures and optional
 * areas like HA's energy dashboard (usage, sources, solar production with forecast,
 * individual devices, gas, water) for a day, week, month or year.
 */
export class GlowFlowCard extends GlowCardBase<FlowCardConfig> {
  @state() private range: Range = 'day';
  @state() private offset = 0;
  @state() private setup: FlowSetup | null = null;
  @state() private data = new Map<string, PeriodData>();
  @state() private forecast: ForecastData | null = null;
  @state() private sizes: Record<string, { w: number; h: number }> = {};
  @state() private cardH = 0;
  @state() private viewH = typeof window === 'undefined' ? 800 : window.innerHeight;
  /** Calendar popover of the date picker (#193) and the month / year it shows. */
  @state() private calOpen = false;
  @state() private calY = 0;
  @state() private calM = 0;
  /** What the calendar lists: days of a month, months of a year or twelve years. */
  @state() private calLvl: CalLevel = 'days';
  private onViewResize = () => {
    if (Math.abs(window.innerHeight - this.viewH) > 20) this.viewH = window.innerHeight;
  };
  private co2Id?: string;
  private loadingKey?: string;
  private forecastAt = 0;
  private resize?: ResizeObserver;
  private observed = new Set<Element>();
  private rangeFromConfig?: Range;

  static getConfigForm() {
    const power: FormSchema['selector'] = { entity: { domain: ['sensor'], device_class: 'power' } };
    const grid = (...schema: FormSchema[]): FormSchema => ({ name: '', type: 'grid', schema });
    return configForm(
      [
        {
          name: 'sections',
          default: SECTIONS,
          selector: {
            select: {
              multiple: true,
              reorder: true,
              mode: 'list',
              options: SECTIONS.map((s) => ({ value: s, label: sectionLabel(s) })),
            },
          },
        },
        {
          name: 'period',
          default: 'day',
          selector: {
            select: {
              mode: 'dropdown',
              options: RANGES.map((r) => ({ value: r, label: rangeLabel(r) })),
            },
          },
        },
        { name: 'solar_forecast', selector: { entity: { domain: ['sensor'] } } },
        {
          name: '',
          type: 'expandable',
          title: 'flow_live_section',
          icon: 'mdi:flash-outline',
          schema: [
            grid(
              { name: 'grid', selector: power },
              { name: 'solar', selector: power },
              { name: 'battery_power', selector: power },
              {
                name: 'battery',
                selector: { entity: { domain: ['sensor'], device_class: 'battery' } },
              },
              { name: 'home', selector: power },
            ),
            { name: 'invert_grid', selector: { boolean: {} }, visible: (d) => !!d.grid },
            {
              name: 'invert_battery',
              selector: { boolean: {} },
              visible: (d) => !!d.battery_power,
            },
          ],
        },
        lookSection(nameIconFields, fontField),
      ],
      {
        sections: 'flow_sections_helper',
        period: 'flow_period_helper',
        solar_forecast: 'flow_forecast_helper',
        grid: 'flow_grid_helper',
        home: 'flow_home_helper',
        invert_grid: 'invert_grid_helper',
        invert_battery: 'invert_battery_helper',
        name: 'flow_name_helper',
      },
    );
  }

  /** The card has its own controls (date picker, nodes); no tap/hold choice. */
  static gestureSpec(): GestureSpec | undefined {
    return undefined;
  }

  static getStubConfig(): Partial<FlowCardConfig> {
    return {};
  }

  protected validateConfig(config: FlowCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.sections !== undefined && !Array.isArray(config.sections)) {
      throw new Error('"sections" must be a list');
    }
    if (config.period !== undefined && !RANGES.includes(config.period)) {
      throw new Error(`"period" must be one of ${RANGES.join(', ')}`);
    }
  }

  setConfig(config: FlowCardConfig): void {
    super.setConfig(config);
    const r = this.config?.period ?? 'day';
    if (r !== this.rangeFromConfig) {
      this.rangeFromConfig = r;
      this.range = r;
      this.offset = 0;
    }
  }

  getCardSize(): number {
    return 12;
  }

  /** Full width; the height follows the content and is rounded to whole grid rows. */
  getGridOptions() {
    return { columns: 12, min_columns: 12, rows: 'auto' as const };
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    if (!c) return [];
    const rates = (this.setup?.devices ?? []).map((d) => d.rate);
    return [c.grid, c.solar, c.battery, c.battery_power, c.home, c.solar_forecast, ...rates].filter(
      (x): x is string => !!x,
    );
  }

  protected get isActive(): boolean {
    return true;
  }

  protected get icon(): string {
    return this.config?.icon ?? 'mdi:home-lightning-bolt';
  }

  private col(k: Kind): string {
    return COLORS[k][this.dark ? 'dark' : 'light'].join(',');
  }

  // ---------- state ----------

  private get period(): Period {
    return period(this.range, this.offset);
  }

  private get key(): string {
    return `${this.range}:${this.offset}`;
  }

  private get pd(): PeriodData | undefined {
    return this.data.get(this.key);
  }

  private get hasPower(): boolean {
    return !!(this.config?.grid || this.config?.home);
  }

  private get live(): boolean {
    return isLive(this.period) && this.hasPower;
  }

  private get now(): EnergyNow {
    return this.hass && this.config
      ? readNow(this.hass, this.config)
      : { home: null, solar: null, battery: null, soc: null, grid: null };
  }

  private get hasSolar(): boolean {
    return !!(this.setup?.solar.length || this.config?.solar);
  }

  private get hasBattery(): boolean {
    const s = this.setup;
    return !!(s?.charge.length || s?.discharge.length || this.config?.battery_power);
  }

  private get pv(): boolean {
    return this.hasSolar || this.hasBattery;
  }

  /**
   * Accent (orb, picker highlight): the warm house colour, the same in every home. The
   * card itself is neutral glass, because the lines carry the colour of their source (#200).
   */
  protected get accent(): Rgb {
    return COLORS.home[this.dark ? 'dark' : 'light'];
  }

  // ---------- loading ----------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.observeSizes();
    this.fitHeight();
    if (!this.hass || !this.config) return;
    if (!this.setup) {
      void this.loadSetup();
      return;
    }
    const pd = this.pd;
    const stale = isLive(this.period) && pd && Date.now() - pd.loadedAt > RELOAD_LIVE;
    if ((!pd || stale) && this.loadingKey !== this.key) void this.loadPeriod();
    if (
      this.setup.forecast.length &&
      !this.config?.solar_forecast &&
      this.range === 'day' &&
      this.offset === 0 &&
      Date.now() - this.forecastAt > 30 * 60_000
    ) {
      void this.loadForecast();
    }
  }

  private async loadSetup(): Promise<void> {
    const h = this.hass;
    if (!h?.callWS || this.loadingKey === 'setup') return;
    this.loadingKey = 'setup';
    try {
      const [prefs, info] = await Promise.all([
        h.callWS<RawPrefs>({ type: 'energy/get_prefs' }),
        h.callWS<RawInfo>({ type: 'energy/info' }).catch(() => null),
      ]);
      this.setup = parseSetup(prefs, info);
    } catch {
      this.setup = emptySetup(); // no energy dashboard set up
    }
    this.co2Id = findCo2(h);
    this.loadingKey = undefined;
  }

  private async changes(ids: string[], p: Period, end = p.end): Promise<ChangeRows> {
    const h = this.hass;
    if (!h?.callWS || !ids.length) return {};
    try {
      const res = await h.callWS<
        Record<string, { start: number | string; change?: number | null }[]>
      >({
        type: 'recorder/statistics_during_period',
        start_time: p.start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: ids,
        period: p.stat,
        types: ['change'],
        units: { energy: 'kWh' },
      });
      const out: ChangeRows = {};
      for (const [id, rows] of Object.entries(res ?? {})) {
        out[id] = rows.map((r) => ({
          start: typeof r.start === 'number' ? r.start : new Date(r.start).getTime(),
          change: r.change ?? null,
        }));
      }
      return out;
    } catch {
      return {};
    }
  }

  private async loadPeriod(): Promise<void> {
    const setup = this.setup;
    if (!setup || !this.hass) return;
    const key = this.key;
    const p = this.period;
    this.loadingKey = key;
    const ids = setupIds(setup);
    const prevP = previous(p);
    const put = (pd: PeriodData) => {
      const next = new Map(this.data);
      next.set(key, pd);
      this.data = next;
    };
    // Stage 1 (#203): only the period itself, so the card can draw right away. On a
    // refresh the comparison values of the last load stay until the new ones arrive.
    const old = this.data.get(key);
    const cur = await this.changes(ids, p);
    const b = toBuckets(p, cur);
    const series = flowSeries(p, b, setup);
    const devices: Record<string, number> = {};
    for (const d of setup.devices) {
      if (d.stat in b) devices[d.stat] = b[d.stat].reduce((x, y) => x + y, 0);
    }
    const pd: PeriodData = {
      series,
      totals: totals(series),
      prev: old?.prev ?? {},
      devices,
      usual: old?.usual,
      fossil: old?.fossil,
      full: old?.full ?? false,
      loadedAt: Date.now(),
    };
    put(pd);
    if (this.loadingKey === key) this.loadingKey = undefined;

    // Stage 2: the comparison, the usual range and the low-carbon share, side by side.
    const prev = this.changes(ids, prevP).then((rows) =>
      totals(flowSeries(prevP, toBuckets(prevP, rows), setup)),
    );
    // "Usual" for the grid-only chart: same hour of the last 14 days / same weekday of 8 weeks.
    const usual = (async () => {
      if (this.pv || !setup.import.length || (p.range !== 'day' && p.range !== 'week'))
        return undefined;
      const back = p.range === 'day' ? 14 : 8;
      const hist: number[][] = [];
      const rows = await this.changes(
        setup.import,
        {
          ...p,
          start: period(p.range, p.offset - back).start,
        },
        p.start,
      );
      for (let i = 1; i <= back; i++) {
        const q = period(p.range, p.offset - i);
        const sub: ChangeRows = {};
        for (const [id, list] of Object.entries(rows)) {
          sub[id] = list.filter((r) => r.start >= q.start.getTime() && r.start < q.end.getTime());
        }
        const s = flowSeries(q, toBuckets(q, sub), setup).import;
        if (s && s.some((v) => v > 0)) hist.push(s);
      }
      return usualBand(hist);
    })();
    const fossil = (async () => {
      if (!this.co2Id || !setup.import.length || !this.hass?.callWS) return undefined;
      try {
        const res = await this.hass.callWS<Record<string, number>>({
          type: 'energy/fossil_energy_consumption',
          start_time: p.start.toISOString(),
          end_time: p.end.toISOString(),
          energy_statistic_ids: setup.import,
          co2_statistic_id: this.co2Id,
          period: p.stat === 'month' ? 'month' : p.stat === 'day' ? 'day' : 'hour',
        });
        return Object.values(res ?? {}).reduce((a, v) => a + (v ?? 0), 0);
      } catch {
        return undefined; // CO₂ signal is optional
      }
    })();
    const [prevTotals, band, co2] = await Promise.all([prev, usual, fossil]);
    put({ ...(this.data.get(key) ?? pd), prev: prevTotals, usual: band, fossil: co2, full: true });
  }

  /** Today's forecast: the chosen sensor, else the energy dashboard's forecast. */
  private dayForecast(p: Period): DayForecast | undefined {
    const id = this.config?.solar_forecast;
    if (id) return isLive(p) ? sensorForecast(this.hass?.states[id], p) : undefined;
    const hours = forecastHours(this.forecast, this.setup?.forecast ?? [], p);
    return hours ? { hours, total: hours.reduce((a, b) => a + b, 0) } : undefined;
  }

  private async loadForecast(): Promise<void> {
    const h = this.hass;
    this.forecastAt = Date.now();
    if (!h?.callWS) return;
    try {
      this.forecast = await h.callWS<ForecastData>({ type: 'energy/solar_forecast' });
    } catch {
      this.forecast = null;
    }
  }

  // ---------- size handling ----------

  private observeSizes(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resize ??= new ResizeObserver((entries) => {
      let changed = false;
      const next = { ...this.sizes };
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const name = el.dataset.size;
        if (!name) continue;
        const w = Math.round(el.clientWidth);
        const h = Math.round(el.clientHeight);
        if (next[name]?.w !== w || next[name]?.h !== h) {
          next[name] = { w, h };
          changed = true;
        }
      }
      if (changed) this.sizes = next;
      this.fitHeight();
    });
    const els = this.renderRoot.querySelectorAll('[data-size]');
    const seen = new Set<Element>();
    els.forEach((el) => {
      seen.add(el);
      if (!this.observed.has(el)) {
        this.resize!.observe(el);
        this.observed.add(el);
      }
    });
    for (const el of this.observed) {
      if (!seen.has(el)) {
        this.resize.unobserve(el);
        this.observed.delete(el);
      }
    }
  }

  /**
   * Rounds the card height up to whole grid rows (56 px + 8 px gaps): the line plan takes
   * the extra space, so the card lines up with the cards around it.
   */
  private fitHeight(): void {
    const card = this.renderRoot.querySelector<HTMLElement>('.card');
    const plan = this.renderRoot.querySelector<HTMLElement>('.plan');
    if (!card || !plan) return;
    const cs = getComputedStyle(card);
    const gap = parseFloat(cs.rowGap) || 0;
    const kids = [...card.children].filter((c) => (c as HTMLElement).offsetParent !== null);
    let natural =
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) +
      parseFloat(cs.borderBottomWidth) +
      gap * Math.max(0, kids.length - 1);
    for (const k of kids) {
      natural +=
        k === plan
          ? parseFloat(getComputedStyle(plan).minHeight) || 0
          : (k as HTMLElement).offsetHeight;
    }
    const rows = Math.ceil((natural + 8) / 64);
    const h = rows * 64 - 8;
    // while a period loads the card keeps its height instead of collapsing (#203)
    if (this.setup && !this.pd && h < this.cardH) return;
    if (Math.abs(h - this.cardH) > 0.5) this.cardH = h;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.onViewResize);
    this.onViewResize();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.onViewResize);
    this.closeCal();
    this.resize?.disconnect();
    this.resize = undefined;
    this.observed.clear();
  }

  // ---------- interaction ----------

  private setRange(r: Range): void {
    if (r === this.range && this.offset === 0) return;
    this.range = r;
    this.offset = 0;
    this.syncCal();
  }

  private step(d: number): void {
    if (d > 0 && this.offset >= 0) return;
    this.offset += d;
    this.syncCal();
  }

  // ---------- calendar of the date picker (#193) ----------

  /** Shows the month / year of the selected period in the calendar. */
  private syncCal(): void {
    const s = this.period.start;
    this.calY = s.getFullYear();
    this.calM = s.getMonth();
    this.calLvl = this.calBase;
  }

  /** The level on which the selected range is picked. */
  private get calBase(): CalLevel {
    return this.range === 'year' ? 'years' : this.range === 'month' ? 'months' : 'days';
  }

  /** Title tap: from days to months to years, for far jumps. */
  private calUp(): void {
    this.calLvl = this.calLvl === 'days' ? 'months' : 'years';
  }

  /** Tap on a month or year above the base level: go one level down again. */
  private calDown(d: Date): void {
    this.calY = d.getFullYear();
    if (this.calLvl === 'months') this.calM = d.getMonth();
    this.calLvl = this.calLvl === 'years' && this.calBase === 'days' ? 'months' : this.calBase;
  }

  private toggleCal(): void {
    if (this.calOpen) return this.closeCal();
    this.syncCal();
    this.calOpen = true;
    window.addEventListener('pointerdown', this.onCalOutside, true);
    window.addEventListener('keydown', this.onCalKey);
  }

  private closeCal(): void {
    this.calOpen = false;
    window.removeEventListener('pointerdown', this.onCalOutside, true);
    window.removeEventListener('keydown', this.onCalKey);
  }

  private onCalOutside = (ev: Event) => {
    const box = this.renderRoot.querySelector('.dw');
    if (!box || !ev.composedPath().includes(box)) this.closeCal();
  };

  private onCalKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    this.closeCal();
    this.renderRoot.querySelector<HTMLElement>('.dd')?.focus();
  };

  private pick(date: Date): void {
    this.offset = Math.min(0, offsetFor(this.range, date));
    this.closeCal();
  }

  /** Pages the calendar: a month (day, week), a year (month) or twelve years (year). */
  private calStep(d: number): void {
    if (this.calLvl === 'months') this.calY += d;
    else if (this.calLvl === 'years')
      this.calY = Math.min(new Date().getFullYear(), this.calY) + 12 * d;
    else {
      const m = new Date(this.calY, this.calM + d, 1);
      this.calY = m.getFullYear();
      this.calM = m.getMonth();
    }
  }

  private calendar(): TemplateResult {
    const hass = this.hass;
    const lang = language(hass);
    const fmt = (o: Intl.DateTimeFormatOptions, d: Date) =>
      new Intl.DateTimeFormat(lang, o).format(d);
    const now = new Date();
    const range = this.range;
    const sel = this.period;
    const inSel = (d: Date) => d >= sel.start && d < sel.end;
    const y = this.calY;
    const m = this.calM;
    const yNow = now.getFullYear();

    let title: string;
    let canNext: boolean;
    let body: TemplateResult;
    const lvl = this.calLvl;
    const base = lvl === this.calBase;
    if (lvl === 'days') {
      title = fmt({ month: 'long', year: 'numeric' }, new Date(y, m, 1));
      canNext = y < yNow || (y === yNow && m < now.getMonth());
      const today = new Date(yNow, now.getMonth(), now.getDate());
      // 1 Jan 2024 was a Monday
      const heads = Array.from({ length: 7 }, (_, i) =>
        fmt({ weekday: 'short' }, new Date(2024, 0, 1 + i)).slice(0, 2),
      );
      const cell = (d: Date) => {
        const cls = [
          d.getMonth() === m ? '' : 'off',
          d.getTime() === today.getTime() ? 'now' : '',
          inSel(d) ? 'on' : '',
        ].join(' ');
        return range === 'week'
          ? html`<span class="c ${cls}">${d.getDate()}</span>`
          : html`<button
              class="c ${cls}"
              ?disabled=${d > today}
              aria-label=${fmt({ day: 'numeric', month: 'long', year: 'numeric' }, d)}
              aria-pressed=${inSel(d) ? 'true' : 'false'}
              @click=${() => this.pick(d)}
            >
              ${d.getDate()}
            </button>`;
      };
      const weeks = monthWeeks(y, m);
      body = html`<div class="cg ${range}">
        <div class="cr chd">
          ${range === 'week' ? html`<span class="kw">${ft(hass, 'week_short')}</span>` : nothing}
          ${heads.map((h) => html`<span>${h}</span>`)}
        </div>
        ${weeks.map((w) =>
          range === 'week'
            ? html`<button
                class="cr wk ${inSel(w[0]) ? 'on' : ''}"
                ?disabled=${w[0] > today}
                aria-label="${ft(hass, 'week_short')} ${isoWeek(w[0])}"
                aria-pressed=${inSel(w[0]) ? 'true' : 'false'}
                @click=${() => this.pick(w[0])}
              >
                <span class="kw">${isoWeek(w[0])}</span>${w.map(cell)}
              </button>`
            : html`<div class="cr">${w.map(cell)}</div>`,
        )}
      </div>`;
    } else {
      const months = lvl === 'months';
      // the years page ends with the current year when it would reach past it
      const last = months ? y : Math.min(yNow, y);
      const first = last - 11;
      title = months ? String(y) : `${first} – ${last}`;
      canNext = months ? y < yNow : last < yNow;
      const items = Array.from({ length: 12 }, (_, i) =>
        months ? new Date(y, i, 1) : new Date(first + i, 0, 1),
      );
      // above the base level the month / year of the selection is marked
      const sy = sel.start.getFullYear();
      const on = (d: Date) =>
        base
          ? inSel(d)
          : d.getFullYear() === sy && (!months || d.getMonth() === sel.start.getMonth());
      body = html`<div class="cg cgb">
        ${items.map((d) => {
          const cur = d.getFullYear() === yNow && (!months || d.getMonth() === now.getMonth());
          const label = months
            ? fmt({ month: 'long', year: 'numeric' }, d)
            : String(d.getFullYear());
          return html`<button
            class="c ${cur ? 'now' : ''} ${on(d) ? 'on' : ''}"
            ?disabled=${d > now}
            aria-label=${label}
            aria-pressed=${on(d) ? 'true' : 'false'}
            @click=${() => (base ? this.pick(d) : this.calDown(d))}
          >
            ${months ? fmt({ month: 'short' }, d) : d.getFullYear()}
          </button>`;
        })}
      </div>`;
    }
    const nowKey: Record<Range, FlowKey> = {
      day: 'today',
      week: 'this_week',
      month: 'this_month',
      year: 'this_year',
    };
    return html`<div class="cal" role="dialog" aria-label=${ft(hass, 'pick_date')}>
      <div class="cn">
        <button aria-label=${ft(hass, 'back')} @click=${() => this.calStep(-1)}>
          ${chev(CHEV_L)}
        </button>
        ${
          lvl === 'years'
            ? html`<span class="ct2">${title}</span>`
            : html`<button
                class="ct2 up"
                aria-label="${title}, ${ft(hass, lvl === 'days' ? 'pick_month' : 'pick_year')}"
                @click=${() => this.calUp()}
              >
                ${title}${chev(CHEV_D)}
              </button>`
        }
        <button
          aria-label=${ft(hass, 'next')}
          ?disabled=${!canNext}
          @click=${() => this.calStep(1)}
        >
          ${chev(CHEV_R)}
        </button>
      </div>
      ${body}
      <button class="cnow" ?disabled=${this.offset === 0} @click=${() => this.pick(now)}>
        ${ft(hass, nowKey[range])}
      </button>
    </div>`;
  }

  private moreInfo(entity?: string): void {
    if (entity && this.hass?.states[entity])
      fireEvent(this, 'hass-more-info', { entityId: entity });
  }

  private onKey = (fn: () => void) => (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    fn();
  };

  // ---------- render ----------

  private get width(): number {
    return this.sizes.card?.w ?? 1000;
  }

  private get narrow(): boolean {
    return this.width < NARROW;
  }

  /** Vertical line plan: phones only. Narrow cards on a computer keep the horizontal plan. */
  private get vertical(): boolean {
    return this.width < VERTICAL;
  }

  render() {
    if (!this.config) return nothing;
    const hass = this.hass;
    const setup = this.setup;
    const empty = setup && !setup.import.length && !this.hasPower;
    const p = this.period;
    const labels = periodLabels(hass, p);
    const name = this.config.name ?? ft(hass, 'title');
    const sub = empty ? ft(hass, 'no_setup_sub') : this.subtitle(labels.name);
    // the date picker shares the header row only where the subtitle keeps enough room
    const inline = this.width >= WIDE;
    return html`<div
      class="glass card ${this.narrow ? 'narrow' : ''} ${setup && !this.pd ? 'loading' : ''}"
      data-size="card"
      style=${this.cardH ? `height:${this.cardH}px` : ''}
    >
      <div class="top">
        <glowcard-orb .icon=${this.icon} active .size=${this.narrow ? 42 : 52}></glowcard-orb>
        <div class="txt">
          <div class="title">${empty ? ft(hass, 'no_setup') : name}</div>
          <div class="sub ellip">${sub}</div>
        </div>
        ${inline ? this.picker(labels.long) : nothing}
      </div>
      ${inline ? nothing : this.picker(this.narrow ? labels.short : labels.long)}
      <div class="plan" data-size="plan" style="min-height:${this.planMin}px">${this.plan()}</div>
      ${this.kpis()} ${this.sections()}
    </div>`;
  }

  private get planMin(): number {
    if (this.narrow && !this.vertical) return this.pv ? 340 : 200;
    if (this.narrow) {
      // Phones (#185): the plan takes what the screen leaves next to HA's top bar, the card
      // header, the date picker and a bottom bar, between a sensible minimum and its full size.
      const [min, max] = this.pv ? [380, 560] : [240, 300];
      return Math.round(Math.min(max, Math.max(min, this.viewH - PHONE_RESERVE)));
    }
    return this.pv ? 440 : 240;
  }

  private subtitle(periodName: string): string {
    const hass = this.hass;
    if (this.live) {
      const n = this.now;
      const f = flows(n);
      const home = kwText(hass, n.home ?? 0);
      if (!this.pv) return ft(hass, 'live_grid', { v: home });
      if (f.main === 'solar') {
        const key: FlowKey =
          f.toBattery > IDLE_W && f.toGrid > IDLE_W
            ? 'live_solar_all'
            : f.toBattery > IDLE_W
              ? 'live_solar_charge'
              : f.toGrid > IDLE_W
                ? 'live_solar_export'
                : 'live_solar';
        return ft(hass, key);
      }
      if (f.main === 'bat') return ft(hass, 'live_battery');
      return ft(hass, 'live_mixed', { v: home });
    }
    const t = this.pd?.totals;
    // the spinner in the middle of the card says that data loads
    if (!t) return '';
    if (!this.pv) {
      return ft(hass, 'from_grid_sub', { v: `${fkwh(hass, t.import ?? 0)} kWh`, p: periodName });
    }
    const ss = selfSufficiency(t);
    return ss === undefined
      ? periodName
      : ft(hass, 'autarky_sub', { v: `${fnum(hass, ss, 0)} %`, p: periodName });
  }

  private picker(label: string): TemplateResult {
    const hass = this.hass;
    const key: Record<Range, FlowKey> = {
      day: 'range_day',
      week: 'range_week',
      month: 'range_month',
      year: 'range_year',
    };
    return html`<div class="dp">
      <div class="seg" role="group">
        ${RANGES.map(
          (r) =>
            html`<button
              aria-pressed=${r === this.range ? 'true' : 'false'}
              @click=${() => this.setRange(r)}
            >
              ${ft(hass, key[r])}
            </button>`,
        )}
      </div>
      <div class="dw">
        <div class="dnav">
          <button aria-label=${ft(hass, 'back')} @click=${() => this.step(-1)}>
            ${chev(CHEV_L)}
          </button>
          <button
            class="dd"
            aria-haspopup="dialog"
            aria-expanded=${this.calOpen ? 'true' : 'false'}
            title=${ft(hass, 'pick_date')}
            @click=${() => this.toggleCal()}
          >
            ${CAL_ICON}<span>${label}</span>
          </button>
          <button
            aria-label=${ft(hass, 'next')}
            ?disabled=${this.offset >= 0}
            @click=${() => this.step(1)}
          >
            ${chev(CHEV_R)}
          </button>
        </div>
        ${this.calOpen ? this.calendar() : nothing}
      </div>
    </div>`;
  }

  // ---------- line plan ----------

  private plan(): TemplateResult | typeof nothing {
    const size = this.sizes.plan;
    if (!size || !this.setup) return nothing;
    const hass = this.hass;
    const { w, h } = size;
    const live = this.live;
    const n = this.now;
    const t = this.pd?.totals;
    // While a period loads, a spinner takes the plan's place (#203).
    const pending = !live && !t;
    if (pending)
      return html`<div class="spin" role="status" aria-label=${ft(hass, 'loading')}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="19" class="ring" />
          <circle cx="24" cy="24" r="19" class="arc" />
        </svg>
        <span>${ft(hass, 'loading')}</span>
      </div>`;
    const f: PlanFlows = live ? livePlan(n) : periodPlan(t ?? {}, this.hasSolar, this.hasBattery);
    const idle = (v: number | undefined) =>
      v === undefined || Math.abs(v) < (live ? IDLE_W : IDLE_KWH);
    const big = (v: number) =>
      pending
        ? html`<span class="wait">–</span>`
        : live
          ? html`${fnum(hass, Math.abs(v) / 1000, Math.abs(v) >= 1000 ? 1 : 2)}<small>kW</small>`
          : html`${fkwh(hass, Math.abs(v))}<small>kWh</small>`;
    const c = this.config!;

    // Node texts
    const gridT3 = live
      ? idle(f.grid)
        ? ft(hass, 'idle')
        : f.grid > 0
          ? ft(hass, 'import')
          : ft(hass, 'export')
      : t?.export
        ? `${ft(hass, 'imported')} · ${fkwh(hass, t.export)} ${ft(hass, 'exported')}`
        : ft(hass, 'imported');
    const solarT3 = live ? ft(hass, 'production') : ft(hass, 'produced');
    const batT3 = live
      ? idle(f.bat)
        ? ft(hass, 'idle')
        : (f.bat ?? 0) > 0
          ? ft(hass, 'charging')
          : ft(hass, 'discharging')
      : `${ft(hass, 'charged')}${t?.discharge ? ` · ${fkwh(hass, t.discharge)} ${ft(hass, 'discharged')}` : ''}`;
    const soc = numberState(this.hass!, c.battery);
    const narrow = this.narrow;
    const short = (s: string) => (narrow ? s.split(' · ')[0] : s);

    const nodes: PlanNode[] = [];
    const segs: PlanSeg[] = [];
    // The nodes are opaque capsules on the lines (#191): wires run to their centres.
    const R = 0;
    const gridV = live ? f.grid : (t?.import ?? 0);
    const node = (
      k: NodeKind,
      x: number,
      y: number,
      lab: PlanNode['lab'],
      t1: string,
      v: number,
      t3: string,
      entity?: string,
    ) => nodes.push({ k, x, y, lab, t1, t2: big(v), t3: short(t3), entity });
    // every line takes the colour of the source it carries, mixed after a junction (#198)
    const mixes = planMix(f);
    const seg = (a: [number, number], b: [number, number], k: keyof PlanFlows) =>
      segs.push({ a, b, mix: mixes[k], v: f[k] ?? 0, idle: idle(f[k]) });
    const batName =
      soc !== null && live ? `${ft(hass, 'battery')} ${fnum(hass, soc, 0)} %` : ft(hass, 'battery');
    const homeT3 = live ? ft(hass, 'consumption') : ft(hass, 'consumed');
    const s = this.hasSolar;
    const b = this.hasBattery;

    if (!this.vertical) {
      const yb = narrow ? h * 0.46 : h / 2;
      const off = Math.min(160, h * 0.32);
      // Wide: the grid and home labels sit beside their icons, keep room for "12.345 kWh".
      // Compact (#187, narrow card on a computer): labels below the icons, near the edges.
      const room = narrow ? 78 : 100;
      const xn = Math.max(room, s || b ? w * 0.12 : w * 0.2);
      const xh = Math.min(w - room, s || b ? w * 0.86 : w * 0.8);
      const xs = s && b ? w * (narrow ? 0.42 : 0.38) : w * 0.5;
      const xk = s && b ? w * (narrow ? 0.63 : 0.62) : w * 0.5;
      const side = narrow ? 'b' : undefined;
      node('grid', xn, yb, side ?? 'l', ft(hass, 'grid'), gridV, gridT3, c.grid);
      node('home', xh, yb, side ?? 'r', ft(hass, 'home'), f.home, homeT3, c.home);
      if (s) node('solar', xs, yb - off, 'r', ft(hass, 'solar'), f.solar ?? 0, solarT3, c.solar);
      if (b)
        node(
          'bat',
          xk,
          yb + off,
          narrow ? 'l' : 'r',
          batName,
          f.bat ?? 0,
          batT3,
          c.battery_power ?? c.battery,
        );
      const j1 = s ? xs : b ? xk : xh - R;
      seg([xn + R, yb], [j1, yb], 'grid');
      if (s) {
        seg([xs, yb - off + R], [xs, yb], 'solar');
      }
      if (s && b) {
        seg([xs, yb], [xk, yb], 'middle');
      }
      if (b) {
        seg([xk, yb], [xk, yb + off - R], 'bat');
      }
      if (s || b) {
        const last = b ? xk : xs;
        seg([last, yb], [xh - R, yb], 'home');
      }
    } else {
      const xb = w / 2;
      const yn = 50;
      const yh = h - 50;
      const ys = s && b ? h * 0.33 : h * 0.45;
      const yk = s && b ? h * 0.62 : h * 0.55;
      const xl = 70;
      const xr = w - 70;
      node('grid', xb, yn, 'r', ft(hass, 'grid'), gridV, gridT3, c.grid);
      node('home', xb, yh, 'r', ft(hass, 'home'), f.home, homeT3, c.home);
      if (s) node('solar', xl, ys, 'b', ft(hass, 'solar'), f.solar ?? 0, solarT3, c.solar);
      if (b) node('bat', xr, yk, 'b', batName, f.bat ?? 0, batT3, c.battery_power ?? c.battery);
      const j1 = s ? ys : b ? yk : yh - R;
      seg([xb, yn + R], [xb, j1], 'grid');
      if (s) seg([xl + R, ys], [xb, ys], 'solar');
      if (s && b) {
        seg([xb, ys], [xb, yk], 'middle');
      }
      if (b) seg([xb, yk], [xr - R, yk], 'bat');
      if (s || b) {
        const last = b ? yk : ys;
        seg([xb, last], [xb, yh - R], 'home');
      }
    }

    const pal = (k: keyof SourceShare) => COLORS[k][this.dark ? 'dark' : 'light'];
    const blendC = (m: SourceShare) =>
      [0, 1, 2]
        .map((i) =>
          Math.round(m.grid * pal('grid')[i] + m.solar * pal('solar')[i] + m.bat * pal('bat')[i]),
        )
        .join(',');
    // junction dots where segments meet: the colour of what leaves them
    // (grey when nothing flows through them, #181)
    const ends = new Map<string, { n: number; mix?: SourceShare; out: boolean }>();
    for (const sg of segs)
      for (const pt of [sg.a, sg.b]) {
        const e = ends.get(pt.join()) ?? { n: 0, out: false };
        e.n++;
        const leaves = pt === (sg.v < 0 ? sg.b : sg.a);
        if (!sg.idle && (!e.mix || (leaves && !e.out))) {
          e.mix = sg.mix;
          e.out = leaves;
        }
        ends.set(pt.join(), e);
      }
    const dots = [...ends.entries()]
      .filter(([, e]) => e.n > 1)
      .map(([k, e]) => ({ p: k.split(',').map(Number), mix: e.mix }));
    const idleC = this.col('rest');
    const maxV = live ? 5000 : 20;
    return html`<svg class="wires" width=${w} height=${h} viewBox="0 0 ${w} ${h}">
        ${segs.map((sg) => {
          // idle connections share one neutral grey instead of their source colour
          const c = sg.idle ? idleC : blendC(sg.mix);
          const [a, z] = sg.v < 0 ? [sg.b, sg.a] : [sg.a, sg.b];
          const d = `M${a[0]},${a[1]} L${z[0]},${z[1]}`;
          const mag = Math.min(1, Math.abs(sg.v) / maxV);
          const sp = 1.9 - mag * 1.2;
          const slots = mixSlots(sg.mix);
          const kinds = [...new Set(slots)];
          // one source: dots in its colour. Several: the dots alternate in the sources'
          // colours, as many of each as its share.
          const flow = kinds.map((k) => {
            const kc = pal(k).join(',');
            if (kinds.length === 1)
              return svg`<path d=${d} class="flow" stroke="rgb(${kc})" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" fill="none" style="--sp:${sp.toFixed(2)}s;filter:drop-shadow(0 0 4px rgba(${kc},1))"/>`;
            const own = slots.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0);
            const n = slots.length;
            const dash = own
              .map((i, j) => `2 ${((own[j + 1] ?? own[0] + n) - i) * 12 - 2}`)
              .join(' ');
            return svg`<path d=${d} class="flow" stroke="rgb(${kc})" stroke-width="3" stroke-dasharray=${dash} stroke-linecap="round" fill="none" style="--sp:${(sp * n).toFixed(2)}s;--o:${-own[0] * 12}px;--len:${n * 12}px;filter:drop-shadow(0 0 4px rgba(${kc},1))"/>`;
          });
          return svg`<path d=${d} stroke="rgba(${c},${sg.idle ? 0.1 : 0.18})" stroke-width=${sg.idle ? 4 : 4 + mag * 8} stroke-linecap="round" fill="none"/>
            <path d=${d} stroke="rgba(${c},${sg.idle ? 0.4 : 0.55})" stroke-width="1.5" fill="none"/>
            ${sg.idle ? nothing : flow}`;
        })}
        ${dots.map(({ p: [x, y], mix }) => {
          if (!mix) return svg`<circle cx=${x} cy=${y} r="4" fill="rgba(${idleC},.7)"/>`;
          const dc = blendC(mix);
          return svg`<circle cx=${x} cy=${y} r="5" fill="rgb(${dc})" style="filter:drop-shadow(0 0 5px rgba(${dc},1))"/>`;
        })}
      </svg>
      ${nodes.map((nd) => this.node(nd, nd.k === 'bat' ? soc : null))}`;
  }

  /** A node: glass capsule on the line with the neon icon, name, state and value. */
  private node(nd: PlanNode, soc: number | null): TemplateResult {
    const c = this.col(nd.k);
    const click = () => this.moreInfo(nd.entity);
    const can = !!(nd.entity && this.hass?.states[nd.entity]);
    return html`<div
      class="cap ${can ? 'tap' : ''}"
      style="left:${nd.x}px;top:${nd.y}px;--a:${c}"
      role=${can ? 'button' : nothing}
      tabindex=${can ? 0 : nothing}
      aria-label="${nd.t1}, ${nd.t3}"
      @click=${click}
      @keydown=${this.onKey(click)}
    >
      <span class="ci">${neonIcon(nd.k, c, this.dark, soc)}</span>
      <span class="ct">
        <span class="t1"><b>${nd.t1}</b></span>
        <span class="t2">${nd.t2}</span>
      </span>
    </div>`;
  }

  // ---------- key figures ----------

  private kpis(): TemplateResult | typeof nothing {
    const setup = this.setup;
    if (!setup || (!setup.import.length && !this.pv)) return nothing;
    if (!this.pd) return nothing;
    const pending = false;
    const t: Totals = this.pd.totals;
    const hass = this.hass;
    const today = this.range === 'day' && this.offset === 0;
    const lab = (k: FlowKey) =>
      today ? `${ft(hass, k)} ${ft(hass, 'today_suffix')}` : ft(hass, k);
    const cur = currency(hass);
    const list: [string, string][] = [];
    const cost = t.energyCost;
    // A figure that cannot be calculated yet shows "–": the tiles stay the same (#202).
    const pct = (v: number | undefined) => (v === undefined ? '–' : `${fnum(hass, v, 0)} %`);
    if (!this.pv) {
      if (pending) list.push([lab('kpi_consumption'), '–'], [lab('kpi_import'), '–']);
      if (t.home !== undefined) list.push([lab('kpi_consumption'), `${fkwh(hass, t.home)} kWh`]);
      if (t.import !== undefined) list.push([lab('kpi_import'), `${fkwh(hass, t.import)} kWh`]);
      const lc = lowCarbon(t.import, this.pd?.fossil);
      // the low-carbon share arrives later: keep its place so the tiles do not jump
      if (lc !== undefined || (this.co2Id && (pending || !this.pd?.full)))
        list.push([ft(hass, 'kpi_low_carbon'), pct(lc)]);
    } else {
      const gn = gridNeutrality(t);
      list.push([ft(hass, 'kpi_self_sufficiency'), pct(selfSufficiency(t))]);
      if (this.hasSolar) list.push([ft(hass, 'kpi_self_consumption'), pct(selfConsumption(t))]);
      list.push([
        ft(hass, 'kpi_neutrality'),
        gn === undefined
          ? '–'
          : `${gn > 0 ? '+' : gn < 0 ? '−' : ''}${fkwh(hass, Math.abs(gn))} kWh`,
      ]);
    }
    if (cost !== undefined) list.push([lab('kpi_cost'), fmoney(hass, cost, cur)]);
    else if (pending && setup.importCost.length) list.push([lab('kpi_cost'), '–']);
    if (!list.length) return nothing;
    return html`<div
      class="kpis ${pending ? 'wait' : ''}"
      style="--n:${this.narrow ? 2 : list.length}"
    >
      ${list.map(
        ([k, v]) =>
          html`<div class="kpi">
            <div class="k">${k}</div>
            <div class="v">${v}</div>
          </div>`,
      )}
    </div>`;
  }

  // ---------- areas ----------

  private sections(): TemplateResult | typeof nothing {
    const pd = this.pd;
    const setup = this.setup;
    if (!setup) return nothing;
    const want = this.config?.sections ?? SECTIONS;
    if (!pd) return nothing;
    const t = pd.totals;
    const has: Record<FlowSection, boolean> = {
      usage: !!pd.series.home || !!pd.series.import,
      sources:
        t.import !== undefined ||
        t.solar !== undefined ||
        t.gas !== undefined ||
        t.water !== undefined,
      solar: !!pd.series.solar,
      devices: setup.devices.length > 0,
      gas: !!pd.series.gas,
      water: !!pd.series.water,
    };
    const list = want.filter((s, i) => SECTIONS.includes(s) && want.indexOf(s) === i && has[s]);
    if (!list.length) return nothing;
    const wide = this.width >= WIDE;
    const spans = this.narrow
      ? list.map(() => 12)
      : packSpans(list.map((s) => SPAN[s][wide ? 0 : 1]));
    return html`<div class="secs">
      ${list.map((s, i) => html`<div class="sec" style="grid-column:span ${spans[i]}">${this.section(s)}</div>`)}
    </div>`;
  }

  private section(s: FlowSection): TemplateResult {
    switch (s) {
      case 'usage':
        return this.usage();
      case 'sources':
        return this.sourcesTable();
      case 'solar':
        return this.solarSection();
      case 'devices':
        return this.devicesList();
      case 'gas':
        return this.meterSection('gas');
      default:
        return this.meterSection('water');
    }
  }

  private head(
    icon: string,
    k: Kind,
    title: string,
    right: TemplateResult | string = '',
  ): TemplateResult {
    return html`<div class="sh">
      ${smallIcon(icon, this.col(k), this.dark)}<span class="st">${title}</span>${right}
    </div>`;
  }

  private usage(): TemplateResult {
    const hass = this.hass;
    const p = this.period;
    const labels = periodLabels(hass, p);
    const s = this.pd!.series;
    const pv = this.pv && !!(s.solar || s.discharge);
    const meta = html`<span class="sm">${labels.name} · ${labels.unit}</span>`;
    const legend = pv
      ? html`${legendItem(this.col('solar'), ft(hass, 'solar'))}${legendItem(this.col('bat'), ft(hass, 'battery'))}${legendItem(this.col('grid'), ft(hass, 'grid'))}<span
            >${ft(hass, 'legend_below')}</span
          >`
      : html`${legendItem(this.col('grid'), ft(hass, 'legend_import'))}${
          this.pd?.usual
            ? html`<span
                ><i class="usual"></i>${isLive(p) ? ft(hass, 'usual_now') : ft(hass, 'usual')}</span
              >`
            : nothing
        }`;
    return html`${this.head('chart', 'home', ft(hass, 'sec_usage'), meta)}
      <div class="ch" data-size="usage">${pv ? this.stackChart() : this.gridChart()}</div>
      <div class="lg">${legend}</div>`;
  }

  private chartFrame(
    name: string,
    body: (w: number, h: number, bw: number) => TemplateResult[],
    axis = true,
  ) {
    const size = this.sizes[name];
    if (!size) return nothing;
    const p = this.period;
    const { w, h } = size;
    const bw = w / p.buckets;
    const labels = axis ? axisLabels(this.hass, p) : [];
    const shown =
      p.range === 'month' || p.range === 'year' || w > 260
        ? labels
        : labels.filter((_, i) => i % 2 === 0);
    return html`<svg class="bars" width=${w} height=${h} viewBox="0 0 ${w} ${h}">
        ${body(w, h, bw)}
      </svg>
      ${shown.map(
        ([x, l]) =>
          html`<div class="ax" style="left:${Math.min(w - 8, Math.max(6, x * bw))}px">${l}</div>`,
      )}`;
  }

  private bars(
    values: number[],
    bw: number,
    bot: number,
    sc: number,
    k: Kind,
    down = false,
    y0 = bot,
  ) {
    const p = this.period;
    const fill = filledBuckets(p);
    const c = this.col(k);
    const live = isLive(p);
    return values.slice(0, fill).map((v, i) => {
      const hgt = Math.max(v > 0 ? 1 : 0, v * sc);
      const y = down ? y0 : y0 - hgt;
      return svg`<rect x=${i * bw + bw * 0.18} y=${y} width=${bw * 0.64} height=${hgt} rx=${Math.min(3, bw * 0.2)} fill="rgba(${c},${live && i === fill - 1 ? 0.45 : 0.85})"/>`;
    });
  }

  private slots(bw: number, bot: number) {
    const p = this.period;
    const out = [];
    for (let i = filledBuckets(p); i < p.buckets; i++) {
      out.push(
        svg`<rect x=${i * bw + bw * 0.18} y=${bot - 3} width=${bw * 0.64} height="3" rx="1.5" class="slot"/>`,
      );
    }
    return out;
  }

  private nowLine(bw: number, h: number) {
    if (!isLive(this.period)) return nothing;
    const d = new Date();
    const x = (d.getHours() + d.getMinutes() / 60) * bw;
    return svg`<line x1=${x} x2=${x} y1="0" y2=${h - 14} stroke="rgb(${this.col('home')})" stroke-dasharray="2 3" opacity=".8"/>`;
  }

  private gridChart() {
    const s = this.pd!.series;
    const usual = this.pd!.usual;
    const imp = s.import ?? s.home ?? [];
    return this.chartFrame('usage', (_w, h, bw) => {
      const top = 6;
      const bot = h - 16;
      const mx = Math.max(0.01, ...imp, ...(usual ?? []).map((u) => u.hi)) * 1.15;
      const sc = (bot - top) / mx;
      const out: TemplateResult[] = [];
      if (usual) {
        const pt = (v: number, i: number) => `${(i + 0.5) * bw},${bot - v * sc}`;
        const hi = usual.map((u, i) => pt(u.hi, i));
        const lo = usual.map((u, i) => pt(u.lo, i)).reverse();
        out.push(svg`<path d="M${hi.join(' L')} L${lo.join(' L')}Z" class="band"/>`);
        out.push(svg`<path d="M${hi.join(' L')}" class="band-line"/>`);
      }
      out.push(
        svg`<g style="filter:drop-shadow(0 0 4px rgba(${this.col('grid')},.6))">${this.bars(imp, bw, bot, sc, 'grid')}</g>`,
      );
      out.push(svg`${this.slots(bw, bot)}`);
      out.push(svg`${this.nowLine(bw, h)}`);
      return out;
    });
  }

  private stackChart() {
    const s = this.pd!.series;
    const n = s.buckets;
    const z = new Array(n).fill(0);
    const used = s.solarUsed ?? z;
    const dis = s.discharge ?? z;
    const imp = s.import ?? z;
    const exp = s.export ?? z;
    const chg = s.charge ?? z;
    return this.chartFrame('usage', (w, h, bw) => {
      // One kWh scale above and below the line (like HA's energy dashboard, #183): the zero
      // line sits where the largest bar up and the largest bar down both fit.
      const top = 6;
      const bottom = h - 16;
      const up = used.map((v, i) => v + dis[i] + imp[i]);
      const down = exp.map((v, i) => v + chg[i]);
      const maxUp = Math.max(0, ...up);
      const maxDown = Math.max(0, ...down);
      const span = Math.max(0.01, maxUp + maxDown) * 1.08;
      const sc = (bottom - top) / span;
      const bot = top + maxUp * 1.04 * sc;
      const fill = filledBuckets(this.period);
      const live = isLive(this.period);
      const x = (i: number) => i * bw + bw * 0.18;
      const bwid = bw * 0.64;
      const rx = Math.min(3, bw * 0.2);
      const out: TemplateResult[] = [];
      // Rectangle as a path, rounded only at its top (t) and/or bottom (b) end.
      const box = (x0: number, y0: number, hh: number, t: boolean, b: boolean) => {
        const r = Math.min(rx, hh / 2, bwid / 2);
        const rt = t ? r : 0;
        const rb = b ? r : 0;
        const x1 = x0 + bwid;
        const y1 = y0 + hh;
        return `M${x0},${y0 + rt} Q${x0},${y0} ${x0 + rt},${y0} L${x1 - rt},${y0} Q${x1},${y0} ${x1},${y0 + rt} L${x1},${y1 - rb} Q${x1},${y1} ${x1 - rb},${y1} L${x0 + rb},${y1} Q${x0},${y1} ${x0},${y1 - rb} Z`;
      };
      // Stacked segments touch each other; only the outer end of the bar is rounded.
      const stack = (i: number, parts: [number, Kind][], dir: 1 | -1, a: number) => {
        const shown = parts.filter(([v]) => v * sc >= 0.5);
        let y = dir > 0 ? bot : bot + 1;
        shown.forEach(([v, k], j) => {
          const sh = v * sc;
          const outer = j === shown.length - 1;
          const y0 = dir > 0 ? y - sh : y;
          out.push(
            svg`<path d=${box(x(i), y0, sh, dir > 0 && outer, dir < 0 && outer)} fill="rgba(${this.col(k)},${a})"/>`,
          );
          y += dir > 0 ? -sh : sh;
        });
      };
      for (let i = 0; i < fill; i++) {
        const a = live && i === fill - 1 ? 0.45 : 0.85;
        stack(
          i,
          [
            [used[i], 'solar'],
            [dis[i], 'bat'],
            [imp[i], 'grid'],
          ],
          1,
          a,
        );
        stack(
          i,
          [
            [exp[i], 'solar'],
            [chg[i], 'bat'],
          ],
          -1,
          live && i === fill - 1 ? 0.3 : 0.45,
        );
      }
      out.push(svg`<line x1="0" x2=${w} y1=${bot + 0.5} y2=${bot + 0.5} class="base"/>`);
      out.push(svg`${this.slots(bw, bot)}`);
      out.push(svg`${this.nowLine(bw, h)}`);
      return [svg`<g style="filter:drop-shadow(0 0 4px rgba(${this.col('grid')},.25))">${out}</g>`];
    });
  }

  private solarSection(): TemplateResult {
    const hass = this.hass;
    const pd = this.pd!;
    const solar = pd.series.solar ?? [];
    const p = this.period;
    const day = this.dayForecast(p);
    const fc = day?.hours;
    const tot = pd.totals.solar ?? 0;
    const fcTotal = day?.total;
    const right = html`<span class="big">${fkwh(hass, tot)}<small>kWh</small></span>`;
    const chart = this.chartFrame('solar', (w, h, bw) => {
      const top = 6;
      const bot = h - 16;
      const mx = Math.max(0.01, ...solar, ...(fc ?? [])) * 1.12;
      const sc = (bot - top) / mx;
      const out: TemplateResult[] = [];
      if (fc) {
        const pts = fc.map((v, i) => `${(i + 0.5) * bw},${bot - v * sc}`);
        out.push(
          svg`<path d="M${0.5 * bw},${bot} L${pts.join(' L')} L${(fc.length - 0.5) * bw},${bot}Z" fill="rgba(${this.col('solar')},.1)"/>`,
        );
      }
      out.push(svg`${this.bars(solar, bw, bot, sc, 'solar')}`);
      out.push(svg`<line x1="0" x2=${w} y1=${bot + 1} y2=${bot + 1} class="base"/>`);
      if (fc) {
        const pts = fc.map((v, i) => `${(i + 0.5) * bw},${bot - v * sc}`);
        out.push(
          svg`<path d="M${pts.join(' L')}" fill="none" stroke="rgb(${this.col('solar')})" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>`,
        );
      }
      out.push(svg`${this.nowLine(bw, h)}`);
      return [
        svg`<g style="filter:drop-shadow(0 0 4px rgba(${this.col('solar')},.45))">${out}</g>`,
      ];
    });
    const rest =
      fcTotal !== undefined
        ? p.offset === 0
          ? ft(hass, 'still_expected', { v: `${fkwh(hass, Math.max(0, fcTotal - tot))} kWh` })
          : ft(hass, 'forecast_reached', { p: `${fnum(hass, (tot / fcTotal) * 100, 0)} %` })
        : '';
    return html`${this.head('solar', 'solar', ft(hass, 'sec_solar'), right)}
      <div class="ch" data-size="solar">${chart}</div>
      <div class="lg">
        ${legendItem(this.col('solar'), ft(hass, 'produced'))}
        ${
          fcTotal !== undefined
            ? html`<span
                ><i class="fc" style="--a:${this.col('solar')}"></i
                >${ft(hass, 'forecast_short', { f: `${fkwh(hass, fcTotal)} kWh` })}</span
              >`
            : nothing
        }
        ${rest ? html`<span>${rest}</span>` : nothing}
      </div>`;
  }

  private sourcesTable(): TemplateResult {
    const hass = this.hass;
    const t = this.pd!.totals;
    const labels = periodLabels(hass, this.period);
    const cur = currency(hass);
    const gasU = this.unit(this.setup!.gas[0], 'm³');
    const watU = this.unit(this.setup!.water[0], 'L');
    const rows: [Kind | null, string, string, number | undefined][] = [];
    const q = (v: number, u: string) =>
      `${u === 'kWh' ? fkwh(hass, v) : fnum(hass, v, v >= 100 ? 0 : 1)} ${u}`;
    if (t.import !== undefined)
      rows.push(['grid', ft(hass, 'row_import'), q(t.import, 'kWh'), t.importCost]);
    if (t.solar !== undefined)
      rows.push(['solar', ft(hass, 'row_solar'), q(t.solar, 'kWh'), undefined]);
    if (t.discharge !== undefined)
      rows.push(['bat', ft(hass, 'row_discharge'), q(t.discharge, 'kWh'), undefined]);
    if (t.export !== undefined)
      rows.push([
        'grid',
        ft(hass, 'row_export'),
        q(t.export, 'kWh'),
        t.exportComp !== undefined ? -t.exportComp : undefined,
      ]);
    if (t.gas !== undefined) rows.push(['gas', ft(hass, 'gas'), q(t.gas, gasU), t.gasCost]);
    if (t.water !== undefined)
      rows.push(['water', ft(hass, 'water'), q(t.water, watU), t.waterCost]);
    const costs = rows.map((r) => r[3]).filter((x): x is number => x !== undefined);
    const withCost = costs.length > 0;
    const sum = costs.reduce((a, b) => a + b, 0);
    const money = (v?: number) =>
      v === undefined ? '–' : `${v < 0 ? '−' : ''}${fmoney(hass, Math.abs(v), cur)}`;
    return html`${this.head('list', 'home', ft(hass, 'sec_sources'), html`<span class="sm">${labels.name}</span>`)}
      <div class="tbl ${withCost ? 'cost' : ''}">
        ${rows.map(
          ([k, a, b, c]) =>
            html`<div class="r">
              <i class="d" style="--a:${this.col(k!)}"></i><span>${a}</span
              ><b>${b}</b>${withCost ? html`<em>${money(c)}</em>` : nothing}
            </div>`,
        )}
        ${withCost ? html`<div class="r sum"><i></i><span>${ft(hass, 'row_total')}</span><b></b><em>${money(sum)}</em></div>` : nothing}
      </div>`;
  }

  private unit(id: string | undefined, fallback: string): string {
    const u = id ? this.hass?.states[id]?.attributes.unit_of_measurement : undefined;
    return typeof u === 'string' && u ? u : fallback;
  }

  private devicesList(): TemplateResult {
    const hass = this.hass;
    const pd = this.pd!;
    const setup = this.setup!;
    const live = isLive(this.period);
    const labels = periodLabels(hass, this.period);
    const rows = setup.devices
      .map((d) => ({
        d,
        kwh: pd.devices[d.stat] ?? 0,
        name: d.name || (this.hass?.states[d.stat]?.attributes.friendly_name as string) || d.stat,
        w: d.rate && this.hass ? powerW(this.hass, d.rate) : null,
      }))
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, 8);
    const measured = rows.reduce((a, r) => a + r.kwh, 0);
    const restKwh =
      (pd.totals.home ?? 0) - setup.devices.reduce((a, d) => a + (pd.devices[d.stat] ?? 0), 0);
    const list: { name: string; kwh: number; w: number | null; rest?: boolean }[] = [...rows];
    if (pd.totals.home !== undefined && restKwh > 0.05)
      list.push({ name: ft(hass, 'not_measured'), kwh: restKwh, w: null, rest: true });
    const mx = Math.max(0.01, ...list.map((r) => r.kwh));
    void measured;
    return html`${this.head('plug', 'home', ft(hass, 'sec_devices'), html`<span class="sm">${live ? ft(hass, 'now_today') : labels.name}</span>`)}
      <div class="dev">
        ${list.map(
          (r) =>
            html`<span class="nm">${r.name}</span>
              <span class="vv"
                >${live && r.w !== null ? html`${r.w > IDLE_W ? kwText(hass, r.w) : ft(hass, 'off')}<small>${fkwh(hass, r.kwh)} kWh</small>` : html`${fkwh(hass, r.kwh)} kWh`}</span
              >
              <div class="bar" style="--a:${this.col(r.rest ? 'rest' : 'home')}">
                <i style="width:${Math.round((r.kwh / mx) * 100)}%"></i>
              </div>`,
        )}
      </div>`;
  }

  private meterSection(k: 'gas' | 'water'): TemplateResult {
    const hass = this.hass;
    const pd = this.pd!;
    const values = pd.series[k] ?? [];
    const u = this.unit(
      k === 'gas' ? this.setup!.gas[0] : this.setup!.water[0],
      k === 'gas' ? 'm³' : 'L',
    );
    const tot = pd.totals[k] ?? 0;
    const prev = pd.prev[k];
    const q = (v: number) => fnum(hass, v, v >= 100 ? 0 : 1);
    const right = html`<span class="big">${q(tot)}<small>${u}</small></span>`;
    const p = this.period;
    const chart = this.chartFrame(k, (_w, h, bw) => {
      const bot = h - 16;
      const sc = (bot - 4) / (Math.max(0.01, ...values) * 1.1);
      return [
        svg`<g style="filter:drop-shadow(0 0 4px rgba(${this.col(k)},.7))">${this.bars(values, bw, bot, sc, k)}${this.slots(bw, bot)}</g>`,
      ];
    });
    const cmp =
      prev === undefined
        ? ''
        : p.range === 'day' && p.offset === 0
          ? ft(hass, 'yesterday_v', { v: `${q(prev)} ${u}` })
          : ft(hass, 'before', { v: `${q(prev)} ${u}` });
    return html`${this.head(k, k, ft(hass, k), right)}
      <div class="ch small" data-size=${k}>${chart}</div>
      ${cmp || !pd.full ? html`<div class="lg"><span>${cmp || '\u00a0'}</span></div>` : nothing}`;
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        height: auto;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        overflow: hidden;
        min-width: 0;
      }
      .card.narrow {
        gap: 8px;
        padding: 12px;
        border-radius: 22px;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }
      .narrow .top {
        gap: 12px;
      }
      .txt {
        min-width: 0;
        flex: 1;
      }
      .title {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .narrow .title {
        font-size: 17px;
      }
      .sub {
        font-size: 14px;
      }
      .narrow .sub {
        font-size: 12px;
      }
      .ellip {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      button {
        all: unset;
        box-sizing: border-box;
        cursor: pointer;
        font-family: var(--glow-font);
      }
      button:focus-visible,
      .tap:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: 2px;
      }
      .dp {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      .card > .dp {
        justify-content: space-between;
        min-width: 0;
      }
      .narrow .dp {
        gap: 6px;
      }
      .seg,
      .dnav {
        display: flex;
        align-items: center;
        padding: 3px;
        border-radius: 999px;
        background: var(--glow-inset);
      }
      .seg button {
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        color: var(--glow-muted);
        white-space: nowrap;
      }
      .narrow .seg button {
        padding: 6px 8px;
        font-size: 12px;
      }
      .seg button[aria-pressed='true'] {
        background: var(--glow-pop-solid);
        color: var(--glow-text);
        box-shadow:
          0 1px 4px rgba(0, 0, 0, 0.12),
          0 0 0 1px rgba(var(--glow-accent), 0.35);
      }
      .dnav {
        gap: 2px;
      }
      .dnav button {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: var(--glow-text);
      }
      .narrow .dnav button {
        width: 26px;
        height: 26px;
      }
      .dnav button[disabled],
      .cal button[disabled] {
        opacity: 0.3;
        cursor: default;
      }
      .dnav svg,
      .cn svg {
        width: 15px;
        height: 15px;
      }
      .dw {
        position: relative;
        flex: none;
      }
      .card > .dp {
        position: relative;
      }
      .narrow .dw {
        position: static;
      }
      .narrow .cal {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        width: min(292px, 100%);
      }
      .dnav button.dd {
        width: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
        padding: 0 8px;
        min-width: 124px;
      }
      .dnav button.dd svg {
        width: 14px;
        height: 14px;
        color: var(--glow-muted);
      }
      .dnav button.dd[aria-expanded='true'] {
        background: var(--glow-pop-solid);
        box-shadow:
          0 1px 4px rgba(0, 0, 0, 0.12),
          0 0 0 1px rgba(var(--glow-accent), 0.35);
      }
      .narrow .dnav button.dd {
        font-size: 12px;
        min-width: 0;
        padding: 0 6px;
        gap: 5px;
      }
      /* calendar of the date picker (#193) */
      .cal {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 6;
        width: 292px;
        box-sizing: border-box;
        padding: 12px;
        border-radius: 22px;
        background: var(--glow-pop-solid);
        border: 1px solid var(--glow-line);
        box-shadow:
          0 18px 40px rgba(0, 0, 0, 0.35),
          0 0 0 1px rgba(var(--glow-accent), 0.18);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .cn {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cn button {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--glow-inset);
      }
      .cn button.up {
        width: auto;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px 0 12px;
      }
      .cn .up svg {
        width: 12px;
        height: 12px;
        color: var(--glow-muted);
      }
      .ct2 {
        font-size: 14px;
        font-weight: 800;
      }
      .cg {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cr {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        align-items: center;
        justify-items: center;
        width: 100%;
      }
      .cg.week .cr {
        grid-template-columns: 34px repeat(7, 1fr);
      }
      .chd {
        font-size: 11px;
        font-weight: 700;
        color: var(--glow-muted);
        height: 24px;
      }
      .c {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .c.off {
        color: var(--glow-muted);
        opacity: 0.55;
      }
      .c.now {
        box-shadow: inset 0 0 0 1.5px rgba(var(--glow-accent), 0.7);
      }
      button.c.on,
      .cgb .c.on {
        background: rgb(var(--glow-accent));
        color: #fff;
        opacity: 1;
        box-shadow: 0 0 14px rgba(var(--glow-accent), 0.5);
      }
      .kw {
        font-size: 11px;
        font-weight: 700;
        color: var(--glow-muted);
        font-variant-numeric: tabular-nums;
      }
      .wk {
        border-radius: 999px;
      }
      .wk.on {
        background: rgba(var(--glow-accent), 0.28);
        box-shadow: inset 0 0 0 1px rgba(var(--glow-accent), 0.6);
      }
      .wk.on .c.off {
        opacity: 1;
        color: inherit;
      }
      .cg.cgb {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .cgb .c {
        width: auto;
        height: 40px;
        background: var(--glow-inset);
      }
      .cnow {
        align-self: center;
        padding: 7px 16px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        background: var(--glow-inset);
      }
      @media (hover: hover) {
        button.c:not([disabled]):not(.on):hover,
        .wk:not([disabled]):not(.on):hover,
        .cn button:not([disabled]):hover,
        .cnow:not([disabled]):hover {
          background: rgba(var(--glow-accent), 0.18);
        }
      }
      /* line plan */
      .plan {
        position: relative;
        flex: 1 1 auto;
        border-radius: 22px;
        overflow: hidden;
        background-image: radial-gradient(circle, var(--glow-line) 1.2px, transparent 1.6px);
        background-size: 24px 24px;
        background-position: 12px 12px;
      }
      .wires {
        position: absolute;
        inset: 0;
        overflow: visible;
      }
      .flow {
        stroke-dashoffset: var(--o, 0px);
        animation: flow var(--sp, 1.4s) linear infinite;
      }
      @keyframes flow {
        from {
          stroke-dashoffset: var(--o, 0px);
        }
        to {
          stroke-dashoffset: calc(var(--o, 0px) - var(--len, 12px));
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flow {
          animation: none;
        }
      }
      /* nodes: glass capsules sitting on the lines */
      .cap {
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 16px 7px 9px;
        border-radius: 999px;
        white-space: nowrap;
        background:
          linear-gradient(rgba(var(--a), 0.1), rgba(var(--a), 0.03)), var(--glow-pop-solid);
        border: 1px solid rgba(var(--a), 0.45);
        box-shadow:
          0 0 20px -6px rgba(var(--a), 0.85),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .cap.tap {
        cursor: pointer;
      }
      .ci {
        flex: none;
        width: 36px;
        height: 36px;
      }
      .ci svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .ct {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
      }
      .t1 {
        font-size: 11px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .t1 b {
        font-weight: 800;
        color: color-mix(in srgb, rgb(var(--a)) 70%, var(--glow-text));
      }
      .t2 {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .t2 small,
      .big small {
        font-size: 12px;
        color: var(--glow-muted);
        font-weight: 600;
        margin-left: 3px;
        letter-spacing: 0;
      }
      .narrow .cap {
        gap: 6px;
        padding: 6px 13px 6px 7px;
      }
      .narrow .ci {
        width: 30px;
        height: 30px;
      }
      .narrow .t2 {
        font-size: 18px;
      }
      /* key figures */
      .kpis {
        display: grid;
        grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr));
        gap: 12px;
      }
      .narrow .kpis {
        gap: 8px;
      }
      /* placeholders while a period loads (#203) */
      .wait {
        animation: wait 1.2s ease-in-out infinite alternate;
      }
      .kpis.wait .v {
        opacity: 0.5;
      }
      /* the card keeps its height while loading; the spinner sits in its middle */
      .loading .plan {
        flex: 1 1 auto;
      }
      /* centred in the card; in a card taller than the screen, centred in what is in view */
      .spin {
        height: 100%;
        max-height: calc(100vh - 220px);
        max-height: calc(100dvh - 220px);
        min-height: 160px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        font-size: 13px;
        font-weight: 700;
        color: var(--glow-muted);
      }
      .spin svg {
        width: 48px;
        height: 48px;
        animation: spin 0.9s linear infinite;
      }
      .spin circle {
        fill: none;
        stroke-width: 4;
      }
      .spin .ring {
        stroke: var(--glow-inset);
      }
      .spin .arc {
        stroke: var(--glow-text);
        stroke-linecap: round;
        stroke-dasharray: 34 120;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes wait {
        from {
          opacity: 0.45;
        }
        to {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .wait,
        .spin svg {
          animation: none;
        }
      }
      /* an odd last tile fills the row instead of leaving a gap */
      .narrow .kpi:last-child:nth-child(odd) {
        grid-column: 1 / -1;
      }
      .kpi {
        border-radius: 18px;
        background: var(--glow-inset);
        padding: 14px 16px;
        min-width: 0;
      }
      .narrow .kpi {
        padding: 10px 12px;
        border-radius: 14px;
      }
      .kpi .k {
        font-size: 12px;
        font-weight: 700;
        color: var(--glow-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kpi .v {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .narrow .kpi .v {
        font-size: 15px;
      }
      /* areas */
      .secs {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 12px;
      }
      .narrow .secs {
        gap: 8px;
      }
      .sec {
        border-radius: 20px;
        background: var(--glow-inset);
        padding: 16px;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .narrow .sec {
        grid-column: span 12 !important;
        border-radius: 16px;
        padding: 12px;
      }
      .sh {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        min-width: 0;
      }
      .sh svg {
        width: 20px;
        height: 20px;
        flex: none;
        overflow: visible;
      }
      .st {
        font-size: 14px;
        font-weight: 800;
        white-space: nowrap;
      }
      .sm {
        margin-left: auto;
        font-size: 12px;
        font-weight: 700;
        color: var(--glow-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .big {
        margin-left: auto;
        font-size: 18px;
        font-weight: 800;
        white-space: nowrap;
      }
      .ch {
        position: relative;
        flex: 1;
        min-height: 150px;
      }
      .narrow .ch {
        min-height: 130px;
      }
      .ch.small {
        min-height: 92px;
      }
      .bars {
        position: absolute;
        inset: 0;
        overflow: visible;
      }
      .slot {
        fill: var(--glow-line);
      }
      .base {
        stroke: var(--glow-line);
        stroke-width: 1.5;
      }
      .band {
        fill: var(--glow-line);
      }
      .band-line {
        fill: none;
        stroke: var(--glow-muted);
        stroke-dasharray: 3 4;
        opacity: 0.6;
      }
      .ax {
        position: absolute;
        bottom: -4px;
        transform: translateX(-50%);
        font-size: 10px;
        font-weight: 700;
        color: var(--glow-muted);
      }
      .lg {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        font-size: 11px;
        font-weight: 700;
        color: var(--glow-muted);
        margin-top: 12px;
      }
      .lg i {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 3px;
        margin-right: 5px;
        vertical-align: -1px;
      }
      .lg i.usual {
        background: var(--glow-line);
        border: 1px dashed var(--glow-muted);
        box-sizing: border-box;
      }
      .lg i.fc {
        width: 14px;
        height: 0;
        border-radius: 0;
        border-top: 2px dashed rgb(var(--a));
        vertical-align: 3px;
      }
      .tbl {
        display: flex;
        flex-direction: column;
        font-size: 13px;
      }
      .tbl .r {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 7px 0;
        border-bottom: 1px solid var(--glow-line);
      }
      .tbl.cost .r {
        grid-template-columns: 18px minmax(0, 1fr) auto 64px;
      }
      .tbl .r:last-child {
        border-bottom: 0;
      }
      .tbl .sum {
        font-weight: 800;
      }
      .tbl span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 700;
      }
      .tbl b,
      .tbl em {
        font-weight: 800;
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        font-style: normal;
      }
      .tbl em {
        color: var(--glow-muted);
        font-weight: 700;
      }
      .tbl .d {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        background: rgb(var(--a));
        box-shadow: 0 0 6px rgba(var(--a), 0.8);
      }
      .dev {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 4px 10px;
        align-items: center;
        font-size: 13px;
      }
      .dev .nm {
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dev .vv {
        font-weight: 800;
        white-space: nowrap;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .dev .vv small {
        color: var(--glow-muted);
        font-weight: 700;
        margin-left: 6px;
      }
      .dev .bar {
        grid-column: 1 / 3;
        height: 6px;
        border-radius: 99px;
        background: var(--glow-line);
        margin: -2px 0 8px;
        position: relative;
        overflow: hidden;
      }
      .dev .bar i {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 99px;
        background: rgb(var(--a));
        box-shadow: 0 0 8px rgba(var(--a), 0.9);
      }
    `,
  ];
}

// ---------- helpers ----------

function kwText(hass: HomeAssistant | undefined, w: number): string {
  const a = Math.abs(w) / 1000;
  return `${fnum(hass, a, a >= 1 ? 1 : 2)} kW`;
}

function currency(hass: HomeAssistant | undefined): string {
  const c = (hass as { config?: { currency?: string } } | undefined)?.config?.currency;
  if (!c || c === 'EUR') return '€';
  return c;
}

/** The CO₂ signal entity (fossil fuel share in %), as HA's energy dashboard finds it. */
function findCo2(hass: HomeAssistant): string | undefined {
  for (const e of Object.values(hass.entities ?? {})) {
    if (e?.platform !== 'co2signal') continue;
    const st = hass.states[e.entity_id];
    if (st?.attributes.unit_of_measurement === '%') return e.entity_id;
  }
  return undefined;
}

function chev(d: string) {
  return html`<svg viewBox="0 0 24 24">
    <path
      d=${d}
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    ></path>
  </svg>`;
}

function legendItem(c: string, label: string) {
  return html`<span><i style="background:rgb(${c})"></i>${label}</span>`;
}

/** Neon tube icon: outline in the flow colour with a bright core; the battery fills with SoC. */
function neonIcon(k: NodeKind, c: string, dark: boolean, soc: number | null) {
  const core = dark ? '#fff' : `color-mix(in srgb, rgb(${c}) 40%, #fff)`;
  const d = ICON[k];
  const h = soc !== null ? 15.2 * Math.min(1, Math.max(0, soc / 100)) : 0;
  return html`<svg
    viewBox="-2 -2 28 28"
    style="filter:drop-shadow(0 0 2px rgba(${c},1)) drop-shadow(0 0 7px rgba(${c},.7))"
  >
    ${k === 'bat' && h > 0 ? svg`<rect x="7.7" y=${20.3 - h} width="8.6" height=${h} rx=".8" fill="rgba(${c},.75)"/>` : nothing}
    <path
      d=${d}
      fill="none"
      stroke="rgb(${c})"
      stroke-width="1.1"
      stroke-linejoin="round"
      stroke-opacity=".9"
    ></path>
    <path d=${d} fill="none" stroke=${core} stroke-width=".35" stroke-linejoin="round"></path>
  </svg>`;
}

function smallIcon(name: string, c: string, dark: boolean) {
  const d = ICON[name];
  const core = dark ? '#fff' : `color-mix(in srgb, rgb(${c}) 40%, #fff)`;
  return html`<svg
    viewBox="0 0 24 24"
    style="filter:drop-shadow(0 0 2px rgba(${c},1)) drop-shadow(0 0 5px rgba(${c},.6))"
  >
    <path
      d=${d}
      fill="none"
      stroke="rgb(${c})"
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
    ></path>
    <path
      d=${d}
      fill="none"
      stroke=${core}
      stroke-width=".5"
      stroke-linejoin="round"
      stroke-linecap="round"
    ></path>
  </svg>`;
}

function sectionLabel(s: FlowSection): string {
  const lang = document.querySelector('home-assistant') as { hass?: { language?: string } } | null;
  const hass = {
    language: lang?.hass?.language ?? document.documentElement.lang ?? 'en',
  } as HomeAssistant;
  const key: Record<FlowSection, FlowKey> = {
    usage: 'sec_usage',
    sources: 'sec_sources',
    solar: 'sec_solar',
    devices: 'sec_devices',
    gas: 'gas',
    water: 'water',
  };
  return ft(hass, key[s]);
}

function rangeLabel(r: Range): string {
  const lang = document.querySelector('home-assistant') as { hass?: { language?: string } } | null;
  const hass = {
    language: lang?.hass?.language ?? document.documentElement.lang ?? 'en',
  } as HomeAssistant;
  const key: Record<Range, FlowKey> = {
    day: 'range_day',
    week: 'range_week',
    month: 'range_month',
    year: 'range_year',
  };
  return ft(hass, key[r]);
}

registerCard(
  {
    type: 'glowcard-energy-flow',
    name: 'GlowCard Energiefluss',
    description:
      'Wohin der Strom fließt: Netz, Solar, Akku und Haus als Leitungsplan, dazu Bereiche wie im Energie-Dashboard (Tag, Woche, Monat, Jahr).',
  },
  GlowFlowCard,
);

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
}

type Kind = NodeKind | 'gas' | 'water' | 'rest';

/** Colours of the flows (dark / light), like the energy card and the mockup. */
const COLORS: Record<Kind, { dark: Rgb; light: Rgb }> = {
  grid: { dark: [96, 165, 250], light: [59, 130, 246] },
  solar: { dark: [251, 191, 36], light: [245, 158, 11] },
  bat: { dark: [52, 211, 153], light: [16, 185, 129] },
  home: { dark: [255, 200, 120], light: [245, 166, 35] },
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

const CHEV_L = 'M15 5l-7 7 7 7';
const CHEV_R = 'M9 5l7 7-7 7';

/** Width below which the plan turns vertical and the date picker gets its own row. */
const NARROW = 560;
/** Width from which sections sit side by side in the 12 column layout. */
const WIDE = 900;
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
  loadedAt: number;
}

interface PlanNode {
  k: NodeKind;
  x: number;
  y: number;
  lab: 'r' | 'l' | 'b';
  t1: string;
  t2: TemplateResult | string;
  t3: string;
  entity?: string;
}

interface PlanSeg {
  a: [number, number];
  b: [number, number];
  k: NodeKind;
  /** Signed value: + = from a to b. */
  v: number;
  idle: boolean;
}

interface PlanTag {
  x: number;
  y: number;
  k: NodeKind;
  text: string;
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
    return [c.grid, c.solar, c.battery, c.battery_power, c.home, ...rates].filter(
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

  /** Main source for the tint: live from the power values, else from the period totals. */
  private get main(): NodeKind {
    if (this.live) {
      const m = flows(this.now).main;
      return m === 'bat' ? 'bat' : m;
    }
    const t = this.pd?.totals;
    if (!t) return this.pv ? 'solar' : 'grid';
    const used = (t.solar ?? 0) - (t.export ?? 0) - (t.charge ?? 0);
    const cand: [NodeKind, number][] = [
      ['grid', t.import ?? 0],
      ['solar', used],
      ['bat', t.discharge ?? 0],
    ];
    return cand.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  protected get accent(): Rgb {
    return COLORS[this.main][this.dark ? 'dark' : 'light'];
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
    const [cur, prev] = await Promise.all([this.changes(ids, p), this.changes(ids, prevP)]);
    const series = flowSeries(p, toBuckets(p, cur), setup);
    const prevTotals = totals(flowSeries(prevP, toBuckets(prevP, prev), setup));
    const b = toBuckets(p, cur);
    const devices: Record<string, number> = {};
    for (const d of setup.devices) {
      if (d.stat in b) devices[d.stat] = b[d.stat].reduce((x, y) => x + y, 0);
    }
    const pd: PeriodData = {
      series,
      totals: totals(series),
      prev: prevTotals,
      devices,
      loadedAt: Date.now(),
    };
    // "Usual" for the grid-only chart: same hour of the last 14 days / same weekday of 8 weeks.
    if (!this.pv && setup.import.length && (p.range === 'day' || p.range === 'week')) {
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
      pd.usual = usualBand(hist);
    }
    if (this.co2Id && setup.import.length && this.hass.callWS) {
      try {
        const fossil = await this.hass.callWS<Record<string, number>>({
          type: 'energy/fossil_energy_consumption',
          start_time: p.start.toISOString(),
          end_time: p.end.toISOString(),
          energy_statistic_ids: setup.import,
          co2_statistic_id: this.co2Id,
          period: p.stat === 'month' ? 'month' : p.stat === 'day' ? 'day' : 'hour',
        });
        pd.fossil = Object.values(fossil ?? {}).reduce((a, v) => a + (v ?? 0), 0);
      } catch {
        /* CO₂ signal is optional */
      }
    }
    const next = new Map(this.data);
    next.set(key, pd);
    this.data = next;
    if (this.loadingKey === key) this.loadingKey = undefined;
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
    if (Math.abs(h - this.cardH) > 0.5) this.cardH = h;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resize?.disconnect();
    this.resize = undefined;
    this.observed.clear();
  }

  // ---------- interaction ----------

  private setRange(r: Range): void {
    if (r === this.range && this.offset === 0) return;
    this.range = r;
    this.offset = 0;
  }

  private step(d: number): void {
    if (d > 0 && this.offset >= 0) return;
    this.offset += d;
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
      class="glass active card ${this.narrow ? 'narrow' : ''}"
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
    if (this.narrow) return this.pv ? 560 : 300;
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
    if (!t) return this.setup ? ft(hass, 'loading') : '';
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
      <div class="dnav">
        <button aria-label=${ft(hass, 'back')} @click=${() => this.step(-1)}>
          ${chev(CHEV_L)}
        </button>
        <span class="dd">${label}</span>
        <button
          aria-label=${ft(hass, 'next')}
          ?disabled=${this.offset >= 0}
          @click=${() => this.step(1)}
        >
          ${chev(CHEV_R)}
        </button>
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
    const f: PlanFlows | undefined = live
      ? livePlan(n)
      : t
        ? periodPlan(t, this.hasSolar, this.hasBattery)
        : undefined;
    if (!f) return nothing;
    const idle = (v: number | undefined) =>
      v === undefined || Math.abs(v) < (live ? IDLE_W : IDLE_KWH);
    const val = (v: number) => (live ? kwText(hass, v) : `${fkwh(hass, Math.abs(v))} kWh`);
    const big = (v: number) =>
      live
        ? html`${fnum(hass, Math.abs(v) / 1000, Math.abs(v) >= 1000 ? 1 : 2)}<small>kW</small>`
        : html`${fkwh(hass, Math.abs(v))}<small>kWh</small>`;
    const solarToday = t?.solar;
    const fc = forecastHours(this.forecast, this.setup.forecast, this.period);
    const fcTotal = fc?.reduce((a, b) => a + b, 0);
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
    const solarT3 = live
      ? fcTotal !== undefined && solarToday !== undefined
        ? this.narrow
          ? ft(hass, 'forecast_short', { f: `${fkwh(hass, fcTotal)} kWh` })
          : `${fkwh(hass, solarToday)} ${ft(hass, 'of_forecast', { f: `${fkwh(hass, fcTotal)} kWh` })}`
        : solarToday !== undefined
          ? `${ft(hass, 'production')} · ${fkwh(hass, solarToday)} kWh`
          : ft(hass, 'production')
      : ft(hass, 'produced');
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
    const tags: PlanTag[] = [];
    const R = narrow ? 28 : 37; // icon half size + gap
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
    const seg = (a: [number, number], b: [number, number], k: NodeKind, v: number | undefined) =>
      segs.push({ a, b, k, v: v ?? 0, idle: idle(v) });
    const tag = (
      x: number,
      y: number,
      k: NodeKind,
      v: number | undefined,
      fwd: string,
      back: string,
    ) => {
      if (idle(v)) return;
      const txt = val(v!);
      tags.push({ x, y, k, text: v! >= 0 ? `${txt} ${fwd}` : `${back} ${txt}` });
    };
    const lineK: NodeKind = this.pv ? (this.main === 'grid' ? 'grid' : this.main) : 'grid';
    const batName =
      soc !== null && live ? `${ft(hass, 'battery')} ${fnum(hass, soc, 0)} %` : ft(hass, 'battery');
    const homeT3 = live ? ft(hass, 'consumption') : ft(hass, 'consumed');
    const s = this.hasSolar;
    const b = this.hasBattery;

    if (!narrow) {
      const yb = h / 2;
      const off = Math.min(160, h * 0.32);
      // the grid and home labels sit outside their icons: keep room for "12.345 kWh"
      const room = R + 140;
      const xn = Math.max(room, s || b ? w * 0.12 : w * 0.2);
      const xh = Math.min(w - room, s || b ? w * 0.86 : w * 0.8);
      const xs = s && b ? w * 0.38 : w * 0.5;
      const xk = s && b ? w * 0.62 : w * 0.5;
      node('grid', xn, yb, 'l', ft(hass, 'grid'), gridV, gridT3, c.grid);
      node('home', xh, yb, 'r', ft(hass, 'home'), f.home, homeT3, c.home);
      if (s) node('solar', xs, yb - off, 'r', ft(hass, 'solar'), f.solar ?? 0, solarT3, c.solar);
      if (b)
        node('bat', xk, yb + off, 'r', batName, f.bat ?? 0, batT3, c.battery_power ?? c.battery);
      const j1 = s ? xs : b ? xk : xh - R;
      seg([xn + R, yb], [j1, yb], s || b ? lineK : 'grid', f.grid);
      tag((xn + R + j1) / 2, yb, s || b ? lineK : 'grid', f.grid, '→', '←');
      if (s) {
        seg([xs, yb - off + R], [xs, yb], 'solar', f.solar);
        tag(xs, yb - off / 2, 'solar', f.solar, '↓', '↑');
      }
      if (s && b) {
        seg([xs, yb], [xk, yb], lineK, f.middle);
        tag((xs + xk) / 2, yb, lineK, f.middle, '→', '←');
      }
      if (b) {
        seg([xk, yb], [xk, yb + off - R], 'bat', f.bat);
        tag(xk, yb + off / 2, 'bat', f.bat, '↓', '↑');
      }
      if (s || b) {
        const last = b ? xk : xs;
        seg([last, yb], [xh - R, yb], lineK, f.home);
        tag((last + xh - R) / 2, yb, lineK, f.home, '→', '←');
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
      seg([xb, yn + R], [xb, j1], s || b ? lineK : 'grid', f.grid);
      tag(xb, s || b ? (yn + j1) / 2 + 10 : h / 2, s || b ? lineK : 'grid', f.grid, '↓', '↑');
      if (s) seg([xl + R, ys], [xb, ys], 'solar', f.solar);
      if (s && b) {
        seg([xb, ys], [xb, yk], lineK, f.middle);
        tag(xb, (ys + yk) / 2, lineK, f.middle, '↓', '↑');
      }
      if (b) seg([xb, yk], [xr - R, yk], 'bat', f.bat);
      if (s || b) {
        const last = b ? yk : ys;
        seg([xb, last], [xb, yh - R], lineK, f.home);
        tag(xb, (last + yh) / 2, lineK, f.home, '↓', '↑');
      }
    }

    // junction dots where segments meet
    // (grey when nothing flows through them, #181)
    const ends = new Map<string, { n: number; live: boolean }>();
    for (const sg of segs)
      for (const pt of [sg.a, sg.b]) {
        const e = ends.get(pt.join()) ?? { n: 0, live: false };
        ends.set(pt.join(), { n: e.n + 1, live: e.live || !sg.idle });
      }
    const dots = [...ends.entries()]
      .filter(([, e]) => e.n > 1)
      .map(([k, e]) => ({ p: k.split(',').map(Number), live: e.live }));
    const lc = this.col(lineK);
    const idleC = this.col('rest');
    const maxV = live ? 5000 : 20;
    return html`<svg class="wires" width=${w} height=${h} viewBox="0 0 ${w} ${h}">
        ${segs.map((sg) => {
          // idle connections share one neutral grey instead of their source colour
          const c = sg.idle ? idleC : this.col(sg.k);
          const [a, z] = sg.v < 0 ? [sg.b, sg.a] : [sg.a, sg.b];
          const d = `M${a[0]},${a[1]} L${z[0]},${z[1]}`;
          const mag = Math.min(1, Math.abs(sg.v) / maxV);
          return svg`<path d=${d} stroke="rgba(${c},${sg.idle ? 0.1 : 0.18})" stroke-width=${sg.idle ? 4 : 4 + mag * 8} stroke-linecap="round" fill="none"/>
            <path d=${d} stroke="rgba(${c},${sg.idle ? 0.4 : 0.55})" stroke-width="1.5" fill="none"/>
            ${
              sg.idle
                ? nothing
                : svg`<path d=${d} class="flow" stroke="rgb(${c})" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" fill="none" style="--sp:${(1.9 - mag * 1.2).toFixed(2)}s;filter:drop-shadow(0 0 4px rgba(${c},1))"/>`
            }`;
        })}
        ${dots.map(({ p: [x, y], live: on }) =>
          on
            ? svg`<circle cx=${x} cy=${y} r="5" fill="rgb(${lc})" style="filter:drop-shadow(0 0 5px rgba(${lc},1))"/>`
            : svg`<circle cx=${x} cy=${y} r="4" fill="rgba(${idleC},.7)"/>`,
        )}
      </svg>
      ${nodes.map((nd) => this.node(nd, R, nd.k === 'bat' ? soc : null))}
      ${tags.map(
        (tg) =>
          html`<div class="tag" style="left:${tg.x}px;top:${tg.y}px;--a:${this.col(tg.k)}">
            ${tg.text}
          </div>`,
      )}`;
  }

  private node(nd: PlanNode, R: number, soc: number | null): TemplateResult {
    const c = this.col(nd.k);
    const click = () => this.moreInfo(nd.entity);
    const txt = html`<div class="t1">${nd.t1}</div>
      <div class="t2">${nd.t2}</div>
      ${
        // left labels grow towards the card edge: one fact per line there
        nd.lab === 'l'
          ? nd.t3.split(' · ').map((l) => html`<div class="t3">${l}</div>`)
          : html`<div class="t3">${nd.t3}</div>`
      }`;
    const pos =
      nd.lab === 'b'
        ? `left:${nd.x}px;top:${nd.y + R + 4}px;transform:translate(-50%,0);text-align:center`
        : nd.lab === 'l'
          ? `left:${nd.x - R - 8}px;top:${nd.y}px;transform:translate(-100%,-50%);text-align:right`
          : `left:${nd.x + R + 8}px;top:${nd.y}px;transform:translate(0,-50%)`;
    const can = !!(nd.entity && this.hass?.states[nd.entity]);
    return html`<div
        class="neon ${can ? 'tap' : ''}"
        style="left:${nd.x}px;top:${nd.y}px"
        role=${can ? 'button' : nothing}
        tabindex=${can ? 0 : nothing}
        aria-label=${nd.t1}
        @click=${click}
        @keydown=${this.onKey(click)}
      >
        ${neonIcon(nd.k, c, this.dark, soc)}
      </div>
      <div class="node" style=${pos}>${txt}</div>`;
  }

  // ---------- key figures ----------

  private kpis(): TemplateResult | typeof nothing {
    const t = this.pd?.totals;
    if (!t) return nothing;
    const hass = this.hass;
    const today = this.range === 'day' && this.offset === 0;
    const lab = (k: FlowKey) =>
      today ? `${ft(hass, k)} ${ft(hass, 'today_suffix')}` : ft(hass, k);
    const cur = currency(hass);
    const list: [string, string][] = [];
    const cost = t.energyCost;
    if (!this.pv) {
      if (t.home !== undefined) list.push([lab('kpi_consumption'), `${fkwh(hass, t.home)} kWh`]);
      if (t.import !== undefined) list.push([lab('kpi_import'), `${fkwh(hass, t.import)} kWh`]);
      const lc = lowCarbon(t.import, this.pd?.fossil);
      if (lc !== undefined) list.push([ft(hass, 'kpi_low_carbon'), `${fnum(hass, lc, 0)} %`]);
    } else {
      const ss = selfSufficiency(t);
      const sc = selfConsumption(t);
      const gn = gridNeutrality(t);
      if (ss !== undefined) list.push([ft(hass, 'kpi_self_sufficiency'), `${fnum(hass, ss, 0)} %`]);
      if (sc !== undefined) list.push([ft(hass, 'kpi_self_consumption'), `${fnum(hass, sc, 0)} %`]);
      if (gn !== undefined)
        list.push([
          ft(hass, 'kpi_neutrality'),
          `${gn > 0 ? '+' : gn < 0 ? '−' : ''}${fkwh(hass, Math.abs(gn))} kWh`,
        ]);
    }
    if (cost !== undefined) list.push([lab('kpi_cost'), fmoney(hass, cost, cur)]);
    if (!list.length) return nothing;
    return html`<div class="kpis" style="--n:${this.narrow ? 2 : list.length}">
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
    if (!pd || !setup) return nothing;
    const want = this.config?.sections ?? SECTIONS;
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
      const top = 6;
      const bot = h * 0.66;
      const up = used.map((v, i) => v + dis[i] + imp[i]);
      const down = exp.map((v, i) => v + chg[i]);
      const mx = Math.max(0.01, ...up, ...down.map((v) => v / 0.4)) * 1.1;
      const sc = (bot - top) / mx;
      const fill = filledBuckets(this.period);
      const live = isLive(this.period);
      const out: TemplateResult[] = [];
      for (let i = 0; i < fill; i++) {
        const a = live && i === fill - 1 ? 0.45 : 0.85;
        let y = bot;
        for (const [v, k] of [
          [used[i], 'solar'],
          [dis[i], 'bat'],
          [imp[i], 'grid'],
        ] as [number, Kind][]) {
          if (v <= 0) continue;
          const hh = v * sc;
          out.push(
            svg`<rect x=${i * bw + bw * 0.18} y=${y - hh} width=${bw * 0.64} height=${hh} rx=${Math.min(3, bw * 0.2)} fill="rgba(${this.col(k)},${a})"/>`,
          );
          y -= hh + 1;
        }
        let y2 = bot + 2;
        for (const [v, k] of [
          [exp[i], 'solar'],
          [chg[i], 'bat'],
        ] as [number, Kind][]) {
          if (v <= 0) continue;
          const hh = v * sc * 0.4;
          out.push(
            svg`<rect x=${i * bw + bw * 0.18} y=${y2} width=${bw * 0.64} height=${hh} rx=${Math.min(3, bw * 0.2)} fill="rgba(${this.col(k)},.45)"/>`,
          );
          y2 += hh + 1;
        }
      }
      out.push(svg`<line x1="0" x2=${w} y1=${bot + 1} y2=${bot + 1} class="base"/>`);
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
    const fc = forecastHours(this.forecast, this.setup!.forecast, p);
    const tot = pd.totals.solar ?? 0;
    const fcTotal = fc?.reduce((a, b) => a + b, 0);
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
      ${cmp ? html`<div class="lg"><span>${cmp}</span></div>` : nothing}`;
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
      .dnav button[disabled] {
        opacity: 0.3;
        cursor: default;
      }
      .dnav svg {
        width: 15px;
        height: 15px;
      }
      .dd {
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
        padding: 0 4px;
        min-width: 112px;
        text-align: center;
      }
      .narrow .dd {
        font-size: 12px;
        min-width: 0;
        padding: 0 2px;
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
        animation: flow var(--sp, 1.4s) linear infinite;
      }
      @keyframes flow {
        to {
          stroke-dashoffset: -12;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flow {
          animation: none;
        }
      }
      .neon {
        position: absolute;
        width: 66px;
        height: 66px;
        transform: translate(-50%, -50%);
        z-index: 2;
      }
      .narrow .neon {
        width: 50px;
        height: 50px;
      }
      .neon.tap {
        cursor: pointer;
      }
      .neon svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .node {
        position: absolute;
        z-index: 2;
        white-space: nowrap;
      }
      .t1 {
        font-size: 15px;
        font-weight: 800;
      }
      .t2 {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .t2 small,
      .big small {
        font-size: 12px;
        color: var(--glow-muted);
        font-weight: 600;
        margin-left: 3px;
        letter-spacing: 0;
      }
      .t3 {
        font-size: 12px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .narrow .t1 {
        font-size: 14px;
      }
      .narrow .t2 {
        font-size: 22px;
      }
      .narrow .t3 {
        font-size: 11px;
      }
      .tag {
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 2;
        padding: 4px 10px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
        background: var(--glow-pop-solid);
        border: 1px solid rgba(var(--a), 0.5);
        color: color-mix(in srgb, rgb(var(--a)) 75%, var(--glow-text));
        box-shadow: 0 0 14px -4px rgba(var(--a), 0.8);
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

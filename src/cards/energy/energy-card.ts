import { css, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import type { ActionConfig } from '../../core/action';
import {
  fetchHistory,
  fetchStatChange,
  fetchStatistics,
  type StatePoint,
  type StatRow,
} from '../../core/history';
import { registerCard } from '../../core/register';
import {
  actionsField,
  configForm,
  editorLabel,
  fontField,
  lookSection,
  nameIconFields,
  type FormSchema,
  type GestureSpec,
} from '../../core/editor';
import type { Rgb } from '../../core/color';
import { formatPct, numberState } from '../status/status-logic';
import {
  IDLE_W,
  baseLoad,
  currency,
  dashboardTariff,
  dayFraction,
  deviceId,
  energyKwh,
  et,
  flows,
  kw,
  kwValue,
  kwh,
  money,
  priceSource,
  priceValue,
  range,
  readDevices,
  readNow,
  ringAngle,
  ringArc,
  ringPoint,
  usualByHour,
  verdict,
  type DeviceNow,
  type EnergyInfo,
  type EnergyPrefs,
  type Tariff,
  type EnergyEntities,
  type EnergyNow,
  type Flows,
  type Source,
  type Usual,
  type Verdict,
} from './energy-logic';

export interface EnergyCardConfig extends GlowCardConfig, EnergyEntities {}

/** Accent per main source (Lastring board: house warm for grid, solar yellow, battery green). */
const ACCENT: Record<Source, { dark: Rgb; light: Rgb }> = {
  grid: { dark: [255, 214, 140], light: [245, 158, 11] },
  solar: { dark: [251, 191, 36], light: [245, 158, 11] },
  bat: { dark: [52, 211, 153], light: [16, 185, 129] },
};

const ENERGY_GESTURES: GestureSpec = {
  modes: {
    tap: ['popup', 'more-info', 'navigate', 'url', 'perform-action', 'none'],
    hold: ['more-info', 'popup', 'navigate', 'url', 'perform-action', 'none'],
  },
  defaults: { tap: 'popup', hold: 'more-info' },
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface Gauge {
  home: number;
  base: number | null;
  usual: Usual | null;
  verdict: Verdict | null;
  devices: DeviceNow[];
  flows: Flows;
  maxKw: number;
}

/**
 * Energy card "Lastring" (board GlowLastring): what is the home drawing right now and is
 * that normal? A glowing ring shows the consumption, coloured by device, over the usual
 * range for this hour (from HA's long-term statistics) with a base load mark. A thin outer
 * ring shows where the power comes from. Works with only a consumption or grid sensor;
 * devices, today's kWh, price, solar and battery extend the same card.
 */
export class GlowEnergyCard extends GlowCardBase<EnergyCardConfig> {
  protected defaultTapAction: ActionConfig = { action: 'popup' };
  protected defaultHoldAction: ActionConfig = { action: 'more-info' };

  private usual: (Usual | null)[] = [];
  private base: number | null = null;
  private stats: StatRow[] = [];
  private yesterdayAtNow?: number;
  private yesterdayTotal?: number;
  /** Grid tariff from HA's energy dashboard (null = not loaded / not available). */
  private tariff: Tariff | null = null;
  private dashCostToday?: number;
  private dashCostYesterday?: number;
  private costLoadedAt = 0;
  private loadedAt = 0;
  private loading = false;

  static getConfigForm() {
    const power: FormSchema['selector'] = { entity: { domain: ['sensor'], device_class: 'power' } };
    const energy: FormSchema['selector'] = {
      entity: { domain: ['sensor'], device_class: 'energy' },
    };
    const grid = (...schema: FormSchema[]): FormSchema => ({ name: '', type: 'grid', schema });
    const section = (title: string, icon: string, ...schema: FormSchema[]): FormSchema => ({
      name: '',
      type: 'expandable',
      title,
      icon,
      schema,
    });
    return configForm(
      [
        grid({ name: 'home', selector: power }, { name: 'grid', selector: power }),
        {
          name: 'devices',
          selector: { entity: { domain: ['sensor'], device_class: 'power', multiple: true } },
        },
        section(
          'costs_section',
          'mdi:currency-eur',
          grid(
            { name: 'energy_today', selector: energy },
            { name: 'cost_today', selector: { entity: { domain: ['sensor'] } } },
            { name: 'price', selector: { entity: { domain: ['sensor', 'input_number'] } } },
            {
              name: 'fixed_price',
              selector: { number: { min: 0, step: 0.01, mode: 'box' } },
              visible: (data) => !data.price,
            },
          ),
        ),
        section(
          'solar_section',
          'mdi:solar-power-variant-outline',
          grid(
            { name: 'solar', selector: power },
            { name: 'solar_energy', selector: energy },
            {
              name: 'battery',
              selector: { entity: { domain: ['sensor'], device_class: 'battery' } },
            },
            { name: 'battery_power', selector: power },
            { name: 'grid_import_energy', selector: energy },
            { name: 'grid_export_energy', selector: energy },
          ),
        ),
        lookSection(
          nameIconFields,
          grid(fontField, {
            name: 'max_power',
            default: 3,
            selector: { number: { min: 0.5, max: 50, step: 0.5, mode: 'box' } },
          }),
        ),
        actionsField,
      ],
      {
        home: 'home_helper',
        grid: 'grid_energy_helper',
        devices: 'devices_helper',
        energy_today: 'energy_today_helper',
        cost_today: 'cost_today_helper',
        price: 'fixed_price_helper',
        fixed_price: 'fixed_price_helper',
        solar: 'solar_helper',
        max_power: 'max_power_helper',
      },
      (config) => {
        const list = config.devices;
        if (Array.isArray(list) && list.some((d) => typeof d !== 'string')) {
          throw new Error(editorLabel('devices_yaml_only'));
        }
      },
      (config) => {
        // A number in `price` is the fixed price field in the editor.
        if (typeof config.price !== 'number') return config;
        const { price, ...rest } = config;
        return { ...rest, fixed_price: price };
      },
    );
  }

  /** Tap opens the GlowCard popup, hold the consumption sensor's more info. */
  static gestureSpec(): GestureSpec {
    return ENERGY_GESTURES;
  }

  static getStubConfig(): Partial<EnergyCardConfig> {
    return {};
  }

  protected validateConfig(config: EnergyCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.devices !== undefined && !Array.isArray(config.devices)) {
      throw new Error('"devices" must be a list');
    }
  }

  private get hasSources(): boolean {
    return !!(this.config?.solar || this.config?.battery || this.config?.battery_power);
  }

  getCardSize(): number {
    return this.hasSources ? 5 : 4;
  }

  getGridOptions() {
    return this.gridOptions(12, this.hasSources ? 5 : 4, 6);
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    if (!c) return [];
    return [
      c.home,
      c.grid,
      c.solar,
      c.battery,
      c.battery_power,
      c.energy_today,
      typeof c.price === 'string' ? c.price : undefined,
      c.cost_today,
      c.solar_energy,
      c.grid_import_energy,
      c.grid_export_energy,
      ...(c.devices ?? []).map(deviceId),
    ].filter((x): x is string => !!x);
  }

  /** "more-info" on hold opens the consumption sensor (or the first configured one). */
  protected async runAction(kind: 'tap' | 'hold'): Promise<void> {
    if (this.config && !this.config.entity) {
      this.config = { ...this.config, entity: this.watchedEntities()[0] };
    }
    await super.runAction(kind);
  }

  protected get isActive(): boolean {
    return true;
  }

  protected get icon(): string {
    return this.config?.icon ?? 'mdi:home-lightning-bolt';
  }

  private get now(): EnergyNow {
    return this.hass && this.config
      ? readNow(this.hass, this.config)
      : { home: null, solar: null, battery: null, soc: null, grid: null };
  }

  protected get accent(): Rgb {
    const main = flows(this.now).main;
    return ACCENT[main][this.dark ? 'dark' : 'light'];
  }

  // ---------- data loading ----------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this.hass && this.config && Date.now() - this.loadedAt > 30 * 60_000) void this.load();
    else if (this.tariff?.costIds.length && Date.now() - this.costLoadedAt > 5 * 60_000)
      void this.loadCost();
  }

  /** Statistic used for "usual" and base load: the consumption sensor, or the grid without PV. */
  private get statId(): string | undefined {
    const c = this.config;
    if (!c) return undefined;
    if (c.home) return c.home;
    if (c.grid && !c.solar && !c.battery_power) return c.grid;
    return undefined;
  }

  private async load(): Promise<void> {
    const h = this.hass;
    const c = this.config;
    if (!h || !c || this.loading) return;
    this.loading = true;
    this.loadedAt = Date.now();
    try {
      const now = new Date();
      const id = this.statId;
      if (id) {
        const res = await fetchStatistics(h, [id], new Date(now.getTime() - 14 * DAY), now);
        const unit = String(h.states[id]?.attributes.unit_of_measurement ?? 'W');
        const k = unit === 'kW' ? 1000 : 1;
        this.stats = (res[id] ?? []).map((r) => ({
          ...r,
          mean: r.mean === null ? null : Math.max(0, r.mean * k),
          min: r.min === null ? null : Math.max(0, r.min * k),
        }));
        this.usual = usualByHour(this.stats.filter((r) => r.start < startOfDay(now)));
        this.base = baseLoad(this.stats);
      }
      await this.loadTariff();
      await this.loadCost();
      if (c.energy_today) {
        const midnight = startOfDay(now);
        const hist = await fetchHistory(h, [c.energy_today], new Date(midnight - DAY), now);
        const pts = hist[c.energy_today] ?? [];
        this.yesterdayAtNow = lastBefore(pts, now.getTime() - DAY);
        this.yesterdayTotal = lastBefore(pts, midnight);
      }
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  /** Price and cost statistics as set up in HA's energy dashboard (works for dynamic prices). */
  private async loadTariff(): Promise<void> {
    const h = this.hass;
    if (!h?.callWS || this.tariff) return;
    try {
      const [prefs, info] = await Promise.all([
        h.callWS<EnergyPrefs>({ type: 'energy/get_prefs' }),
        h.callWS<EnergyInfo>({ type: 'energy/info' }).catch(() => null),
      ]);
      this.tariff = dashboardTariff(prefs, info);
    } catch {
      this.tariff = { costIds: [] }; // no energy dashboard set up
    }
  }

  /** Today's and yesterday's cost from the dashboard's cost statistics. */
  private async loadCost(): Promise<void> {
    const h = this.hass;
    const ids = this.tariff?.costIds ?? [];
    this.costLoadedAt = Date.now();
    if (!h || !ids.length) return;
    const now = new Date();
    const midnight = new Date(startOfDay(now));
    const [today, yesterday] = await Promise.all([
      fetchStatChange(h, ids, midnight, now),
      fetchStatChange(h, ids, new Date(midnight.getTime() - DAY), midnight),
    ]);
    const sum = (r: Record<string, number>) =>
      Object.keys(r).length ? Object.values(r).reduce((a, b) => a + b, 0) : undefined;
    this.dashCostToday = sum(today);
    this.dashCostYesterday = sum(yesterday);
    this.requestUpdate();
  }

  /** Price per kWh: config, else the energy dashboard. */
  private get priceSrc(): string | number | undefined {
    return this.config ? priceSource(this.config, this.tariff?.price) : undefined;
  }

  // ---------- model ----------

  private gauge(): Gauge {
    const n = this.now;
    const home = Math.max(0, n.home ?? 0);
    const usual = this.usual[new Date().getHours()] ?? null;
    return {
      home,
      base: this.base,
      usual,
      verdict: verdict(home, usual),
      devices: this.hass
        ? readDevices(this.hass, this.config?.devices, n.home, et(this.hass, 'rest'))
        : [],
      flows: flows(n),
      maxKw: this.config?.max_power ?? 3,
    };
  }

  private timeNow(): string {
    return new Intl.DateTimeFormat(this.hass?.language ?? 'de', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  }

  /** Factual status line: supply shares, plus surplus; grid only: position vs usual range. */
  private subtitle(g: Gauge): string {
    const h = this.hass;
    const f = g.flows;
    const shares =
      g.home > IDLE_W
        ? (['solar', 'bat', 'grid'] as Source[])
            .filter((s) => f.toHome[s] > IDLE_W)
            .map((s) => `${Math.round((f.toHome[s] / g.home) * 100)} % ${sourceName(h, s)}`)
        : [];
    if (this.hasSources) {
      const extra: string[] = [];
      if (f.toBattery > IDLE_W) extra.push(`${et(h, 'battery_charge')} ${kw(h, f.toBattery)}`);
      else if (f.toGrid > IDLE_W) extra.push(`${et(h, 'export')} ${kw(h, f.toGrid)}`);
      return [...shares, ...extra].join(' · ') || et(h, 'house_consumption');
    }
    const src = `100 % ${et(h, 'grid_short')}`;
    if (!g.verdict) return `${et(h, 'house_consumption')} · ${src}`;
    return `${et(h, `${g.verdict}_range` as 'normal_range')} · ${src}`;
  }

  // ---------- ring ----------

  private ring(g: Gauge, W: number, big = false): TemplateResult {
    const h = this.hass;
    const H = W * 0.86;
    const cx = W / 2;
    const cy = W * 0.5;
    const rIn = W * 0.33;
    const wIn = W * 0.09;
    const rOut = W * 0.435;
    const wOut = W * 0.03;
    const ang = (w: number) => ringAngle(w, g.maxKw);
    const parts: TemplateResult[] = [];
    parts.push(
      svg`<path class="trk" d=${ringArc(cx, cy, rIn, -125, 125)} stroke-width=${wIn}></path>`,
    );
    parts.push(
      svg`<path class="trk2" d=${ringArc(cx, cy, rOut, -125, 125)} stroke-width=${wOut}></path>`,
    );
    if (g.usual) {
      parts.push(
        svg`<path class="band" d=${ringArc(cx, cy, rIn, ang(g.usual.lo), ang(g.usual.hi))} stroke-width=${wIn + W * 0.05}></path>`,
      );
    }
    for (const t of [500, 1000, 2000]) {
      if (t / 1000 >= g.maxKw) continue;
      const a = ang(t);
      const [x0, y0] = ringPoint(cx, cy, rIn - wIn * 0.5 - 3, a);
      const [x1, y1] = ringPoint(cx, cy, rIn - wIn * 0.5 - (big ? 8 : 6), a);
      parts.push(svg`<line class="tick" x1=${x0} y1=${y0} x2=${x1} y2=${y1}></line>`);
    }
    // consumption, stacked by device (or one segment in the house colour)
    const segs = g.devices.length
      ? g.devices.map((d) => ({ w: d.watts, cls: `seg c${d.slot}` }))
      : [{ w: g.home, cls: 'seg home' }];
    let acc = 0;
    segs.forEach((s, i) => {
      if (s.w <= 0) return;
      const a = ang(acc);
      const b = ang(acc + s.w);
      parts.push(
        svg`<path class=${s.cls} d=${ringArc(cx, cy, rIn, a + (i ? 0.9 : 0), b)} stroke-width=${wIn} stroke-linecap=${i === 0 ? 'round' : 'butt'}></path>`,
      );
      acc += s.w;
    });
    if (g.base !== null) {
      const a = ang(g.base);
      const [x0, y0] = ringPoint(cx, cy, rIn - wIn * 0.5 - 1, a);
      const [x1, y1] = ringPoint(cx, cy, rIn + wIn * 0.5 + 1, a);
      parts.push(svg`<line class="basemk" x1=${x0} y1=${y0} x2=${x1} y2=${y1}></line>`);
    }
    {
      const [x, y] = ringPoint(cx, cy, rIn, ang(g.home));
      parts.push(svg`<circle class="ecap" cx=${x} cy=${y} r=${wIn * 0.5}></circle>`);
    }
    // outer ring: sources of the consumption, then the solar surplus by destination
    let a2 = 0;
    for (const s of ['solar', 'bat', 'grid'] as Source[]) {
      const w = g.flows.toHome[s];
      if (w <= IDLE_W) continue;
      parts.push(
        svg`<path class="src ${s}" d=${ringArc(cx, cy, rOut, ang(a2), ang(a2 + w) - 0.6)} stroke-width=${wOut}></path>`,
      );
      a2 += w;
    }
    const surplus: [string, number][] = [
      ['bat', g.flows.toBattery],
      ['grid', g.flows.toGrid],
    ];
    let hasSurplus = false;
    for (const [k, w] of surplus) {
      if (w <= IDLE_W) continue;
      parts.push(
        svg`<path class="sur ${k}" d=${ringArc(cx, cy, rOut, ang(a2) + 0.6, ang(a2 + w))} stroke-width=${wOut}></path>`,
      );
      a2 += w;
      hasSurplus = true;
    }
    if (hasSurplus) {
      const [x, y] = ringPoint(cx, cy, rOut, ang(a2));
      parts.push(svg`<circle class="surcap" cx=${x} cy=${y} r=${wOut * 0.9}></circle>`);
    }
    // centre text + verdict pill
    const fs1 = big ? 12 : 9.5;
    const fs2 = big ? 19 : 13.5;
    if (g.usual) {
      parts.push(
        svg`<text class="cl" x=${cx} y=${cy - fs2 * 0.55} text-anchor="middle" font-size=${fs1}>${et(h, 'usual_now')}</text>`,
        svg`<text class="cv" x=${cx} y=${cy + fs2 * 0.5} text-anchor="middle" font-size=${fs2}>${range(h, g.usual)}</text>`,
        svg`<text class="cl" x=${cx} y=${cy + fs2 * 0.5 + fs1 * 1.35} text-anchor="middle" font-size=${fs1}>kW</text>`,
      );
    } else if (g.base !== null) {
      parts.push(
        svg`<text class="cl" x=${cx} y=${cy - fs2 * 0.55} text-anchor="middle" font-size=${fs1}>${et(h, 'base_load')}</text>`,
        svg`<text class="cv" x=${cx} y=${cy + fs2 * 0.5} text-anchor="middle" font-size=${fs2}>${kwValue(h, g.base)}</text>`,
        svg`<text class="cl" x=${cx} y=${cy + fs2 * 0.5 + fs1 * 1.35} text-anchor="middle" font-size=${fs1}>kW</text>`,
      );
    }
    if (g.verdict) {
      const pw = big ? 92 : 70;
      const ph = big ? 24 : 18;
      const py = H - ph - (big ? 4 : 1);
      parts.push(
        svg`<rect class="pill ${g.verdict}" x=${cx - pw / 2} y=${py} width=${pw} height=${ph} rx=${ph / 2}></rect>`,
        svg`<text class="pillt ${g.verdict}" x=${cx} y=${py + ph * 0.68} text-anchor="middle" font-size=${big ? 12 : 10}>${et(h, g.verdict)}</text>`,
      );
    }
    return html`<svg
      class="gauge"
      viewBox="0 0 ${W} ${H.toFixed(1)}"
      style="width:${W}px;height:${H.toFixed(1)}px"
      aria-hidden="true"
    >
      ${parts}
    </svg>`;
  }

  // ---------- card parts ----------

  private consList(g: Gauge): TemplateResult {
    const h = this.hass;
    if (!g.devices.length) {
      const rows: [string, string][] = [];
      const today =
        this.hass && this.config ? energyKwh(this.hass, this.config.energy_today) : null;
      if (today !== null) rows.push([et(h, 'today'), kwh(h, today)]);
      if (this.yesterdayAtNow !== undefined)
        rows.push([et(h, 'yesterday_so_far'), kwh(h, this.yesterdayAtNow)]);
      if (g.base !== null) rows.push([et(h, 'base_load'), kw(h, g.base)]);
      return html`<ul class="facts">
        ${rows.map(([l, v]) => html`<li><span>${l}</span><b>${v}</b></li>`)}
      </ul>`;
    }
    const measured = g.devices.filter((d) => d.slot).length;
    const list = g.devices.slice(0, 4);
    return html`<div class="rh">
        <span>${et(h, 'who_draws')}</span><span>${measured} ${et(h, 'devices')}</span>
      </div>
      <ul class="cons">
        ${list.map(
          (d) =>
            html`<li>
              <i class="dot c${d.slot}"></i><span class="cn">${d.name}</span
              ><span class="cvv">${kwValue(h, d.watts)}<small> kW</small></span>
              <b class="bar"
                ><b
                  class="c${d.slot}"
                  style="width:${g.home ? Math.min(100, (d.watts / g.home) * 100).toFixed(0) : 0}%"
                ></b
              ></b>
            </li>`,
        )}
      </ul>`;
  }

  private sources(): TemplateResult | typeof nothing {
    if (!this.hasSources || !this.hass || !this.config) return nothing;
    const h = this.hass;
    const c = this.config;
    const n = this.now;
    const items: TemplateResult[] = [];
    if (c.solar) {
      const on = (n.solar ?? 0) > IDLE_W;
      items.push(
        this.chip(
          'solar',
          on,
          on ? 'mdi:white-balance-sunny' : 'mdi:weather-night',
          kw(h, n.solar ?? 0),
          et(h, 'solar_produced'),
        ),
      );
    }
    if (c.battery || c.battery_power) {
      const bat = n.battery ?? 0;
      const on = Math.abs(bat) > IDLE_W;
      const sub =
        bat > IDLE_W
          ? `${et(h, 'charging')} ${kw(h, bat, 1)}`
          : bat < -IDLE_W
            ? `${et(h, 'delivering')} ${kw(h, bat, 1)}`
            : et(h, 'idle');
      items.push(
        this.chip(
          'bat',
          on,
          'mdi:battery-high',
          n.soc !== null ? formatPct(h, n.soc) : kw(h, bat),
          sub,
        ),
      );
    }
    if (c.grid) {
      const g = n.grid ?? 0;
      const on = Math.abs(g) > IDLE_W;
      items.push(
        this.chip(
          'grid',
          on,
          'mdi:transmission-tower',
          g < -IDLE_W ? `↑ ${kw(h, g)}` : g > IDLE_W ? `↓ ${kw(h, g)}` : '0 kW',
          g < -IDLE_W ? et(h, 'export') : g > IDLE_W ? et(h, 'import') : et(h, 'grid_short'),
        ),
      );
    }
    return html`<div class="srcs n${items.length}">${items}</div>`;
  }

  private chip(k: Source, on: boolean, icon: string, value: string, sub: string): TemplateResult {
    return html`<div class="sc ${k} ${on ? 'on' : ''}">
      <span class="mini ${k}"><ha-icon .icon=${icon}></ha-icon></span>
      <span class="st"><b>${value}</b><small>${sub}</small></span>
    </div>`;
  }

  private costToday(): number | null {
    const h = this.hass;
    const c = this.config;
    if (!h || !c) return null;
    const direct = numberState(h, c.cost_today);
    if (direct !== null) return direct;
    // Without own price settings: the dashboard's cost statistics (right for dynamic prices).
    if (c.price === undefined && c.fixed_price === undefined && this.dashCostToday !== undefined)
      return this.dashCostToday;
    const price = priceValue(h, this.priceSrc);
    const kwhToday = this.hasSources
      ? energyKwh(h, c.grid_import_energy)
      : energyKwh(h, c.energy_today);
    return price !== null && kwhToday !== null ? price * kwhToday : null;
  }

  /** Yesterday's total cost: dashboard statistics, else yesterday's kWh × price (no PV). */
  private costYesterday(price: number | null): number | null {
    const c = this.config;
    if (!c) return null;
    if (
      c.price === undefined &&
      c.fixed_price === undefined &&
      this.dashCostYesterday !== undefined
    )
      return this.dashCostYesterday;
    if (price !== null && this.yesterdayTotal !== undefined && !this.hasSources)
      return price * this.yesterdayTotal;
    return null;
  }

  private foot(): TemplateResult | typeof nothing {
    const h = this.hass;
    const c = this.config;
    if (!h || !c) return nothing;
    const items: [string, string, string?][] = [];
    const today = energyKwh(h, c.energy_today);
    if (this.hasSources) {
      if (today !== null) items.push([et(h, 'consumed'), kwh(h, today)]);
      const s = energyKwh(h, c.solar_energy);
      if (s !== null) items.push([et(h, 'solar'), kwh(h, s)]);
      const imp = energyKwh(h, c.grid_import_energy);
      if (imp !== null) items.push([et(h, 'import'), kwh(h, imp)]);
      const exp = energyKwh(h, c.grid_export_energy);
      if (exp !== null) items.push([et(h, 'export'), kwh(h, exp)]);
    } else {
      if (today !== null) items.push([et(h, 'today'), kwh(h, today)]);
      if (this.yesterdayAtNow !== undefined && c.devices?.length) {
        const diff =
          today !== null && this.yesterdayAtNow > 0
            ? (today / this.yesterdayAtNow - 1) * 100
            : null;
        items.push([
          et(h, 'yesterday_so_far'),
          kwh(h, this.yesterdayAtNow),
          diff === null ? undefined : `${diff >= 0 ? '+' : '−'}${Math.abs(Math.round(diff))} %`,
        ]);
      }
      const cost = this.costToday();
      if (cost !== null)
        items.push([et(h, 'cost_today'), money(h, cost, currency(h, this.priceSrc))]);
    }
    if (!items.length) return nothing;
    return html`<div class="foot n${items.length}">
      ${items.map(
        ([l, v, d]) =>
          html`<div>
            <small>${l}</small
            ><b
              >${v}${d ? html`<em class=${d.startsWith('+') ? 'up' : 'down'}>${d}</em>` : nothing}</b
            >
          </div>`,
      )}
    </div>`;
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    void this.runAction('tap');
  };

  render() {
    if (!this.config) return nothing;
    const h = this.hass;
    const g = this.gauge();
    const compact = this.gridSize !== 'normal';
    return html`<div
      class="glass card acc-${g.flows.main} ${this.hasSources ? 'tall' : ''}"
      role="button"
      tabindex="0"
      aria-label=${`${this.config.name ?? et(h, 'energy')}, ${kw(h, g.home)}, ${this.subtitle(g)}`}
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointercancel=${this.press.cancel}
      @pointermove=${this.press.move}
      @keydown=${this.onKey}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <div class="head">
        <glowcard-orb
          .icon=${this.icon}
          active
          ?dark-icon=${this.darkIcon}
          .size=${compact ? 36 : 46}
        ></glowcard-orb>
        <div class="titles">
          <span class="title">${this.config.name ?? et(h, 'energy')}</span>
          <span class="subt">${this.subtitle(g)}</span>
        </div>
        <div class="hero">
          <span class="hv">${kwValue(h, g.home)}<small> kW</small></span>
          <span class="hl">${et(h, 'consumption_caps')}</span>
        </div>
      </div>
      <div class="body">
        ${this.ring(g, compact ? 116 : 128)}
        <div class="right">${this.consList(g)}</div>
      </div>
      ${this.sources()} ${this.foot()}
    </div>`;
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        height: 100%;
      }
    `,
    tokens(),
    gaugeStyles(),
    css`
      .card {
        height: 248px;
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        background: linear-gradient(
          160deg,
          rgba(var(--glow-accent), var(--e-tint)),
          var(--e-lit-base) 58%
        );
        border-color: rgba(var(--glow-accent), var(--e-lit-border));
        box-shadow: 0 22px 56px -16px rgba(var(--glow-accent), 0.5);
      }
      .card.tall {
        height: 312px;
      }
      .card:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: 3px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
      }
      .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .title {
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .subt {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--glow-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hero {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
        align-self: flex-start;
      }
      .hv {
        font-size: 30px;
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
        white-space: nowrap;
        color: var(--e-acc-t);
      }
      .hv small {
        font-size: 16px;
        letter-spacing: 0;
        font-weight: 700;
      }
      .hl {
        font-size: 10.5px;
        font-weight: 700;
        color: var(--glow-muted);
        letter-spacing: 0.06em;
        margin-top: 3px;
      }
      .body {
        display: flex;
        gap: 16px;
        align-items: center;
        height: 110px;
      }
      .gauge {
        display: block;
        flex-shrink: 0;
        overflow: visible;
      }
      .right {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .rh {
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        font-weight: 700;
        color: var(--glow-muted);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .rh span + span {
        text-transform: none;
        letter-spacing: 0;
        font-weight: 600;
        color: var(--e-faint);
      }
      .cons,
      .facts {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .cons li {
        display: grid;
        grid-template-columns: 10px 1fr auto;
        column-gap: 7px;
        row-gap: 2px;
        align-items: center;
        font-size: 13px;
        font-weight: 700;
      }
      .cn {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cvv {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cvv small {
        font-weight: 600;
        color: var(--glow-muted);
        font-size: 11px;
      }
      .cons .bar {
        grid-column: 2 / 4;
        height: 3px;
        border-radius: 2px;
        background: var(--glow-track);
        display: block;
        overflow: hidden;
      }
      .cons .bar b {
        display: block;
        height: 100%;
        border-radius: 2px;
      }
      .facts {
        gap: 8px;
      }
      .facts li {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .facts b {
        color: var(--glow-text);
        font-weight: 800;
      }
      .srcs {
        display: grid;
        gap: 8px;
        height: 48px;
        flex-shrink: 0;
      }
      .srcs.n1 {
        grid-template-columns: 1fr;
      }
      .srcs.n2 {
        grid-template-columns: 1fr 1fr;
      }
      .srcs.n3 {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr);
      }
      .sc {
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 16px;
        background: var(--glow-inset);
        padding: 0 10px;
        min-width: 0;
      }
      .srcs.n3 .sc {
        padding: 0 8px;
        gap: 6px;
      }
      .st {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.15;
      }
      .st b {
        font-size: 14.5px;
        font-weight: 800;
        white-space: nowrap;
        letter-spacing: -0.01em;
      }
      .srcs.n3 .st b {
        font-size: 13.5px;
      }
      .st small {
        font-size: 11px;
        font-weight: 600;
        color: var(--glow-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sc:not(.on) b {
        color: var(--glow-muted);
      }
      .sc.on.solar {
        background: rgba(var(--e-solar-rgb), 0.1);
      }
      .sc.on.grid {
        background: rgba(var(--e-grid-rgb), 0.1);
      }
      .sc.on.bat {
        background: rgba(var(--e-bat-rgb), 0.1);
      }
      .sc.on.solar b {
        color: var(--e-solar-t);
      }
      .sc.on.grid b {
        color: var(--e-grid-t);
      }
      .sc.on.bat b {
        color: var(--e-bat-t);
      }
      .mini {
        width: 24px;
        height: 24px;
        border-radius: 99px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: #fff;
        --mdc-icon-size: 14px;
      }
      .mini ha-icon {
        display: flex;
        --mdc-icon-size: 14px;
      }
      .sc.on .mini.solar {
        background: radial-gradient(circle at 35% 30%, #fff3c4, var(--e-solar) 62%);
        box-shadow: 0 0 10px rgba(var(--e-solar-rgb), 0.55);
        color: #3a2504;
      }
      .sc.on .mini.grid {
        background: radial-gradient(circle at 35% 30%, #dbeafe, var(--e-grid) 62%);
        box-shadow: 0 0 10px rgba(var(--e-grid-rgb), 0.55);
      }
      .sc.on .mini.bat {
        background: radial-gradient(circle at 35% 30%, #d1fae5, var(--e-bat) 62%);
        box-shadow: 0 0 10px rgba(var(--e-bat-rgb), 0.55);
        color: #063d2b;
      }
      .sc:not(.on) .mini {
        background: var(--glow-track);
        color: var(--glow-muted);
      }
      .foot {
        margin-top: auto;
        display: grid;
        border-radius: 16px;
        background: var(--glow-inset);
        padding: 6px 4px;
        height: 44px;
        box-sizing: border-box;
        flex-shrink: 0;
      }
      .foot.n1 {
        grid-template-columns: 1fr;
      }
      .foot.n2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .foot.n3 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .foot.n4 {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .foot div {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 0;
        gap: 1px;
      }
      .foot div + div {
        border-left: 1px solid var(--glow-line);
      }
      .foot small {
        font-size: 10.5px;
        font-weight: 700;
        color: var(--glow-muted);
        white-space: nowrap;
      }
      .foot b {
        font-size: 14px;
        font-weight: 800;
        white-space: nowrap;
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .foot em {
        font-style: normal;
        font-size: 11px;
        font-weight: 700;
      }
      em.up {
        color: var(--e-c1);
      }
      em.down {
        color: var(--e-ok);
      }
      /* phone (compact) */
      @media (max-width: 600px) {
        :host(:not([size='normal'])) .card {
          padding: 12px 14px;
          border-radius: 22px;
          gap: 6px;
        }
        :host(:not([size='normal'])) .title {
          font-size: 14px;
        }
        :host(:not([size='normal'])) .subt {
          font-size: 12px;
        }
        :host(:not([size='normal'])) .hv {
          font-size: 26px;
        }
        :host(:not([size='normal'])) .body {
          height: 102px;
          gap: 10px;
        }
        :host(:not([size='normal'])) .cons li {
          font-size: 12.5px;
        }
        :host(:not([size='normal'])) .cons {
          gap: 2px;
        }
        :host(:not([size='normal'])) .foot b {
          font-size: 13px;
        }
        :host(:not([size='normal'])) .foot small {
          font-size: 10px;
        }
      }
      :host([size='compact']) .card {
        padding: 12px 14px;
        border-radius: 22px;
        gap: 6px;
      }
      :host([size='compact']) .hv {
        font-size: 26px;
      }
      :host([size='compact']) .body {
        height: 102px;
        gap: 10px;
      }
    `,
  ];

  // ---------- popup ----------

  protected popupOpened(): void {
    if (Date.now() - this.loadedAt > 5 * 60_000) void this.load();
  }

  private chart(g: Gauge): TemplateResult | typeof nothing {
    const h = this.hass;
    if (!this.stats.length) return nothing;
    const W = 380;
    const Hc = 132;
    const pl = 6;
    const pr = 34;
    const pt = 10;
    const pb = 18;
    const now = new Date();
    const midnight = startOfDay(now);
    const today = hourly(this.stats, midnight, midnight + DAY);
    const yday = hourly(this.stats, midnight - DAY, midnight);
    const nowH = dayFraction(now) * 24;
    const peak = Math.max(
      g.home,
      ...today.filter((v): v is number => v !== null),
      ...yday.filter((v): v is number => v !== null),
      ...this.usual.map((u) => u?.hi ?? 0),
    );
    const yMax = Math.max(1000, Math.ceil(peak / 500) * 500);
    const X = (hr: number) => pl + (hr / 24) * (W - pl - pr);
    const Y = (w: number) => pt + (1 - Math.max(0, w) / yMax) * (Hc - pt - pb);
    const line = (vals: (number | null)[], upTo = 24) => {
      let d = '';
      vals.forEach((v, i) => {
        if (v === null || i + 0.5 > upTo) return;
        d += `${d ? 'L' : 'M'}${X(i + 0.5).toFixed(1)} ${Y(v).toFixed(1)}`;
      });
      return d;
    };
    const ticks = [0.25, 0.5, 0.75].map((f) => yMax * f);
    const parts: TemplateResult[] = [];
    for (const v of ticks) {
      parts.push(
        svg`<line class="gl" x1=${pl} x2=${W - pr} y1=${Y(v)} y2=${Y(v)}></line>`,
        svg`<text class="ax" x=${W - pr + 5} y=${Y(v) + 3}>${kwValue(h, v, 1)}</text>`,
      );
    }
    parts.push(svg`<line class="gl0" x1=${pl} x2=${W - pr} y1=${Y(0)} y2=${Y(0)}></line>`);
    parts.push(svg`<text class="ax" x=${W - pr + 5} y=${Y(yMax) + 8}>kW</text>`);
    if (this.usual.some((u) => u)) {
      const hi = this.usual.map((u, i) =>
        u ? `${X(i + 0.5).toFixed(1)} ${Y(u.hi).toFixed(1)}` : null,
      );
      const lo = this.usual.map((u, i) =>
        u ? `${X(i + 0.5).toFixed(1)} ${Y(u.lo).toFixed(1)}` : null,
      );
      const top = hi.filter(Boolean);
      const bottom = lo.filter(Boolean).reverse();
      if (top.length > 1) {
        parts.push(svg`<path class="cband" d=${`M${top.join('L')}L${bottom.join('L')}Z`}></path>`);
      }
    }
    if (g.base !== null) {
      parts.push(
        svg`<line class="cbase" x1=${pl} x2=${W - pr} y1=${Y(g.base)} y2=${Y(g.base)}></line>`,
      );
    }
    const yd = line(yday);
    if (yd) parts.push(svg`<path class="cy" d=${yd}></path>`);
    let td = line(today, nowH);
    td = td ? `${td}L${X(nowH).toFixed(1)} ${Y(g.home).toFixed(1)}` : '';
    if (td) {
      const firstX = td.match(/^M([\d.]+)/)?.[1] ?? String(pl);
      parts.push(
        svg`<path class="carea" d=${`${td}L${X(nowH).toFixed(1)} ${Y(0)}L${firstX} ${Y(0)}Z`}></path>`,
        svg`<path class="ct" d=${td}></path>`,
      );
    }
    parts.push(
      svg`<line class="nowl" x1=${X(nowH)} x2=${X(nowH)} y1=${pt} y2=${Y(0)}></line>`,
      svg`<circle class="nowdot" cx=${X(nowH)} cy=${Y(g.home)} r="4.5"></circle>`,
      svg`<text class="nowt" x=${Math.min(X(nowH) + 7, W - pr - 44)} y=${Y(g.home) - 7}>${kw(h, g.home)}</text>`,
    );
    for (const hr of [0, 6, 12, 18, 24]) {
      parts.push(
        svg`<text class="ax" x=${X(hr)} y=${Hc - 4} text-anchor=${hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle'}>${hr === 24 ? `24 ${et(h, 'hour_axis')}` : hr}</text>`,
      );
    }
    return html`<div class="sec">
      <div class="sech">
        <span>${et(h, 'history_today')}</span>
        <span class="leg"
          ><i class="lt"></i>${et(h, 'legend_today')} <i class="ly"></i>${et(h, 'legend_yesterday')}
          ${this.usual.some((u) => u) ? html`<i class="lb"></i>${et(h, 'legend_usual')}` : nothing}
          ${g.base !== null ? html`<i class="lbase"></i>${et(h, 'base_load')}` : nothing}</span
        >
      </div>
      <svg viewBox="0 0 ${W} ${Hc}" class="chart" aria-hidden="true">${parts}</svg>
    </div>`;
  }

  protected renderPopup() {
    const h = this.hass;
    const c = this.config;
    if (!h || !c) return undefined;
    const g = this.gauge();
    const price = priceValue(h, this.priceSrc);
    const cur = currency(h, this.priceSrc);
    const f = g.flows;
    const srcText = this.hasSources ? this.subtitle(g) : `100 % ${et(h, 'grid_short')}`;
    const srcKind: Source = f.main;
    const stats = html`<div class="pstats">
      <div><small>${et(h, 'consumption_now')}</small><b class="hvp">${kw(h, g.home)}</b></div>
      ${
        g.usual
          ? html`<div>
              <small>${et(h, 'usual_this_time')}</small><b>${range(h, g.usual)} kW</b>
            </div>`
          : nothing
      }
      ${
        g.base !== null
          ? html`<div>
              <small>${et(h, 'base_load_long')}</small
              ><b
                >${kw(h, g.base)}
                ${
                  price !== null
                    ? html`<em
                        >≈ ${money(h, (g.base / 1000) * 24 * price, cur)}${et(h, 'per_day')}</em
                      >`
                    : nothing
                }</b
              >
            </div>`
          : nothing
      }
      <div class="srcline ${srcKind}">
        <span class="mini ${srcKind} on"><ha-icon .icon=${SOURCE_ICON[srcKind]}></ha-icon></span
        >${srcText}
      </div>
    </div>`;
    const rows = g.devices.length
      ? html`<div class="sec">
          <div class="sech">
            <span>${et(h, 'who_draws')}</span><span>${et(h, 'sum')} ${kw(h, g.home)}</span>
          </div>
          <ul class="pcons">
            ${g.devices.map(
              (d) =>
                html`<li>
                  <i class="dot c${d.slot}"></i><span class="cn">${d.name}</span
                  ><b class="bar"
                    ><b
                      class="c${d.slot}"
                      style="width:${g.home ? Math.min(100, (d.watts / g.home) * 100).toFixed(0) : 0}%"
                    ></b></b
                  ><span class="cvv">${kw(h, d.watts)}</span
                  ><span class="pct">${g.home ? Math.round((d.watts / g.home) * 100) : 0} %</span>
                </li>`,
            )}
          </ul>
        </div>`
      : nothing;
    const today = energyKwh(h, c.energy_today);
    const cmp: TemplateResult[] = [];
    const ref = this.yesterdayTotal ?? Math.max(today ?? 0, this.yesterdayAtNow ?? 0, 1);
    if (today !== null) {
      cmp.push(
        html`<div>
          <small>${et(h, 'today_so_far')}</small><b>${kwh(h, today)}</b>
          <span class="cbar"
            ><i style="width:${Math.min(100, (today / ref) * 100).toFixed(0)}%"></i
          ></span>
        </div>`,
      );
    }
    if (this.yesterdayAtNow !== undefined) {
      const diff =
        today !== null && this.yesterdayAtNow > 0 ? (today / this.yesterdayAtNow - 1) * 100 : null;
      cmp.push(
        html`<div>
          <small>${et(h, 'yesterday_at')} ${this.timeNow()}</small
          ><b
            >${kwh(h, this.yesterdayAtNow)}
            ${
              diff !== null
                ? html`<em class=${diff >= 0 ? 'up' : 'down'}
                    >${diff >= 0 ? '+' : '−'}${Math.abs(Math.round(diff))} %</em
                  >`
                : nothing
            }</b
          >
          <span class="cbar y"
            ><i style="width:${Math.min(100, (this.yesterdayAtNow / ref) * 100).toFixed(0)}%"></i
          ></span>
        </div>`,
      );
    }
    const cost = this.costToday();
    if (cost !== null) {
      const extra = [
        price !== null ? `${money(h, price, cur)}/kWh` : '',
        this.costYesterday(price) !== null
          ? `${et(h, 'yesterday_total')} ${money(h, this.costYesterday(price)!, cur)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      cmp.push(
        html`<div>
          <small>${et(h, 'cost_today')}</small
          ><b>${money(h, cost, cur)}</b
          >${extra ? html`<span class="unit">${extra}</span>` : nothing}
        </div>`,
      );
    }
    return {
      heading: c.name ?? et(h, 'energy'),
      subtitle: `${et(h, 'house_consumption')} · ${this.timeNow()}`,
      content: html`<div class="epop acc-${g.flows.main}">
        <div class="phero">${this.ring(g, 168, true)} ${stats}</div>
        ${rows} ${this.chart(g)}
        ${cmp.length ? html`<div class="cmp n${cmp.length}">${cmp}</div>` : nothing}
      </div>`,
    };
  }

  protected popupStyles() {
    return [
      tokens(),
      gaugeStyles(),
      css`
        .panel {
          width: min(420px, 100%) !important;
          gap: 14px !important;
        }
        .epop {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .phero {
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .gauge {
          display: block;
          flex-shrink: 0;
          overflow: visible;
        }
        .pstats {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .pstats div {
          display: flex;
          flex-direction: column;
        }
        .pstats small {
          font-size: 11px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .pstats b {
          font-size: 15px;
          font-weight: 800;
          display: flex;
          gap: 6px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .pstats em {
          font-style: normal;
          font-size: 11px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .pstats .hvp {
          font-size: 24px;
          letter-spacing: -0.03em;
          color: var(--e-acc-t);
        }
        .srcline {
          flex-direction: row !important;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
        }
        .srcline.grid {
          color: var(--e-grid-t);
        }
        .srcline.solar {
          color: var(--e-solar-t);
        }
        .srcline.bat {
          color: var(--e-bat-t);
        }
        .mini {
          width: 18px;
          height: 18px;
          border-radius: 99px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #fff;
        }
        .mini ha-icon {
          display: flex;
          --mdc-icon-size: 11px;
        }
        .mini.grid {
          background: radial-gradient(circle at 35% 30%, #dbeafe, var(--e-grid) 62%);
          box-shadow: 0 0 10px rgba(var(--e-grid-rgb), 0.55);
        }
        .mini.solar {
          background: radial-gradient(circle at 35% 30%, #fff3c4, var(--e-solar) 62%);
          color: #3a2504;
        }
        .mini.bat {
          background: radial-gradient(circle at 35% 30%, #d1fae5, var(--e-bat) 62%);
          color: #063d2b;
        }
        .sec {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sech {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          font-size: 13px;
          font-weight: 800;
        }
        .sech span + span {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--glow-muted);
        }
        .pcons {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .pcons li {
          display: grid;
          grid-template-columns: 10px minmax(0, 1.4fr) minmax(0, 1fr) 58px 36px;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          font-weight: 700;
        }
        .pcons .cn {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pcons .cn small {
          font-weight: 600;
          color: var(--glow-muted);
          font-size: 10.5px;
        }
        .pcons .bar {
          height: 6px;
          border-radius: 3px;
          background: var(--glow-track);
          display: block;
          overflow: hidden;
        }
        .pcons .bar b {
          display: block;
          height: 100%;
          border-radius: 3px;
        }
        .pcons .cvv {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .pcons .pct {
          text-align: right;
          color: var(--glow-muted);
          font-weight: 600;
          font-size: 12px;
        }
        .leg {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .leg i {
          display: inline-block;
          width: 12px;
          height: 3px;
          border-radius: 2px;
          margin-left: 6px;
        }
        .leg .lt {
          background: var(--e-home);
        }
        .leg .ly {
          background: none;
          border-top: 2px dashed var(--e-faint);
          height: 0;
        }
        .leg .lbase {
          border-top: 1px dotted var(--e-faint);
          height: 0;
          border-radius: 0;
        }
        .leg .lb {
          background: var(--e-band);
          height: 8px;
          outline: 1px solid rgba(var(--e-home-rgb), 0.35);
        }
        .chart {
          display: block;
          width: 100%;
          height: auto;
          overflow: visible;
        }
        .gl {
          stroke: var(--glow-line);
          stroke-width: 1;
        }
        .gl0 {
          stroke: var(--glow-track);
          stroke-width: 1;
        }
        .ax {
          font-size: 9.5px;
          font-weight: 700;
          fill: var(--e-faint);
        }
        .cband {
          fill: var(--e-band);
          stroke: rgba(var(--e-home-rgb), 0.3);
          stroke-width: 1;
        }
        .cbase {
          stroke: var(--e-faint);
          stroke-width: 1;
          stroke-dasharray: 1 3;
        }
        .cy {
          fill: none;
          stroke: var(--e-faint);
          stroke-width: 1.5;
          stroke-dasharray: 4 4;
        }
        .carea {
          fill: rgba(var(--e-home-rgb), 0.18);
        }
        .ct {
          fill: none;
          stroke: var(--e-home);
          stroke-width: 2.5;
          stroke-linejoin: round;
          stroke-linecap: round;
        }
        :host([dark]) .ct {
          filter: drop-shadow(0 0 5px rgba(255, 214, 140, 0.7));
        }
        .nowl {
          stroke: var(--e-faint);
          stroke-width: 1;
          stroke-dasharray: 2 3;
        }
        .nowdot {
          fill: #fff;
          stroke: var(--e-home);
          stroke-width: 2.5;
        }
        .nowt {
          font-size: 11px;
          font-weight: 800;
          fill: var(--e-home-t);
        }
        .cmp {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .cmp.n2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .cmp.n1 {
          grid-template-columns: 1fr;
        }
        .cmp div {
          background: var(--glow-inset);
          border-radius: 16px;
          padding: 9px 10px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .cmp small {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--glow-muted);
          white-space: nowrap;
        }
        .cmp b {
          font-size: 15px;
          font-weight: 800;
          display: flex;
          gap: 4px;
          align-items: baseline;
          white-space: nowrap;
        }
        .cmp em {
          font-style: normal;
          font-size: 11px;
          font-weight: 700;
        }
        .cmp em.up {
          color: var(--e-c1);
        }
        .cmp em.down {
          color: var(--e-ok);
        }
        .cbar {
          height: 4px;
          border-radius: 2px;
          background: var(--glow-track);
          display: block;
          overflow: hidden;
          margin-top: 2px;
        }
        .cbar i {
          display: block;
          height: 100%;
          background: var(--e-home);
        }
        .cbar.y i {
          background: var(--e-faint);
        }
        .cmp .unit {
          font-size: 10px;
          font-weight: 600;
          color: var(--glow-muted);
          line-height: 1.25;
        }
        @media (max-width: 480px) {
          .pcons li {
            grid-template-columns: 10px 1fr 60px 58px 32px;
          }
          .phero {
            gap: 8px;
          }
        }
      `,
    ];
  }
}

const SOURCE_ICON: Record<Source, string> = {
  grid: 'mdi:transmission-tower',
  solar: 'mdi:white-balance-sunny',
  bat: 'mdi:battery-high',
};

function sourceName(hass: Parameters<typeof et>[0], s: Source): string {
  return s === 'solar'
    ? et(hass, 'solar')
    : s === 'bat'
      ? et(hass, 'battery')
      : et(hass, 'grid_short');
}

/** Board colours (Lastring), set on the card host and in the popup. */
function tokens() {
  return css`
    :host {
      --e-faint: #7a818d;
      --e-tint: 0.2;
      --e-lit-base: rgba(255, 255, 255, 0.74);
      --e-lit-border: 0.45;
      --e-solar: #f59e0b;
      --e-grid: #3b82f6;
      --e-bat: #10b981;
      --e-home: #f59e0b;
      --e-solar-rgb: 245, 158, 11;
      --e-grid-rgb: 59, 130, 246;
      --e-bat-rgb: 16, 185, 129;
      --e-home-rgb: 245, 158, 11;
      --e-solar-t: #b45309;
      --e-grid-t: #1d4ed8;
      --e-bat-t: #047857;
      --e-home-t: #b45309;
      --e-c1: #ea580c;
      --e-c2: #db2777;
      --e-c3: #7c3aed;
      --e-c4: #0284c7;
      --e-c5: #65a30d;
      --e-c0: rgba(20, 22, 26, 0.28);
      --e-ok: #047857;
      --e-ok-bg: rgba(16, 185, 129, 0.14);
      --e-hi: #c2410c;
      --e-hi-bg: rgba(234, 88, 12, 0.14);
      --e-band: rgba(245, 158, 11, 0.16);
      --e-acc-t: var(--e-home-t);
    }
    :host([dark]) {
      --e-faint: rgba(255, 255, 255, 0.4);
      --e-tint: 0.22;
      --e-lit-base: rgba(20, 22, 28, 0.6);
      --e-lit-border: 0.3;
      --e-solar: #fbbf24;
      --e-grid: #60a5fa;
      --e-bat: #34d399;
      --e-home: #ffe7b0;
      --e-solar-rgb: 251, 191, 36;
      --e-grid-rgb: 96, 165, 250;
      --e-bat-rgb: 52, 211, 153;
      --e-home-rgb: 255, 214, 140;
      --e-solar-t: #fde68a;
      --e-grid-t: #93c5fd;
      --e-bat-t: #6ee7b7;
      --e-home-t: #ffe7b0;
      --e-c1: #fb923c;
      --e-c2: #f472b6;
      --e-c3: #a78bfa;
      --e-c4: #38bdf8;
      --e-c5: #a3e635;
      --e-c0: rgba(255, 255, 255, 0.34);
      --e-ok: #6ee7b7;
      --e-ok-bg: rgba(52, 211, 153, 0.16);
      --e-hi: #fdba74;
      --e-hi-bg: rgba(251, 146, 60, 0.18);
      --e-band: rgba(255, 231, 176, 0.14);
    }
    .acc-solar {
      --e-acc-t: var(--e-solar-t);
    }
    .acc-bat {
      --e-acc-t: var(--e-bat-t);
    }
    .acc-grid {
      --e-acc-t: var(--e-home-t);
    }
  `;
}

/** Ring and device colours shared by card and popup. */
function gaugeStyles() {
  return css`
    .gauge path,
    .gauge line {
      fill: none;
    }
    .trk {
      stroke: var(--glow-track);
      stroke-linecap: round;
    }
    .trk2 {
      stroke: var(--glow-track);
      stroke-linecap: round;
      opacity: 0.7;
    }
    .band {
      stroke: var(--e-band);
    }
    .tick {
      stroke: var(--e-faint);
      stroke-width: 1.5;
      stroke-linecap: round;
    }
    .seg.c1 {
      stroke: var(--e-c1);
    }
    .seg.c2 {
      stroke: var(--e-c2);
    }
    .seg.c3 {
      stroke: var(--e-c3);
    }
    .seg.c4 {
      stroke: var(--e-c4);
    }
    .seg.c5 {
      stroke: var(--e-c5);
    }
    .seg.c0 {
      stroke: var(--e-c0);
    }
    .seg.home {
      stroke: var(--e-home);
    }
    :host([dark]) .seg {
      filter: drop-shadow(0 0 4px rgba(251, 146, 60, 0.55));
    }
    .basemk {
      stroke: var(--glow-text);
      stroke-width: 2;
      stroke-linecap: round;
      opacity: 0.55;
    }
    .ecap {
      fill: #fff;
      stroke: rgb(var(--e-home-rgb));
      stroke-width: 2.5;
      filter: drop-shadow(0 0 6px rgba(var(--e-home-rgb), 0.9));
      animation: breathe 2.6s ease-in-out infinite;
    }
    :host(:not([dark])) .ecap {
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.25));
    }
    .src {
      stroke-linecap: round;
    }
    .src.grid {
      stroke: var(--e-grid);
    }
    .src.solar {
      stroke: var(--e-solar);
    }
    .src.bat {
      stroke: var(--e-bat);
    }
    :host([dark]) .src.grid {
      filter: drop-shadow(0 0 4px var(--e-grid));
    }
    :host([dark]) .src.solar {
      filter: drop-shadow(0 0 4px var(--e-solar));
    }
    :host([dark]) .src.bat {
      filter: drop-shadow(0 0 4px var(--e-bat));
    }
    .sur {
      stroke-dasharray: 2 5;
      stroke-linecap: round;
      animation: flow 1.6s linear infinite;
    }
    .sur.grid {
      stroke: var(--e-grid);
    }
    .sur.bat {
      stroke: var(--e-bat);
    }
    .surcap {
      fill: var(--e-solar);
    }
    .cl {
      font-weight: 700;
      fill: var(--glow-muted);
    }
    .cv {
      font-weight: 800;
      fill: var(--glow-text);
      letter-spacing: -0.02em;
    }
    .pill.normal,
    .pill.low {
      fill: var(--e-ok-bg);
    }
    .pill.high {
      fill: var(--e-hi-bg);
    }
    .pillt {
      font-weight: 800;
    }
    .pillt.normal,
    .pillt.low {
      fill: var(--e-ok);
    }
    .pillt.high {
      fill: var(--e-hi);
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 99px;
      display: block;
    }
    .dot.c1,
    .bar .c1 {
      background: var(--e-c1);
    }
    .dot.c2,
    .bar .c2 {
      background: var(--e-c2);
    }
    .dot.c3,
    .bar .c3 {
      background: var(--e-c3);
    }
    .dot.c4,
    .bar .c4 {
      background: var(--e-c4);
    }
    .dot.c5,
    .bar .c5 {
      background: var(--e-c5);
    }
    .dot.c0,
    .bar .c0 {
      background: var(--e-c0);
    }
    :host([dark]) .dot.c1 {
      box-shadow: 0 0 8px var(--e-c1);
    }
    :host([dark]) .dot.c2 {
      box-shadow: 0 0 8px var(--e-c2);
    }
    :host([dark]) .dot.c3 {
      box-shadow: 0 0 8px var(--e-c3);
    }
    :host([dark]) .dot.c4 {
      box-shadow: 0 0 8px var(--e-c4);
    }
    :host([dark]) .dot.c5 {
      box-shadow: 0 0 8px var(--e-c5);
    }
    @keyframes flow {
      to {
        stroke-dashoffset: -14;
      }
    }
    @keyframes breathe {
      0%,
      100% {
        opacity: 0.85;
      }
      50% {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sur,
      .ecap {
        animation: none;
      }
    }
  `;
}

function startOfDay(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.getTime();
}

/** Hourly means (W) for the 24 hours from `from`, null where no statistic exists. */
function hourly(stats: StatRow[], from: number, to: number): (number | null)[] {
  const out: (number | null)[] = Array(24).fill(null);
  for (const s of stats) {
    if (s.start < from || s.start >= to || s.mean === null) continue;
    out[new Date(s.start).getHours()] = s.mean;
  }
  return out;
}

/** Last numeric value before `t`. */
function lastBefore(points: StatePoint[], t: number): number | undefined {
  let best: number | undefined;
  for (const p of [...points].sort((a, b) => a.start - b.start)) {
    if (p.start >= t) break;
    const v = Number(p.state);
    if (Number.isFinite(v)) best = v;
  }
  return best;
}

registerCard(
  {
    type: 'glowcard-energy',
    name: 'GlowCard Energy',
    description:
      'Home consumption as a glowing load ring: usual range, devices, cost; solar and battery optional',
  },
  GlowEnergyCard,
);

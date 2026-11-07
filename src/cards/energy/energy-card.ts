import { css, html, nothing, svg, type TemplateResult } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import type { ActionConfig } from '../../core/action';
import { fetchHistory, numericBuckets, type StatePoint } from '../../core/history';
import { registerCard } from '../../core/register';
import { hexToRgb, type Rgb } from '../../core/color';
import { formatPct } from '../status/status-logic';
import {
  CHART,
  IDLE_W,
  autarky,
  chartMax,
  chartPath,
  dayFraction,
  et,
  flowSpeed,
  kw,
  kwh,
  readNow,
  readToday,
  selfConsumption,
  situation,
  type ChartSeries,
  type EnergyEntities,
  type EnergyNow,
} from './energy-logic';

export interface EnergyCardConfig extends GlowCardConfig, EnergyEntities {}

/** Board colours (GlowEnergyHaus / GlowEnergyPopup). */
const COLORS = {
  dark: {
    solar: '#FBBF24',
    grid: '#60A5FA',
    bat: '#34D399',
    home: '#FFE7B0',
    chartHome: '#E5E7EB',
  },
  light: {
    solar: '#F59E0B',
    grid: '#3B82F6',
    bat: '#10B981',
    home: '#F59E0B',
    chartHome: '#6B7280',
  },
};

/** Flow paths of the house scene (viewBox 420 × 336, straight orthogonal lines). */
const PATHS = {
  solar: 'M290,147 L290,194 L253,194',
  batIn: 'M219,214 L219,228 L172,228 L172,242',
  batOut: 'M172,242 L172,228 L219,228 L219,214',
  home: 'M241,214 L241,228 L286,228 L286,244',
  gridOut: 'M207,194 L70,194',
  gridIn: 'M70,194 L207,194',
};

let uid = 0;

/**
 * Energy card "Haus" from the GlowEnergyHaus board: a modern house with solar modules,
 * inverter, battery, wall socket and pylon; animated flows show where the power goes.
 * The popup (GlowEnergyPopup board) has KPI tiles, today's chart and the day's balance.
 */
export class GlowEnergyCard extends GlowCardBase<EnergyCardConfig> {
  protected defaultColor = 'amber';
  protected defaultTapAction: ActionConfig = { action: 'popup' };
  protected defaultHoldAction: ActionConfig = { action: 'more-info' };
  protected popupStyle: 'tint' | 'glow' = 'glow';

  private gid = `e${++uid}`;
  private series?: ChartSeries;
  private yesterdaySolar?: number;

  static getStubConfig(): Partial<EnergyCardConfig> {
    return {};
  }

  protected validateConfig(config: EnergyCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    if (!c) return [];
    return [
      c.solar,
      c.home,
      c.battery,
      c.battery_power,
      c.grid,
      c.solar_energy,
      c.home_energy,
      c.grid_import_energy,
      c.grid_export_energy,
      c.battery_charge_energy,
      c.battery_discharge_energy,
    ].filter((x): x is string => !!x);
  }

  /** "more-info" on hold opens the solar sensor (or the first configured one). */
  protected async runAction(kind: 'tap' | 'hold'): Promise<void> {
    if (this.config && !this.config.entity) {
      this.config = { ...this.config, entity: this.watchedEntities()[0] };
    }
    await super.runAction(kind);
  }

  protected get isActive(): boolean {
    return true;
  }

  /** Popup orb in the battery green of the board. */
  protected get accent(): Rgb {
    return hexToRgb(this.colors.bat) ?? [52, 211, 153];
  }

  protected get icon(): string {
    return this.config?.icon ?? 'mdi:lightning-bolt';
  }

  private get now(): EnergyNow {
    return this.hass && this.config
      ? readNow(this.hass, this.config)
      : { solar: null, home: null, battery: null, soc: null, grid: null };
  }

  private get colors() {
    return this.dark ? COLORS.dark : COLORS.light;
  }

  private headline(n: EnergyNow): string {
    const s = situation(n);
    return s === 'idle' ? et(this.hass, 'grid_idle') : et(this.hass, s);
  }

  // ---------- card ----------

  private flow(color: string, watts: number | null, d: string): TemplateResult {
    const w = Math.abs(watts ?? 0);
    if (w <= IDLE_W) return svg``;
    return svg`<path class="flow" d=${d} style="stroke:${color};animation-duration:${flowSpeed(w).toFixed(2)}s;filter:drop-shadow(0 0 5px ${color})"></path>`;
  }

  private scene(n: EnergyNow): TemplateResult {
    const c = this.colors;
    const d = this.dark;
    const id = this.gid;
    const pvW = n.solar ?? 0;
    const pv = pvW > IDLE_W;
    const home = n.home ?? 0;
    const bat = n.battery ?? 0;
    const grid = n.grid ?? 0;
    const gridOn = Math.abs(grid) > IDLE_W;
    const homeOn = home > IDLE_W;
    const inv = Math.abs(bat) + home + Math.abs(grid) > IDLE_W;
    const pvKw = pvW / 1000;
    const soc = n.soc ?? 0;
    const batH = Math.max(4, Math.round((52 * soc) / 100));
    const homeK = Math.min(home / 1400, 1);
    const sunO = pv ? Math.max(0.35, Math.min(1, pvKw / 4)) : 0;
    const t = d
      ? {
          line: 'rgba(255,255,255,.38)',
          soft: 'rgba(255,255,255,.22)',
          track: 'rgba(255,255,255,.08)',
          box: '#14161C',
          houseTop: 'rgba(255,255,255,.10)',
          houseBot: 'rgba(255,255,255,.02)',
          pvBot: '#0E1A44',
          cell: 'rgba(255,255,255,.22)',
          shadow: 'rgba(0,0,0,.5)',
          face: '#1C1F26',
          hole: homeOn ? c.home : 'rgba(255,255,255,.35)',
          text: '#F3F4F6',
          invGlow: 'rgba(255,255,255,.35)',
          pylonFill: 'rgba(96,165,250,.18)',
        }
      : {
          line: 'rgba(20,22,26,.45)',
          soft: 'rgba(20,22,26,.25)',
          track: 'rgba(20,22,26,.08)',
          box: '#FFFFFF',
          houseTop: 'rgba(255,255,255,.95)',
          houseBot: 'rgba(255,255,255,.5)',
          pvBot: '#14245C',
          cell: 'rgba(255,255,255,.28)',
          shadow: 'rgba(20,24,40,.14)',
          face: '#F3F4F6',
          hole: '#14161A',
          text: '#14161A',
          invGlow: 'rgba(20,22,26,.18)',
          pylonFill: 'rgba(59,130,246,.14)',
        };
    const pylon = gridOn ? c.grid : t.soft;
    const socket = homeOn ? c.home : t.soft;
    const invStroke = inv ? t.text : t.soft;
    return svg`<svg class="scene" viewBox="0 0 420 336" aria-hidden="true">
      <defs>
        <radialGradient id="${id}-sun"><stop offset="0" stop-color="#FFF7D6"></stop><stop offset=".45" stop-color="#FBBF24"></stop><stop offset="1" stop-color="#FBBF24" stop-opacity="0"></stop></radialGradient>
        <linearGradient id="${id}-house" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${t.houseTop}></stop><stop offset="1" stop-color=${t.houseBot}></stop></linearGradient>
        <linearGradient id="${id}-pv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B5CC4"></stop><stop offset="1" stop-color=${t.pvBot}></stop></linearGradient>
      </defs>
      <circle class="pulse" cx="364" cy="44" r=${pv ? Math.round(30 + 26 * Math.min(1, pvKw / 5)) : 0} fill="url(#${id}-sun)" opacity=${sunO}></circle>
      <circle cx="364" cy="44" r="15" fill="#FFF3C4" opacity=${sunO}></circle>
      <path d="M372,30 A16,16 0 1 0 380,56 A12,12 0 1 1 372,30 Z" fill="#E5E7EB" opacity=${pv ? 0 : 1} style="filter:drop-shadow(0 0 10px rgba(229,231,235,.7))"></path>
      <path class="ray" d="M348,60 L306,112" opacity=${sunO}></path>

      <path d="M12,302 L408,302" stroke=${t.soft} stroke-width="1.5"></path>
      <ellipse cx="230" cy="303" rx="122" ry="5" fill=${t.shadow}></ellipse>
      <path d="M132,110 L328,148 L328,302 L132,302 Z" fill="url(#${id}-house)" stroke=${t.soft} stroke-width="1.5" stroke-linejoin="round"></path>
      <path d="M132,268 L328,268" stroke=${t.track} stroke-width="1"></path>
      <g transform="translate(126,108) rotate(10.886)">
        <line x1="-10" y1="0" x2="222" y2="0" stroke=${t.line} stroke-width="6" stroke-linecap="round"></line>
        <path d="M26,-5 V-3 M68,-5 V-3 M88,-5 V-3 M130,-5 V-3 M150,-5 V-3 M192,-5 V-3" stroke=${t.soft} stroke-width="2"></path>
        <g style=${pv ? `filter:drop-shadow(0 0 ${Math.round(3 + 7 * Math.min(1, pvKw / 4))}px ${c.solar})` : 'opacity:.7'}>
          ${[18, 80, 142].map(
            (x) =>
              svg`<rect x=${x} y="-21" width="58" height="16" rx="2.5" fill="url(#${id}-pv)" stroke=${pv ? c.solar : t.soft} stroke-width="1.2"></rect>`,
          )}
        </g>
        <path d="M32.5,-21V-5 M47,-21V-5 M61.5,-21V-5 M18,-13H76 M94.5,-21V-5 M109,-21V-5 M123.5,-21V-5 M80,-13H138 M156.5,-21V-5 M171,-21V-5 M185.5,-21V-5 M142,-13H200" stroke=${t.cell} stroke-width=".8"></path>
        <path d="M20,-19.5 H74 M82,-19.5 H136 M144,-19.5 H198" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linecap="round"></path>
      </g>

      <g fill="none" stroke=${t.track} stroke-width="3" stroke-linejoin="round">
        <path d=${PATHS.solar}></path>
        <path d=${PATHS.batIn}></path>
        <path d=${PATHS.home}></path>
        <path d=${PATHS.gridOut}></path>
      </g>
      ${this.flow(c.solar, n.solar, PATHS.solar)}
      ${this.flow(c.bat, bat, bat >= 0 ? PATHS.batIn : PATHS.batOut)}
      ${this.flow(c.home, home, PATHS.home)}
      ${this.flow(c.grid, grid, grid <= 0 ? PATHS.gridOut : PATHS.gridIn)}

      <rect x="207" y="174" width="46" height="40" rx="10" fill=${t.box} stroke=${invStroke} stroke-width="1.5" style=${inv ? `filter:drop-shadow(0 0 8px ${t.invGlow})` : ''}></rect>
      <path d="M218,196 C222,188 226,188 230,196 C234,204 238,204 242,196" fill="none" stroke=${invStroke} stroke-width="2" stroke-linecap="round"></path>
      <circle cx="245" cy="181" r="2.2" fill=${inv ? c.bat : t.soft} style=${inv ? `filter:drop-shadow(0 0 4px ${c.bat})` : ''}></circle>

      <rect x="263" y="244" width="46" height="46" rx="12" fill=${t.box} stroke=${socket} stroke-width="2" style=${homeOn ? `filter:drop-shadow(0 0 ${Math.round(5 + 12 * homeK)}px ${c.home})` : ''}></rect>
      <circle cx="286" cy="267" r="14" fill=${t.face} stroke=${socket} stroke-width="1.5"></circle>
      <circle cx="280.5" cy="267" r="2.6" fill=${t.hole}></circle>
      <circle cx="291.5" cy="267" r="2.6" fill=${t.hole}></circle>
      <rect x="284" y="253" width="4" height="3" rx="1" fill=${socket}></rect>
      <rect x="284" y="278" width="4" height="3" rx="1" fill=${socket}></rect>

      <rect x="150" y="242" width="44" height="58" rx="10" fill=${t.box} stroke=${t.soft} stroke-width="1.5"></rect>
      <rect x="153" y=${297 - batH} width="38" height=${batH} rx="7" fill=${c.bat} style=${Math.abs(bat) > IDLE_W ? `filter:drop-shadow(0 0 10px ${c.bat})` : 'opacity:.75'}></rect>
      <rect x="164" y="237" width="16" height="6" rx="2" fill=${t.soft}></rect>
      <path d="M174,258 L165,272 H171.5 L169.5,284 L179,268 H172.5 Z" fill="#FFFFFF" opacity=${bat > IDLE_W ? 0.95 : 0}></path>

      <g style=${gridOn ? `filter:drop-shadow(0 0 6px ${c.grid})` : ''}>
        <path d="M45,302 L50.5,176 L55.5,176 L61,302 Z" fill=${gridOn ? t.pylonFill : 'transparent'} stroke=${pylon} stroke-width="1.5" stroke-linejoin="round"></path>
        <path d="M50.5,176 L53,164 L55.5,176" fill="none" stroke=${pylon} stroke-width="1.5" stroke-linejoin="round"></path>
        <rect x="34" y="192" width="38" height="4" rx="2" fill=${pylon}></rect>
        <rect x="30" y="214" width="46" height="4" rx="2" fill=${pylon}></rect>
        <circle cx="36" cy="199" r="2.4" fill=${pylon}></circle>
        <circle cx="70" cy="199" r="2.4" fill=${pylon}></circle>
        <circle cx="32" cy="221" r="2.4" fill=${pylon}></circle>
        <circle cx="74" cy="221" r="2.4" fill=${pylon}></circle>
      </g>
      <path d="M36,201 Q18,212 -8,206 M32,223 Q14,234 -8,228" fill="none" stroke=${pylon} stroke-opacity=".45" stroke-width="1.2"></path>
    </svg>`;
  }

  private labels(n: EnergyNow): TemplateResult {
    const h = this.hass;
    const bat = n.battery ?? 0;
    const grid = n.grid ?? 0;
    const one = (w: number) =>
      new Intl.NumberFormat(h?.language ?? 'en', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(Math.abs(w) / 1000);
    const batText =
      n.soc === null
        ? et(h, 'battery')
        : formatPct(h, n.soc) +
          (bat > IDLE_W ? ` · +${one(bat)}` : bat < -IDLE_W ? ` · −${one(bat)}` : '');
    const gridText =
      grid < -IDLE_W
        ? `${kw(h, grid)} ${et(h, 'out')}`
        : grid > IDLE_W
          ? `${kw(h, grid)} ${et(h, 'in')}`
          : et(h, 'grid_idle');
    return html`<span class="lab bat">${batText}</span>
      <span class="lab home">${et(h, 'house')} ${kw(h, n.home ?? 0)}</span>
      <span class="lab grid ${Math.abs(grid) > IDLE_W ? 'on' : ''}">${gridText}</span>`;
  }

  private tiles(): TemplateResult | typeof nothing {
    if (!this.hass || !this.config) return nothing;
    const h = this.hass;
    const t = readToday(h, this.config);
    const a = autarky(t);
    const items: [string, string][] = [];
    if (t.solar !== null) items.push([et(h, 'pv_today'), kwh(h, t.solar, 1)]);
    if (a !== null) items.push([et(h, 'autarky_today'), formatPct(h, a)]);
    if (t.gridImport !== null) items.push([et(h, 'import_today'), kwh(h, t.gridImport)]);
    if (!items.length) return nothing;
    return html`<div class="tiles">
      ${items.map(
        ([l, v]) =>
          html`<div class="tile"><span class="tl">${l}</span><span class="tv">${v}</span></div>`,
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
    const n = this.now;
    const pv = (n.solar ?? 0) > IDLE_W;
    const h = this.hass;
    return html`<div
      class="glass card ${pv ? 'sunny' : ''}"
      role="button"
      tabindex="0"
      aria-label=${this.config.name ?? et(h, 'energy')}
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointercancel=${this.press.cancel}
      @pointermove=${this.press.move}
      @keydown=${this.onKey}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <div class="head">
        <div class="titles">
          <span class="title">${this.config.name ?? et(h, 'energy')}</span>
          <span class="sub">${this.headline(n)}</span>
        </div>
        <div class="hero">
          <span class="hv">${pv ? kw(h, n.solar ?? 0) : kw(h, n.home ?? 0)}</span>
          <span class="hl">${et(h, pv ? 'solar_caps' : 'consumption_caps')}</span>
        </div>
      </div>
      <div class="stage">${this.scene(n)} ${this.labels(n)}</div>
      ${this.tiles()}
    </div>`;
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        --e-solar: #f59e0b;
        --e-bat-text: #047857;
        --e-grid-text: #1d4ed8;
      }
      :host([dark]) {
        --e-solar: #fbbf24;
        --e-bat-text: #a7f3d0;
        --e-grid-text: #bfdbfe;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .card:focus-visible {
        outline: 2px solid rgba(var(--glow-accent), 0.8);
        outline-offset: 2px;
      }
      .card.sunny {
        background: linear-gradient(
          160deg,
          rgba(245, 158, 11, 0.14),
          rgba(255, 255, 255, 0.72) 55%
        );
        border-color: rgba(255, 255, 255, 0.9);
        box-shadow: 0 20px 48px -16px rgba(245, 158, 11, 0.35);
      }
      :host([dark]) .card.sunny {
        background: linear-gradient(160deg, rgba(251, 191, 36, 0.12), rgba(20, 22, 28, 0.55) 55%);
        border-color: rgba(251, 191, 36, 0.18);
        box-shadow: 0 24px 60px -18px rgba(251, 191, 36, 0.35);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .title {
        font-size: 16px;
        font-weight: 700;
      }
      .titles .sub,
      .hl,
      .tl {
        color: var(--glow-muted);
      }
      .titles .sub {
        font-size: 13px;
        font-weight: 500;
      }
      .hero {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
      }
      .hv {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.1;
        white-space: nowrap;
      }
      :host([dark]) .sunny .hv {
        color: #fde68a;
      }
      .hl {
        font-size: 11px;
        font-weight: 700;
      }
      .stage {
        position: relative;
        width: 100%;
        aspect-ratio: 420 / 336;
      }
      .scene {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .flow {
        fill: none;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 4 10;
        animation: dash linear infinite;
      }
      .ray {
        fill: none;
        stroke: #fde68a;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 3 10;
        animation: dash 1.4s linear infinite;
        filter: drop-shadow(0 0 6px #fbbf24);
      }
      .pulse {
        animation: glow 3s ease-in-out infinite;
      }
      @keyframes dash {
        to {
          stroke-dashoffset: -120;
        }
      }
      @keyframes glow {
        0%,
        100% {
          opacity: 0.75;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flow,
        .ray,
        .pulse {
          animation: none;
        }
      }
      .lab {
        position: absolute;
        top: 91.7%;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        transform: translateX(-50%);
      }
      .lab.bat {
        left: 41%;
        color: var(--e-bat-text);
      }
      .lab.home {
        left: 67.9%;
      }
      .lab.grid {
        left: 12.4%;
        color: var(--glow-muted);
      }
      .lab.grid.on {
        color: var(--e-grid-text);
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: auto;
      }
      .tile {
        border-radius: 16px;
        background: var(--glow-inset);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .tl {
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tv {
        font-size: 15px;
        font-weight: 800;
        white-space: nowrap;
      }
    `,
  ];

  // ---------- popup ----------

  protected popupOpened(): void {
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const h = this.hass;
    const c = this.config;
    if (!h || !c) return;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const yStart = new Date(midnight);
    yStart.setDate(midnight.getDate() - 1);
    const ids = [c.solar, c.home, c.battery, c.solar_energy].filter((x): x is string => !!x);
    const hist = await fetchHistory(h, ids, yStart, now);
    const slots = Math.max(1, Math.round(dayFraction(now) * 96));
    const from = midnight.getTime();
    const to = now.getTime();
    const watts = (id?: string): number[] => {
      if (!id) return [];
      const unit = String(h.states[id]?.attributes.unit_of_measurement ?? 'W');
      const k = unit === 'kW' ? 1000 : 1;
      return numericBuckets(hist[id] ?? [], from, to, slots).map((v) => v * k);
    };
    this.series = {
      solar: watts(c.solar),
      home: watts(c.home),
      soc: c.battery ? numericBuckets(hist[c.battery] ?? [], from, to, slots) : [],
    };
    this.yesterdaySolar = c.solar_energy ? lastBefore(hist[c.solar_energy] ?? [], from) : undefined;
    this.requestUpdate();
  }

  protected popupClosed(): void {
    this.series = undefined;
  }

  private chart(n: EnergyNow): TemplateResult | typeof nothing {
    const h = this.hass;
    const c = this.colors;
    const s = this.series;
    if (!s || (!s.solar.length && !s.home.length && !s.soc.length)) return nothing;
    const frac = dayFraction(new Date());
    const nowX = frac * CHART.w;
    const max = chartMax(s);
    const yP = (w: number) => CHART.base - (Math.max(0, w) / max) * (CHART.base - CHART.top);
    const yS = (v: number) => CHART.base - (Math.max(0, Math.min(100, v)) / 100) * 130;
    const solarLine = chartPath(s.solar, frac, yP);
    const solarArea = solarLine
      ? `${solarLine} L${nowX.toFixed(1)},${yP(s.solar[s.solar.length - 1])} L${nowX.toFixed(1)},${CHART.base} L${((frac * CHART.w) / s.solar.length / 2).toFixed(1)},${CHART.base} Z`
      : '';
    const pvNow = n.solar ?? s.solar[s.solar.length - 1] ?? 0;
    const socNow = n.soc ?? s.soc[s.soc.length - 1];
    const id = this.gid;
    const labelX = Math.min(nowX + 7, CHART.w - 50);
    return html`<div class="chart">
      <div class="chart-head">
        <span class="sec">${et(h, 'history_today')}</span>
        <div class="legend">
          <span><i class="sq" style="background:${c.solar}"></i>${et(h, 'solar')}</span>
          <span><i class="ln" style="background:${c.chartHome}"></i>${et(h, 'consumption')}</span>
          <span><i class="ds" style="border-color:${c.bat}"></i>${et(h, 'soc')}</span>
        </div>
      </div>
      <div class="plot">
        <svg viewBox="0 0 400 158" aria-hidden="true">
          <defs>
            <linearGradient id="${id}-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color=${c.solar} stop-opacity=".75"></stop>
              <stop offset="1" stop-color=${c.solar} stop-opacity=".05"></stop>
            </linearGradient>
          </defs>
          <path class="gridl" d="M0,10 H400 M0,53 H400 M0,96 H400"></path>
          <path class="axis" d="M0,140 H400"></path>
          <rect
            class="future"
            x=${nowX}
            y="6"
            width=${Math.max(0, CHART.w - nowX)}
            height="134"
          ></rect>
          ${solarArea ? svg`<path d=${solarArea} fill="url(#${id}-area)"></path>` : nothing}
          ${
            solarLine
              ? svg`<path d=${solarLine} fill="none" stroke=${c.solar} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${c.solar})"></path>`
              : nothing
          }
          ${
            s.home.length
              ? svg`<path d=${chartPath(s.home, frac, yP)} fill="none" stroke=${c.chartHome} stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`
              : nothing
          }
          ${
            s.soc.length
              ? svg`<path d=${chartPath(s.soc, frac, yS)} fill="none" stroke=${c.bat} stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round" stroke-linecap="round"></path>`
              : nothing
          }
          <path class="now" d="M${nowX},6 V140"></path>
          ${
            s.solar.length
              ? svg`<circle cx=${nowX} cy=${yP(pvNow)} r="4.5" fill=${c.solar} style="filter:drop-shadow(0 0 6px ${c.solar})"></circle>`
              : nothing
          }
          ${
            socNow !== undefined && socNow !== null && s.soc.length
              ? svg`<circle cx=${nowX} cy=${yS(socNow)} r="3.5" fill=${c.bat}></circle>`
              : nothing
          }
        </svg>
        ${
          s.solar.length
            ? html`<span
                class="pl sol"
                style="left:${(labelX / 4).toFixed(2)}%;top:${((yP(pvNow) - 13) / 1.58).toFixed(2)}%"
                >${kw(h, pvNow)}</span
              >`
            : nothing
        }
        ${
          socNow !== undefined && socNow !== null && s.soc.length
            ? html`<span
                class="pl batt"
                style="left:${(labelX / 4).toFixed(2)}%;top:${((yS(socNow) - 10) / 1.58).toFixed(2)}%"
                >${formatPct(h, socNow)}</span
              >`
            : nothing
        }
        <span class="nowl" style="left:${(nowX / 4).toFixed(2)}%">${et(h, 'now_caps')}</span>
        <div class="xax">
          <span>0</span><span>6</span><span>12</span><span>18</span
          ><span>24 ${et(h, 'hour_axis')}</span>
        </div>
      </div>
    </div>`;
  }

  private row(
    color: string,
    icon: TemplateResult,
    label: string,
    sub: string,
    value: TemplateResult,
    last = false,
  ): TemplateResult {
    return html`<div class="brow ${last ? 'last' : ''}">
      <div class="bico" style="color:${color}">${icon}</div>
      <div class="btxt"><span class="bl">${label}</span><span class="bs">${sub}</span></div>
      ${value}
    </div>`;
  }

  protected renderPopup() {
    const h = this.hass;
    const c = this.config;
    if (!h || !c) return undefined;
    const n = this.now;
    const col = this.colors;
    const t = readToday(h, c);
    const a = autarky(t);
    const sc = selfConsumption(t);
    const bat = n.battery ?? 0;
    const pv = (n.solar ?? 0) > IDLE_W;
    const batMode =
      bat > IDLE_W
        ? `${et(h, 'charging_with')} ${kw(h, bat, 1)}`
        : bat < -IDLE_W
          ? `${et(h, 'discharging_with')} ${kw(h, bat, 1)}`
          : et(h, 'idle');
    const kpi = (label: string, value: string, sub: string, cls = '') =>
      html`<div class="kpi">
        <span class="kl">${label}</span><span class="kv ${cls}">${value}</span
        ><span class="ks">${sub}</span>
      </div>`;
    const dash = '–';
    const one = (v: number | null) =>
      html`<span class="bv">${v === null ? dash : kwh(h, v)}</span>`;
    const two = (a1: number | null, b1: number | null, signed = false) =>
      html`<div class="bv2">
        <span class="b1">${a1 === null ? dash : `${signed ? '+' : ''}${kwh(h, a1)}`}</span>
        <span class="b2">${b1 === null ? dash : `${signed ? '−' : ''}${kwh(h, b1)}`}</span>
      </div>`;
    const solarSub =
      this.yesterdaySolar !== undefined
        ? `${et(h, 'produced')} · ${et(h, 'yesterday')} ${kwh(h, this.yesterdaySolar)}`
        : et(h, 'produced');
    const rows: TemplateResult[] = [];
    if (c.solar || c.solar_energy)
      rows.push(this.row(col.solar, ICONS.solar, et(h, 'solar'), solarSub, one(t.solar)));
    if (c.home || c.home_energy)
      rows.push(
        this.row(
          col.chartHome,
          ICONS.socket,
          et(h, 'house'),
          n.home !== null
            ? `${et(h, 'consumed')} · ${et(h, 'now')} ${kw(h, n.home)}`
            : et(h, 'consumed'),
          one(t.home),
        ),
      );
    if (c.battery || c.battery_power || c.battery_charge_energy)
      rows.push(
        this.row(
          col.bat,
          ICONS.battery,
          et(h, 'battery'),
          et(h, 'charged_discharged'),
          two(t.batteryCharge, t.batteryDischarge, true),
        ),
      );
    if (c.grid || c.grid_import_energy)
      rows.push(
        this.row(
          col.grid,
          ICONS.grid,
          et(h, 'grid'),
          et(h, 'imported_exported'),
          two(t.gridImport, t.gridExport),
        ),
      );
    return {
      heading: c.name ?? et(h, 'energy'),
      subtitle: `${this.headline(n)} · ${kw(h, pv ? (n.solar ?? 0) : (n.home ?? 0))}`,
      content: html`<div class="energy-pop">
        <div class="ranges" role="tablist">
          ${(['today', 'week', 'month', 'year'] as const).map(
            (r, i) =>
              html`<span class="range ${i === 0 ? 'on' : ''}" role="tab">${et(h, r)}</span>`,
          )}
        </div>
        <div class="kpis">
          ${kpi(et(h, 'autarky'), a === null ? dash : formatPct(h, a), et(h, 'self_covered'))}
          ${kpi(et(h, 'self_use'), sc === null ? dash : formatPct(h, sc), et(h, 'solar_used'))}
          ${kpi(et(h, 'battery'), n.soc === null ? dash : formatPct(h, n.soc), batMode, 'bat')}
        </div>
        ${this.chart(n)}
        <div class="balance">
          <span class="sec">${et(h, 'balance_today')}</span>
          ${rows}
        </div>
      </div>`,
    };
  }

  protected popupStyles() {
    return [
      css`
        .panel {
          width: min(440px, 100%) !important;
          gap: 16px !important;
          --e-solar-glow: rgba(245, 158, 11, 0.5);
          --e-bat-text: #047857;
          --e-solar-text: #b45309;
        }
        :host([dark]) .panel {
          --e-solar-glow: rgba(251, 191, 36, 0.45);
          --e-bat-text: #a7f3d0;
          --e-solar-text: #fde68a;
        }
        :host([glow-only][active]) .panel {
          box-shadow:
            var(--glow-pop-shadow),
            0 0 90px -30px var(--e-solar-glow) !important;
        }
        .energy-pop {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ranges {
          display: flex;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: var(--glow-inset);
        }
        .range {
          flex: 1;
          height: 34px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .range.on {
          background: var(--glow-tab-active);
          color: var(--glow-text);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        }
        .kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .kpi {
          border-radius: 18px;
          background: var(--glow-inset);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .kl,
        .ks {
          font-size: 11px;
          color: var(--glow-muted);
        }
        .kl {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .kl {
          font-weight: 700;
        }
        .ks {
          font-weight: 500;
        }
        .kv {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 1.1;
        }
        .kv.bat {
          color: var(--e-bat-text);
        }
        .sec {
          font-size: 13px;
          font-weight: 700;
        }
        .chart {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .legend {
          display: flex;
          gap: 12px;
          font-size: 11px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .legend span {
          display: flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        .legend .sq {
          width: 10px;
          height: 10px;
          border-radius: 3px;
        }
        .legend .ln {
          width: 12px;
          height: 2px;
          border-radius: 2px;
        }
        .legend .ds {
          width: 12px;
          height: 0;
          border-top: 2px dashed;
        }
        .plot {
          position: relative;
          width: 100%;
          aspect-ratio: 400 / 158;
        }
        .plot svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        .gridl {
          stroke: var(--glow-track);
          stroke-width: 1;
          stroke-dasharray: 2 4;
        }
        .axis {
          stroke: var(--glow-muted);
          stroke-opacity: 0.4;
          stroke-width: 1.5;
        }
        .future {
          fill: var(--glow-text);
          fill-opacity: 0.02;
        }
        .now {
          stroke: var(--glow-text);
          stroke-opacity: 0.35;
          stroke-width: 1;
        }
        .pl {
          position: absolute;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }
        .pl.sol {
          color: var(--e-solar-text);
        }
        .pl.batt {
          color: var(--e-bat-text);
        }
        .nowl {
          position: absolute;
          top: 0;
          width: 42px;
          margin-left: -21px;
          text-align: center;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: var(--glow-muted);
          animation: npulse 2s ease-in-out infinite;
        }
        @keyframes npulse {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }
        .xax {
          position: absolute;
          left: 0;
          right: 0;
          top: 91.1%;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .balance {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .balance .sec {
          margin-bottom: 6px;
        }
        .brow {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid var(--glow-line);
        }
        .brow:last-child {
          border-bottom: 0;
        }
        .bico {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: 12px;
          background: var(--glow-inset);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btxt {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .bl {
          font-size: 14px;
          font-weight: 700;
        }
        .bs {
          font-size: 12px;
          font-weight: 500;
          color: var(--glow-muted);
        }
        .bv {
          font-size: 15px;
          font-weight: 800;
          white-space: nowrap;
        }
        .bv2 {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          white-space: nowrap;
        }
        .b1 {
          font-size: 13px;
          font-weight: 800;
        }
        .b2 {
          font-size: 12px;
          font-weight: 600;
          color: var(--glow-muted);
        }
      `,
    ];
  }
}

/** Last numeric value before `t` (yesterday's total of a daily meter). */
function lastBefore(points: StatePoint[], t: number): number | undefined {
  let best: number | undefined;
  for (const p of [...points].sort((a, b) => a.start - b.start)) {
    if (p.start >= t) break;
    const v = Number(p.state);
    if (Number.isFinite(v)) best = v;
  }
  return best;
}

const icon = (body: TemplateResult) =>
  html`<svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${body}
  </svg>`;

/** Bilanz icons from the popup board (PV module, wall socket, battery, pylon). */
const ICONS = {
  solar: icon(
    svg`<rect x="3" y="5" width="18" height="11" rx="1.5"></rect><path d="M9 5v11M15 5v11M3 10.5h18M12 16v4M8 20h8"></path>`,
  ),
  socket: icon(
    svg`<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="5.5"></circle><circle cx="9.8" cy="12" r="1" fill="currentColor"></circle><circle cx="14.2" cy="12" r="1" fill="currentColor"></circle>`,
  ),
  battery: icon(
    svg`<rect x="6" y="4" width="12" height="17" rx="3"></rect><path d="M10 2h4M12.5 8l-2.5 4.5h4L11.5 17"></path>`,
  ),
  grid: icon(svg`<path d="M9.5 21L11.2 5h1.6l1.7 16M12 2.5V5M6 8h12M5 12.5h14"></path>`),
};

registerCard(
  {
    type: 'glowcard-energy',
    name: 'GlowCard Energy',
    description: 'Energy flow as a glowing house: solar, battery, grid and home with a day popup',
  },
  GlowEnergyCard,
);

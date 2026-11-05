import { css, html, nothing, svg, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, stubEntity, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import {
  actionsField,
  areaField,
  configForm,
  lookFields,
  lookSection,
  nameIconFields,
  sizeField,
  variantField,
} from '../../core/editor';
import { language, localize } from '../../core/localize';
import { formatNumber } from '../../core/format';
import { fireEvent } from '../../core/fire-event';
import { fetchHistory, meterIncrease, numericBuckets, type StatePoint } from '../../core/history';
import {
  TIMER_OPTIONS,
  chartPaths,
  countdownFactor,
  countdownSeconds,
  findPlugParts,
  formatWatts,
  niceMax,
  selectedTimer,
  toKwh,
  watts,
  type PlugParts,
} from './plug-logic';
import '../../components/orb';
import '../../components/segments';

export interface PlugCardConfig extends GlowCardConfig {
  /** small (default) or wide (full width with live power curve). */
  variant?: 'small' | 'wide';
  /** From this many watts the plug counts as drawing power and glows (default 1). */
  threshold?: number;
  /** Text for "nicht erreichbar"; default: the entity's area. */
  area?: string;
  /** Overrides for the entities found automatically on the plug's device. */
  power_entity?: string;
  energy_entity?: string;
  countdown_entity?: string;
  child_lock_entity?: string;
  power_on_entity?: string;
  indicator_entity?: string;
}

const HOUR = 3_600_000;
const CHART_SPAN = 2 * HOUR;
const CHART_BUCKETS = 24;
const REFRESH_MS = 5 * 60_000;

/** Smart plug card from the GlowPlugs board: small and wide variants plus popup. */
export class GlowPlugCard extends GlowCardBase<PlugCardConfig> {
  @state() private powerHistory?: StatePoint[];
  @state() private energyHistory?: StatePoint[];
  private refreshTimer?: number;
  private loadedFor?: string;

  protected defaultColor = 'teal';
  protected popupStyle = 'glow' as const;

  static getConfigForm() {
    const pick = (name: string, domain: string[], device_class?: string) => ({
      name,
      selector: { entity: device_class ? { domain, device_class } : { domain } },
    });
    return configForm(
      [
        { name: 'entity', required: true, selector: { entity: { domain: ['switch'] } } },
        lookSection(variantField(['small', 'wide']), nameIconFields, lookFields, sizeField, {
          name: '',
          type: 'grid',
          schema: [
            areaField,
            { name: 'threshold', selector: { number: { min: 0, step: 0.5, mode: 'box' } } },
          ],
        }),
        {
          name: '',
          type: 'expandable',
          title: 'entities_section',
          icon: 'mdi:power-plug-outline',
          schema: [
            pick('power_entity', ['sensor'], 'power'),
            pick('energy_entity', ['sensor'], 'energy'),
            pick('countdown_entity', ['number']),
            pick('child_lock_entity', ['switch', 'lock']),
            pick('power_on_entity', ['select']),
            pick('indicator_entity', ['select']),
          ],
        },
        actionsField,
      ],
      {
        color: 'color_helper',
        area: 'area_helper',
        power_entity: 'auto_helper',
        energy_entity: 'auto_helper',
        countdown_entity: 'auto_helper',
        child_lock_entity: 'auto_helper',
        power_on_entity: 'auto_helper',
        indicator_entity: 'auto_helper',
      },
    );
  }

  /** No entity is picked for the user; "by entity" passes the chosen ones. */
  static getStubConfig(): Partial<PlugCardConfig> {
    return stubEntity();
  }

  getCardSize(): number {
    return this.config?.variant === 'wide' ? 4 : 3;
  }

  getGridOptions() {
    const wide = this.config?.variant === 'wide';
    return { columns: wide ? 12 : 3, rows: 'auto', min_columns: wide ? 6 : 3 };
  }

  // ---------- entities ----------

  private get parts(): PlugParts {
    const c = this.config;
    const found = this.hass && c?.entity ? findPlugParts(this.hass, c.entity) : {};
    return {
      power: c?.power_entity ?? found.power,
      energy: c?.energy_entity ?? found.energy,
      countdown: c?.countdown_entity ?? found.countdown,
      child_lock: c?.child_lock_entity ?? found.child_lock,
      power_on: c?.power_on_entity ?? found.power_on,
      indicator: c?.indicator_entity ?? found.indicator,
    };
  }

  private st(id?: string) {
    return id ? this.hass?.states[id] : undefined;
  }

  protected watchedEntities(): string[] {
    const p = this.parts;
    return [super.watchedEntities(), Object.values(p)].flat().filter(Boolean) as string[];
  }

  protected get icon(): string {
    if (this.isUnavailable) return 'mdi:power-plug-off-outline';
    const fromEntity = this.stateObj?.attributes.icon;
    if (this.config?.icon) return this.config.icon;
    return typeof fromEntity === 'string' ? fromEntity : 'mdi:power-socket-de';
  }

  private get power(): number | undefined {
    return this.isUnavailable ? undefined : watts(this.st(this.parts.power));
  }

  /** Glows only while it draws power; without a power sensor, while it is on. */
  private get drawing(): boolean {
    if (!this.isActive) return false;
    const w = this.power;
    if (w === undefined) return true;
    return w >= (this.config?.threshold ?? 1);
  }

  // ---------- history ----------

  private get needsHistory(): boolean {
    return this.config?.variant === 'wide' || this.popupOpen;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.refreshTimer = window.setInterval(() => void this.loadHistory(true), REFRESH_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.refreshTimer);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!changed.has('hass') && !changed.has('config')) return;
    const p = this.parts;
    const key = `${this.config?.entity}|${p.power}|${p.energy}`;
    if (key !== this.loadedFor) {
      void this.loadHistory(true);
      return;
    }
    this.appendLive(p.power, 'powerHistory');
    this.appendLive(p.energy, 'energyHistory');
  }

  /** Adds the live state to the loaded history, so the curve follows without refetching. */
  private appendLive(id: string | undefined, field: 'powerHistory' | 'energyHistory'): void {
    const e = this.st(id);
    const list = this[field];
    if (!e || !list) return;
    const start = Date.parse(e.last_changed);
    const last = list[list.length - 1];
    if (last && last.start >= start) return;
    this[field] = [...list, { state: e.state, start }];
    this.refreshPopup();
  }

  protected popupOpened(): void {
    void this.loadHistory(false);
  }

  private async loadHistory(force: boolean): Promise<void> {
    const p = this.parts;
    if (!this.hass || !this.config?.entity || !this.needsHistory) return;
    if (!force && (this.powerHistory || this.energyHistory)) return;
    this.loadedFor = `${this.config.entity}|${p.power}|${p.energy}`;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const [power, energy] = await Promise.all([
      p.power
        ? fetchHistory(this.hass, [p.power], new Date(now.getTime() - CHART_SPAN), now)
        : undefined,
      p.energy ? fetchHistory(this.hass, [p.energy], yesterday, now) : undefined,
    ]);
    this.powerHistory = p.power ? power?.[p.power] : undefined;
    this.energyHistory = p.energy ? energy?.[p.energy] : undefined;
    this.refreshPopup();
  }

  private get series(): number[] {
    const e = this.st(this.parts.power);
    const now = Date.now();
    const pts = this.powerHistory ?? [];
    const factor = e?.attributes.unit_of_measurement === 'kW' ? 1000 : 1;
    return pts.length
      ? numericBuckets(pts, now - CHART_SPAN, now, CHART_BUCKETS).map((v) => v * factor)
      : [];
  }

  /** kWh today and yesterday from the energy meter, or undefined without one. */
  private get energy(): { today?: number; yesterday?: number } {
    const e = this.st(this.parts.energy);
    if (!e || !this.energyHistory) return {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t0 = today.getTime();
    const y0 = new Date(today).setDate(today.getDate() - 1);
    const pts = this.energyHistory;
    const t = meterIncrease(pts, t0, Date.now());
    const y = meterIncrease(pts, y0, t0);
    return {
      today: t === undefined ? undefined : toKwh(t, e),
      yesterday: y === undefined ? undefined : toKwh(y, e),
    };
  }

  // ---------- actions ----------

  private setTimer = async (ev: CustomEvent<{ value: string }>) => {
    const id = this.parts.countdown;
    const e = this.st(id);
    if (!id || !e || !this.hass) return;
    const seconds = Number(ev.detail.value);
    const max = Number(e.attributes.max);
    let value = seconds / countdownFactor(e);
    if (Number.isFinite(max) && value > max) value = max;
    if (seconds > 0 && !this.isActive) {
      await this.hass.callService('homeassistant', 'turn_on', { entity_id: this.config!.entity });
    }
    await this.hass.callService('number', 'set_value', { entity_id: id, value });
  };

  private toggleLock = async () => {
    const id = this.parts.child_lock;
    if (!id || !this.hass) return;
    if (id.startsWith('lock.')) {
      const locked = this.st(id)?.state === 'locked';
      await this.hass.callService('lock', locked ? 'unlock' : 'lock', { entity_id: id });
    } else {
      await this.hass.callService('homeassistant', 'toggle', { entity_id: id });
    }
  };

  private moreInfo = (entityId: string) => () => {
    fireEvent(this, 'hass-more-info', { entityId });
  };

  // ---------- rendering ----------

  private w(value: number): string {
    return formatWatts(language(this.hass), value);
  }

  private kwh(value: number): string {
    return `${formatNumber(this.hass, value, 2)} kWh`;
  }

  private stateText(): string {
    if (this.isUnavailable) {
      const area = this.config?.area ?? this.areaName();
      const text = localize(this.hass, 'unreachable');
      return area ? `${area} · ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
    }
    const on = localize(this.hass, this.isActive ? 'on' : 'off');
    if (!this.isActive || this.power === undefined) return on;
    return `${on} · ${localize(this.hass, this.drawing ? 'drawing' : 'no_draw')}`;
  }

  private orb() {
    return html`<glowcard-orb
      .icon=${this.icon}
      ?active=${this.isActive}
      label=${this.displayName}
    ></glowcard-orb>`;
  }

  private wrap(extra: string, inner: unknown) {
    const s = this.isUnavailable ? 'unavailable' : this.drawing ? 'active' : '';
    return html`<div
      class="glass sized ${extra} ${s}"
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      ${inner}
    </div>`;
  }

  private chart(width: number, height: number, cls: string, dot = false) {
    const series = this.series;
    if (!series.length) return nothing;
    const { line, area, lastY } = chartPaths(series, width, height, niceMax(Math.max(...series)));
    const id = `plug-${cls}`;
    return html`<svg
      class=${cls}
      viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="area-top"></stop>
          <stop offset="1" class="area-bottom"></stop>
        </linearGradient>
      </defs>
      ${
        dot
          ? svg`<path class="grid" d="M0,25 H${width} M0,50 H${width} M0,75 H${width}"></path>`
          : nothing
      }
      <g class="curve ${this.isActive ? '' : 'off'}">
        <path d=${area} fill="url(#${id})"></path>
        <path class="line" d=${line}></path>
        ${dot ? svg`<circle class="line dot" cx=${width} cy=${lastY} r="4.5"></circle>` : nothing}
      </g>
    </svg>`;
  }

  private renderSmall() {
    const w = this.power;
    const value = this.isActive && w !== undefined ? this.w(w) : '';
    return this.wrap(
      'small',
      html`<div class="top">
          ${this.orb()}
          <span class="watts ${this.drawing ? 'on' : ''}">${value}</span>
        </div>
        <div class="titles">
          <span class="name small-name">${this.displayName}</span>
          <span class="sub">${this.stateText()}</span>
        </div>`,
    );
  }

  private renderWide() {
    const w = this.power;
    const on = this.isActive;
    const today = this.energy.today;
    const sub = this.isUnavailable
      ? this.stateText()
      : today !== undefined
        ? `${localize(this.hass, on ? 'on' : 'off')} · ${localize(this.hass, 'today_lower')} ${this.kwh(today)}`
        : this.stateText();
    const value = this.isUnavailable
      ? ''
      : on && w !== undefined
        ? this.w(w)
        : localize(this.hass, on ? 'on' : 'off');
    return this.wrap(
      'wide',
      html`<div class="top">
          <div class="head">
            ${this.orb()}
            <div class="titles">
              <span class="name">${this.displayName}</span>
              <span class="sub">${sub}</span>
            </div>
          </div>
          <span class="watts big ${this.drawing ? 'on' : ''}">${value}</span>
        </div>
        ${this.chart(900, 86, 'card-chart')}`,
    );
  }

  render() {
    if (!this.config) return nothing;
    return this.config.variant === 'wide' ? this.renderWide() : this.renderSmall();
  }

  // ---------- popup ----------

  private optionLabel(value: string): string {
    const v = value.toLowerCase();
    if (/previous|restore|memory|last/.test(v)) return localize(this.hass, 'previous_state');
    if (v === 'on' || v === 'off') return localize(this.hass, v);
    const text = value.replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private timeLabel(ms: number): string {
    return new Intl.DateTimeFormat(language(this.hass), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  }

  private renderTimer() {
    const e = this.st(this.parts.countdown);
    if (!e) return nothing;
    const max = Number(e.attributes.max);
    const factor = countdownFactor(e);
    const options = TIMER_OPTIONS.filter((s) => !Number.isFinite(max) || s / factor <= max);
    const M = localize(this.hass, 'minutes_short');
    const H = localize(this.hass, 'hours_short');
    const label = (s: number) =>
      s === 0
        ? localize(this.hass, 'off')
        : s < HOUR / 1000
          ? `${s / 60} ${M}`
          : `${s / 3600} ${H}`;
    return html`<div class="timer">
      <span class="section">${localize(this.hass, 'turn_off_in')}</span>
      <glowcard-segments
        .options=${options.map((s) => ({ value: String(s), label: label(s) }))}
        .value=${String(selectedTimer(countdownSeconds(e), options))}
        @value-changed=${this.setTimer}
      ></glowcard-segments>
    </div>`;
  }

  private renderSettings() {
    const p = this.parts;
    const lock = this.st(p.child_lock);
    const rows = [];
    if (lock) {
      const on = lock.state === 'on' || lock.state === 'locked';
      rows.push(
        html`<div class="row">
          <span class="row-label">${localize(this.hass, 'child_lock')}</span>
          <button
            class="pill ${on ? 'on' : ''}"
            aria-pressed=${on ? 'true' : 'false'}
            @click=${this.toggleLock}
          >
            ${localize(this.hass, on ? 'on' : 'off')}
          </button>
        </div>`,
      );
    }
    for (const [id, key] of [
      [p.power_on, 'power_on_behavior'],
      [p.indicator, 'indicator'],
    ] as const) {
      const e = this.st(id);
      if (!e || !id) continue;
      rows.push(
        html`<button class="row link" @click=${this.moreInfo(id)}>
          <span class="row-label">${localize(this.hass, key)}</span>
          <span class="row-value">${this.optionLabel(e.state)}</span>
        </button>`,
      );
    }
    return rows.length ? html`<div class="rows">${rows}</div>` : nothing;
  }

  protected renderPopup() {
    if (!this.config?.entity) return undefined;
    const w = this.power;
    const { today, yesterday } = this.energy;
    const hasPower = this.parts.power !== undefined;
    const now = Date.now();
    return {
      heading: this.displayName,
      subtitle: `${localize(this.hass, 'plug')} · ${
        this.isUnavailable
          ? localize(this.hass, 'unreachable')
          : localize(this.hass, this.isActive ? 'on' : 'off')
      }`,
      content: html`${
        hasPower
          ? html`<div class="now-row">
                <div class="now">
                  <span class="label">${localize(this.hass, 'power_now')}</span>
                  <span class="big-watts ${this.drawing ? 'on' : ''}"
                    >${w === undefined ? '–' : this.w(this.isActive ? w : 0)}</span
                  >
                </div>
                ${
                  this.parts.energy
                    ? html`<div class="stats">
                        <span
                          >${localize(this.hass, 'today')}
                          <b>${today === undefined ? '…' : this.kwh(today)}</b></span
                        >
                        <span
                          >${localize(this.hass, 'yesterday')}
                          <b>${yesterday === undefined ? '…' : this.kwh(yesterday)}</b></span
                        >
                      </div>`
                    : nothing
                }
              </div>
              <div class="pop-chart">
                ${this.chart(340, 100, 'popup-chart', true)}
                <div class="axis">
                  <span>${this.timeLabel(now - CHART_SPAN)}</span>
                  <span>${this.timeLabel(now - CHART_SPAN / 2)}</span>
                  <span>${localize(this.hass, 'now')}</span>
                </div>
              </div>`
          : nothing
      }
      ${this.renderTimer()} ${this.renderSettings()}`,
    };
  }

  protected popupStyles() {
    return [chartCss, popupCss];
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        /* GlowPlugs board: lit strength 0.6 → tint .18, shadow .43 */
        --glow-lit-tint: 0.18;
        --glow-lit-border: 0.35;
        --glow-lit-shadow: 0 20px 48px -14px rgba(var(--glow-accent), 0.43);
        --glow-orb-glow: 0 0 18px rgba(var(--glow-accent), 0.5);
        --glow-inset: rgba(20, 22, 26, 0.05);
      }
      :host([dark]) {
        --glow-lit-border: 0.28;
        --glow-lit-shadow: 0 24px 60px -14px rgba(var(--glow-accent), 0.43);
        --glow-orb-glow: 0 0 26px rgba(var(--glow-accent), 0.75);
        --glow-inset: rgba(255, 255, 255, 0.07);
      }
      .glass {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
      }
      .glass.unavailable {
        opacity: 0.6;
      }
      .small {
        height: var(--glow-card-h);
      }
      .wide {
        height: var(--glow-card-h-wide);
        padding-bottom: 0;
        overflow: hidden;
        justify-content: flex-start;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }
      .head {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
      }
      .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .small-name {
        font-size: var(--glow-name-small);
      }
      .name,
      .sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .watts {
        font-size: var(--glow-word-size);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
        white-space: nowrap;
        color: var(--glow-muted);
      }
      .watts.big {
        font-size: var(--glow-word-big);
      }
      .watts.on {
        color: var(--glow-text);
      }
      :host([dark]) .watts.on {
        color: color-mix(in srgb, rgb(var(--glow-accent)) 50%, #ffffff);
      }
      .card-chart {
        display: block;
        width: calc(100% + 2 * var(--glow-pad));
        margin: auto calc(-1 * var(--glow-pad)) 0;
        height: 92px;
        overflow: visible;
      }
    `,
    chartCssText(),
  ];
}

function chartCssText() {
  return css`
    svg {
      overflow: visible;
    }
    .area-top {
      stop-color: rgb(var(--glow-accent));
      stop-opacity: 0.35;
    }
    :host([dark]) .area-top {
      stop-opacity: 0.45;
    }
    .area-bottom {
      stop-color: rgb(var(--glow-accent));
      stop-opacity: 0;
    }
    .line {
      fill: none;
      stroke: rgb(var(--glow-accent));
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      filter: drop-shadow(0 0 6px rgba(var(--glow-accent), 0.8));
    }
    .dot {
      fill: rgb(var(--glow-accent));
      stroke: none;
    }
    .curve.off {
      opacity: 0.35;
    }
  `;
}

const chartCss = chartCssText();

const popupCss = css`
  :host {
    --glow-inset: rgba(20, 22, 26, 0.05);
  }
  :host([dark]) {
    --glow-inset: rgba(255, 255, 255, 0.07);
  }
  .now-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .now {
    display: flex;
    flex-direction: column;
  }
  .label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--glow-muted);
  }
  .big-watts {
    font-size: 48px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.05;
    color: var(--glow-muted);
  }
  .big-watts.on {
    color: var(--glow-text);
  }
  :host([dark]) .big-watts.on {
    color: color-mix(in srgb, rgb(var(--glow-accent)) 50%, #ffffff);
  }
  .stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--glow-muted);
  }
  .stats b {
    font-weight: 800;
    color: var(--glow-text);
  }
  .pop-chart {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .popup-chart {
    display: block;
    width: 100%;
    height: 100px;
  }
  .grid {
    stroke: rgba(20, 22, 26, 0.08);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }
  :host([dark]) .grid {
    stroke: rgba(255, 255, 255, 0.08);
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 700;
    color: var(--glow-muted);
  }
  .timer {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section {
    font-size: 13px;
    font-weight: 700;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 50px;
    padding: 10px 0;
    border-bottom: 1px solid var(--glow-line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row.link {
    cursor: pointer;
  }
  .row:focus-visible,
  .pill:focus-visible {
    outline: 2px solid rgb(var(--glow-accent));
  }
  .row-label,
  .row-value {
    font-size: 13px;
    font-weight: 600;
  }
  .row-value {
    color: var(--glow-muted);
  }
  .pill {
    all: unset;
    box-sizing: border-box;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    background: var(--glow-inset);
    color: var(--glow-muted);
  }
  .pill.on {
    background: rgb(var(--glow-accent));
    color: #fff;
  }
`;

registerCard(
  {
    type: 'glowcard-plug',
    name: 'GlowCard Plug',
    description: 'Smart plug with live power, energy today, timer and plug settings',
  },
  GlowPlugCard,
);

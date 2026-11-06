import { css, html, nothing, svg, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, stubEntity, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import {
  actionsField,
  areaField,
  configForm,
  editorLabel,
  lookFields,
  lookSection,
  miniSizeField,
  nameIconFields,
  DEFAULT_GESTURES,
  GROUP_GESTURES,
  type GestureSpec,
} from '../../core/editor';
import { language, localize } from '../../core/localize';
import { fireEvent } from '../../core/fire-event';
import {
  formatNumber,
  formatDuration,
  formatHours,
  formatLogDate,
  formatWeekdayTime,
  weekdayShort,
} from '../../core/format';
import {
  countSwitchOns,
  daySegments,
  fetchHistory,
  lastChanges,
  meterIncrease,
  numericBuckets,
  onPeriods,
  totalHours,
  type DayStrip,
  type StatePoint,
} from '../../core/history';
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
} from './power-logic';
import '../../components/orb';
import '../../components/segments';

export interface SwitchCardConfig extends GlowCardConfig {
  /** Former layout option: `row` = `size: mini`; `small` and `wide` are the normal tile. */
  variant?: 'small' | 'wide' | 'row';
  /** Several switches → group card; the orb switches all of them. */
  entities?: (string | { entity: string; name?: string })[];
  /** Text under the name in the row layout; default: the entity's area. */
  area?: string;
  /** Smart plugs: watts, live curve and today's usage on the card (default false, full width). */
  show_power?: boolean;
  /** With `show_power`: from this many watts the plug counts as drawing and glows (default 1). */
  threshold?: number;
  /** Overrides for the entities found automatically on the switch's device. */
  power_entity?: string;
  energy_entity?: string;
  countdown_entity?: string;
  child_lock_entity?: string;
  power_on_entity?: string;
  indicator_entity?: string;
}

const DAY_MS = 86_400_000;
const HOUR = 3_600_000;
const HISTORY_REFRESH_MS = 5 * 60_000;
const CHART_SPAN = 2 * HOUR;
const CHART_BUCKETS = 24;
const SWITCH_DOMAINS = ['switch', 'input_boolean'];

/**
 * Switch card (switch, input_boolean, smart plugs): tile, row and group layouts plus popup.
 * Plug extras (power, usage, timer, child lock …) are found on the device and shown in the
 * popup; power on the card only with `show_power`.
 */
export class GlowSwitchCard extends GlowCardBase<SwitchCardConfig> {
  @state() private history?: StatePoint[];
  @state() private powerHistory?: StatePoint[];
  @state() private energyHistory?: StatePoint[];
  private historyTimer?: number;
  private historyFor?: string;
  private powerFor?: string;

  protected popupStyle = 'glow' as const;
  /** All switches (plugs too) default to teal (Gilbert). */
  protected defaultColor = 'teal';

  static getConfigForm() {
    const pick = (name: string, domain: string[], device_class?: string) => ({
      name,
      selector: { entity: device_class ? { domain, device_class } : { domain } },
    });
    return configForm(
      [
        { name: 'entity', selector: { entity: { domain: SWITCH_DOMAINS } } },
        { name: 'entities', selector: { entity: { domain: SWITCH_DOMAINS, multiple: true } } },
        lookSection(nameIconFields, lookFields, miniSizeField, areaField),
        {
          name: '',
          type: 'expandable',
          title: 'entities_section',
          icon: 'mdi:power-plug-outline',
          schema: [
            { name: 'show_power', default: false, selector: { boolean: {} } },
            {
              name: 'threshold',
              default: 1,
              selector: { number: { min: 0, step: 0.5, mode: 'box' } },
            },
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
        entities: 'entities_helper',
        show_power: 'show_power_helper',
        power_entity: 'auto_helper',
        energy_entity: 'auto_helper',
        countdown_entity: 'auto_helper',
        child_lock_entity: 'auto_helper',
        power_on_entity: 'auto_helper',
        indicator_entity: 'auto_helper',
      },
      (config) => {
        const list = config.entities;
        if (Array.isArray(list) && list.some((e) => typeof e !== 'string')) {
          throw new Error(editorLabel('yaml_only'));
        }
      },
      (config) => {
        // The former row layout is the mini size now; the layout field is gone.
        if (config.variant === undefined) return config;
        const { variant, ...rest } = config;
        return variant === 'row' && rest.size === undefined ? { ...rest, size: 'mini' } : rest;
      },
    );
  }

  /** No entity is picked for the user; "by entity" passes the chosen ones. */
  static getStubConfig(): Partial<SwitchCardConfig> {
    return stubEntity();
  }

  /** Groups have no popup and no single entity: tap switches all, hold does nothing. */
  static gestureSpec(config: Record<string, unknown> = {}): GestureSpec {
    const group = Array.isArray(config.entities) && config.entities.length > 0;
    return group ? GROUP_GESTURES : DEFAULT_GESTURES;
  }

  setConfig(config: SwitchCardConfig): void {
    super.setConfig(config);
    this.defaultHoldAction = this.isGroup ? { action: 'none' } : { action: 'popup' };
  }

  getCardSize(): number {
    if (this.isMini) return 1;
    if (this.powerCard || this.isGroup) return 4;
    return 3;
  }

  /** Fixed rows on HA's grid: mini 1, tile 2 (compact) or 3, group and power card 3. */
  getGridOptions() {
    if (this.isMini) return this.gridOptions(6, 1, 3);
    if (this.powerCard) return this.gridOptions(12, 3, 6);
    if (this.isGroup) return this.gridOptions(6, 3);
    return this.gridOptions(3, this.gridSize === 'compact' ? 2 : 3);
  }

  /** One line (56 px): `size: mini`, or the former `variant: row`. Not for groups. */
  private get isMini(): boolean {
    return !this.isGroup && (this.config?.size === 'mini' || this.config?.variant === 'row');
  }

  /** The full width power card: `show_power` on a single switch (not a group or mini). */
  private get powerCard(): boolean {
    return !!this.config?.show_power && !this.isGroup && !this.isMini;
  }

  private get isGroup(): boolean {
    return (this.config?.entities?.length ?? 0) > 0;
  }

  private get groupItems(): { entity: string; name: string }[] {
    return (this.config?.entities ?? []).map((e) => {
      const entity = typeof e === 'string' ? e : e.entity;
      const name = typeof e === 'string' ? undefined : e.name;
      return { entity, name: name ?? this.friendlyName(entity) };
    });
  }

  protected watchedEntities(): string[] {
    if (this.isGroup) return this.groupItems.map((i) => i.entity);
    return [super.watchedEntities(), Object.values(this.parts)].flat().filter(Boolean) as string[];
  }

  // ---------- plug parts (found on the device) ----------

  private get parts(): PlugParts {
    const c = this.config;
    if (!c || this.isGroup) return {};
    const found = this.hass && c.entity ? findPlugParts(this.hass, c.entity) : {};
    return {
      power: c.power_entity ?? found.power,
      energy: c.energy_entity ?? found.energy,
      countdown: c.countdown_entity ?? found.countdown,
      child_lock: c.child_lock_entity ?? found.child_lock,
      power_on: c.power_on_entity ?? found.power_on,
      indicator: c.indicator_entity ?? found.indicator,
    };
  }

  private st(id?: string) {
    return id ? this.hass?.states[id] : undefined;
  }

  /** Smart plugs (a power sensor on the device) get a socket icon unless one is set. */
  protected get icon(): string {
    const own = this.config?.icon ?? this.stateObj?.attributes.icon;
    if (typeof own === 'string' || !this.parts.power) return super.icon;
    return this.isUnavailable ? 'mdi:power-plug-off-outline' : 'mdi:power-socket-de';
  }

  private get power(): number | undefined {
    return this.isUnavailable ? undefined : watts(this.st(this.parts.power));
  }

  /** With `show_power` it glows only while drawing power; otherwise while it is on. */
  private get glowing(): boolean {
    if (!this.isActive) return false;
    if (!this.config?.show_power) return true;
    const w = this.power;
    return w === undefined || w >= (this.config.threshold ?? 1);
  }

  protected get isActive(): boolean {
    if (this.isGroup)
      return this.groupItems.some((i) => this.hass?.states[i.entity]?.state === 'on');
    return super.isActive;
  }

  protected get isUnavailable(): boolean {
    if (this.isGroup) return false;
    return super.isUnavailable;
  }

  // ---------- history ----------

  private get needsHistory(): boolean {
    return !this.isGroup && this.popupOpen;
  }

  private get needsPower(): boolean {
    return !this.isGroup && (this.powerCard || this.popupOpen);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.historyTimer = window.setInterval(() => {
      void this.loadHistory(true);
      void this.loadPower(true);
    }, HISTORY_REFRESH_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.historyTimer);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('hass') || changed.has('config')) {
      const key = `${this.config?.entity}|${this.stateObj?.last_changed}`;
      if (key !== this.historyFor) void this.loadHistory(true);
      const p = this.parts;
      if (`${this.config?.entity}|${p.power}|${p.energy}` !== this.powerFor) {
        void this.loadPower(true);
      } else {
        this.appendLive(p.power, 'powerHistory');
        this.appendLive(p.energy, 'energyHistory');
      }
    }
  }

  protected popupOpened(): void {
    void this.loadHistory(false);
    void this.loadPower(false);
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

  private async loadPower(force: boolean): Promise<void> {
    const p = this.parts;
    if (!this.hass || !this.config?.entity || !this.needsPower) return;
    if (!p.power && !p.energy) return;
    if (!force && (this.powerHistory || this.energyHistory)) return;
    this.powerFor = `${this.config.entity}|${p.power}|${p.energy}`;
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

  private async loadHistory(force: boolean): Promise<void> {
    if (!this.hass || !this.config?.entity || !this.needsHistory) return;
    if (!force && this.history) return;
    this.historyFor = `${this.config.entity}|${this.stateObj?.last_changed}`;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const res = await fetchHistory(this.hass, [this.config.entity], start);
    this.history = res[this.config.entity];
    this.refreshPopup();
  }

  private get stats() {
    const now = Date.now();
    const points = this.history ?? [];
    const from = now - 7 * DAY_MS;
    const periods = onPeriods(points, from, now);
    return {
      days: daySegments(onPeriods(points, 0, now), now, 7),
      hours: totalHours(periods),
      count: countSwitchOns(points, from),
      log: lastChanges(points, 3),
    };
  }

  // ---------- actions ----------

  protected async toggleMain(): Promise<void> {
    if (this.isGroup) return this.toggleGroup();
    return super.toggleMain();
  }

  private toggleGroup = async (ev?: Event) => {
    ev?.stopPropagation();
    if (!this.hass) return;
    const ids = this.groupItems.map((i) => i.entity);
    await this.hass.callService('homeassistant', this.isActive ? 'turn_off' : 'turn_on', {
      entity_id: ids,
    });
  };

  private toggleOne = (entity: string) => async (ev: Event) => {
    ev.stopPropagation();
    await this.hass?.callService('homeassistant', 'toggle', { entity_id: entity });
  };

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

  private word(on: boolean): string {
    return localize(this.hass, on ? 'on' : 'off');
  }

  private w(value: number): string {
    return formatWatts(language(this.hass), value);
  }

  private kwh(value: number): string {
    return `${formatNumber(this.hass, value, 2)} kWh`;
  }

  /** Top right / row value: watts while on with `show_power`, else on/off. */
  private valueText(): string {
    if (this.isUnavailable) return '';
    const w = this.power;
    if (this.config?.show_power && this.isActive && w !== undefined) return this.w(w);
    return this.word(this.isActive);
  }

  private sinceText(): string {
    const changed = this.stateObj?.last_changed;
    if (!changed) return '';
    const date = new Date(changed);
    if (Date.now() - date.getTime() < 60_000) return localize(this.hass, 'just_now');
    return formatWeekdayTime(this.hass, date);
  }

  private subText(): string {
    if (this.isUnavailable) return localize(this.hass, 'unavailable');
    return `${localize(this.hass, 'since')} ${this.sinceText()}`;
  }

  private areaText(): string | undefined {
    return this.config?.area ?? this.areaName();
  }

  /** The orb is part of the card: tap and hold run the card's actions. */
  private orb(size = 52) {
    return html`<glowcard-orb
      .icon=${this.icon}
      .size=${size}
      ?active=${this.isActive}
      ?dark-icon=${this.darkIcon}
      label=${this.displayName}
    ></glowcard-orb>`;
  }

  private cardClass(extra: string): string {
    const s = this.isUnavailable ? 'unavailable' : this.glowing ? 'active' : '';
    return `glass sized ${extra} ${s}`;
  }

  private wrap(extra: string, inner: unknown) {
    return html`<div
      class=${this.cardClass(extra)}
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      ${inner}
    </div>`;
  }

  private dayLabel(d: DayStrip): string {
    return weekdayShort(this.hass, new Date(d.start), true);
  }

  private segments(d: DayStrip) {
    return d.segments.map(
      ([a, b]) =>
        html`<div
          class="seg"
          style="left:${((a / 24) * 100).toFixed(2)}%;width:${Math.max(((b - a) / 24) * 100, 2.5).toFixed(2)}%"
        ></div>`,
    );
  }

  private renderSmall() {
    const on = this.isActive;
    return this.wrap(
      'small',
      html`<div class="top">
          ${this.orb()}
          <span class="word ${on ? 'on' : ''}">${this.valueText()}</span>
        </div>
        <div class="titles">
          <span class="name small-name">${this.displayName}</span>
          <span class="sub">${this.subText()}</span>
        </div>`,
    );
  }

  private renderRow() {
    const on = this.isActive;
    return this.wrap(
      'row',
      html`${this.orb(40)}
        <div class="titles grow">
          <span class="row-name">${this.displayName}</span>
          <span class="row-area"
            >${this.isUnavailable ? localize(this.hass, 'unavailable') : (this.areaText() ?? '')}</span
          >
        </div>
        <span class="row-word ${on ? 'on' : ''}">${this.valueText()}</span>`,
    );
  }

  private chart(width: number, height: number, cls: string, dot = false) {
    const series = this.series;
    if (!series.length) return nothing;
    const { line, area, lastY } = chartPaths(series, width, height, niceMax(Math.max(...series)));
    const id = `switch-${cls}`;
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

  /** `show_power`: full width with watts, today's usage and the live curve. */
  private renderPower() {
    const on = this.isActive;
    const today = this.energy.today;
    const sub = this.isUnavailable
      ? localize(this.hass, 'unavailable')
      : today !== undefined
        ? `${this.word(on)} · ${localize(this.hass, 'today_lower')} ${this.kwh(today)}`
        : this.subText();
    return this.wrap(
      'power',
      html`<div class="top">
          <div class="head">
            ${this.orb()}
            <div class="titles">
              <span class="name">${this.displayName}</span>
              <span class="sub">${sub}</span>
            </div>
          </div>
          <span class="word big ${this.glowing ? 'on' : ''}">${this.valueText()}</span>
        </div>
        ${this.chart(900, 86, 'card-chart')}`,
    );
  }

  private renderGroup() {
    const items = this.groupItems;
    const onCount = items.filter((i) => this.hass?.states[i.entity]?.state === 'on').length;
    return this.wrap(
      'wide group',
      html`<div class="top">
          <div class="head">
            ${this.orb(52)}
            <div class="titles">
              <span class="name">${this.config?.name ?? ''}</span>
              <span class="sub"
                >${onCount} ${localize(this.hass, 'of')} ${items.length}
                ${localize(this.hass, 'on').toLowerCase()}</span
              >
            </div>
          </div>
          <span class="badge">${localize(this.hass, 'group')}</span>
        </div>
        <div class="chips">
          ${items.map((i) => {
            const st = this.hass?.states[i.entity]?.state;
            const isOn = st === 'on';
            return html`<button
              class="chip ${isOn ? 'on' : ''}"
              aria-pressed=${isOn ? 'true' : 'false'}
              ?disabled=${st === undefined || st === 'unavailable'}
              @pointerdown=${(e: Event) => e.stopPropagation()}
              @pointerup=${(e: Event) => e.stopPropagation()}
              @click=${this.toggleOne(i.entity)}
            >
              <span class="dot"></span>${i.name}
            </button>`;
          })}
        </div>`,
    );
  }

  render() {
    if (!this.config) return nothing;
    if (this.isGroup) return this.renderGroup();
    if (this.isMini) return this.renderRow();
    if (this.powerCard) return this.renderPower();
    return this.renderSmall();
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

  /** Power now, today / yesterday and the 2 h curve (only with a power sensor). */
  private renderPowerBlock() {
    if (!this.parts.power) return nothing;
    const w = this.power;
    const { today, yesterday } = this.energy;
    const now = Date.now();
    return html`<div class="now-row">
        <div class="now-power">
          <span class="label">${localize(this.hass, 'power_now')}</span>
          <span class="big-watts ${this.glowing ? 'on' : ''}"
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
        <div class="axis chart-axis">
          <span>${this.timeLabel(now - CHART_SPAN)}</span>
          <span>${this.timeLabel(now - CHART_SPAN / 2)}</span>
          <span>${localize(this.hass, 'now')}</span>
        </div>
      </div>`;
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
        html`<div class="set-row">
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
        html`<button class="set-row link" @click=${this.moreInfo(id)}>
          <span class="row-label">${localize(this.hass, key)}</span>
          <span class="row-value">${this.optionLabel(e.state)}</span>
        </button>`,
      );
    }
    return rows.length ? html`<div class="rows">${rows}</div>` : nothing;
  }

  protected renderPopup() {
    if (this.isGroup || !this.config?.entity) return undefined;
    const on = this.isActive;
    const { days, hours, count, log } = this.stats;
    const area = this.areaText();
    const kind = localize(this.hass, this.parts.power ? 'plug' : 'switch');
    const changed = this.stateObj ? new Date(this.stateObj.last_changed).getTime() : Date.now();
    const nowH = (() => {
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    })();
    return {
      heading: this.displayName,
      subtitle: area ? `${area} · ${kind}` : kind,
      content: html`<div class="since-row">
          <div class="since">
            <span class="label">${localize(this.hass, on ? 'on_since' : 'off_since')}</span>
            <span class="duration ${on ? 'on' : ''}"
              >${
                this.isUnavailable
                  ? localize(this.hass, 'unavailable')
                  : formatDuration(this.hass, Date.now() - changed)
              }</span
            >
          </div>
          <div class="stats">
            <span>${localize(this.hass, 'on_7_days')} <b>${formatHours(this.hass, hours)}</b></span>
            <span>${localize(this.hass, 'switched_on_count')} <b>${count}×</b></span>
          </div>
        </div>
        ${this.renderPowerBlock()} ${this.renderTimer()} ${this.renderSettings()}
        <div class="timeline">
          <span class="section">${localize(this.hass, 'last_7_days')}</span>
          ${days.map(
            (d) =>
              html`<div class="tl-row">
                <span class="tl-label ${d.today ? 'today' : ''}">${this.dayLabel(d)}</span>
                <div class="tl-bar">
                  ${this.segments(d)}
                  ${
                    d.today
                      ? html`<div
                          class="now"
                          style="left:${((nowH / 24) * 100).toFixed(1)}%"
                        ></div>`
                      : nothing
                  }
                </div>
              </div>`,
          )}
          <div class="axis">
            <span>0</span><span>6</span><span>12</span><span>18</span
            ><span>24 ${localize(this.hass, 'hour_axis')}</span>
          </div>
        </div>
        <div class="log">
          <span class="section">${localize(this.hass, 'last_changes')}</span>
          ${
            log.length === 0
              ? html`<span class="empty"
                  >${this.history ? localize(this.hass, 'no_history') : '…'}</span
                >`
              : log.map(
                  (l) =>
                    html`<div class="log-row">
                      <span class="dot ${l.state === 'on' ? 'on' : ''}"></span>
                      <span class="what"
                        >${localize(this.hass, l.state === 'on' ? 'turned_on' : 'turned_off')}</span
                      >
                      <span class="when">${formatLogDate(this.hass, new Date(l.start))}</span>
                    </div>`,
                )
          }
        </div>`,
    };
  }

  protected popupStyles() {
    return [switchShared, chartCss, popupCss];
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
        /* GlowSwitches board: slightly softer tint than the light card */
        --glow-lit-tint: 0.18;
        --glow-lit-border: 0.35;
        --glow-lit-shadow: 0 20px 48px -14px rgba(var(--glow-accent), 0.42);
        --glow-orb-glow: 0 0 18px rgba(var(--glow-accent), 0.5);
      }
      :host([dark]) {
        --glow-lit-tint: 0.2;
        --glow-lit-border: 0.28;
        --glow-lit-shadow: 0 24px 60px -14px rgba(var(--glow-accent), 0.45);
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
      .small {
        height: var(--glow-card-h);
      }
      .wide {
        height: var(--glow-card-h-wide);
      }
      .power {
        height: var(--glow-card-h-wide);
        padding-bottom: 0;
        overflow: hidden;
        justify-content: flex-start;
      }
      .glass.unavailable {
        opacity: 0.6;
      }
      .word.big {
        font-size: var(--glow-word-big);
        white-space: nowrap;
      }
      .card-chart {
        display: block;
        width: calc(100% + 2 * var(--glow-pad));
        margin: auto calc(-1 * var(--glow-pad)) 0;
        height: 92px;
        overflow: visible;
      }
      .row {
        height: 56px;
        border-radius: 22px;
        padding: 0 18px 0 12px;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
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
      .grow {
        flex-grow: 1;
        gap: 1px;
      }
      .small-name {
        font-size: var(--glow-name-small);
      }
      .name,
      .sub,
      .row-name,
      .row-area {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .word {
        color: var(--glow-muted);
      }
      .word.on,
      .row-word.on {
        color: var(--glow-text);
      }
      :host([dark]) .word.on,
      :host([dark]) .row-word.on {
        color: color-mix(in srgb, rgb(var(--glow-accent)) 62%, #ffffff);
      }
      .row-name {
        font-size: 14px;
        font-weight: 700;
      }
      .row-area {
        font-size: 12px;
        font-weight: 500;
        color: var(--glow-muted);
      }
      .row-word {
        white-space: nowrap;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--glow-muted);
      }
      .badge {
        padding: 5px 10px;
        border-radius: 999px;
        background: var(--glow-inset);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        color: var(--glow-muted);
      }
      .chips {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .chip {
        all: unset;
        box-sizing: border-box;
        height: 40px;
        border-radius: 14px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        background: var(--glow-inset);
        color: var(--glow-muted);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .chip.on {
        border-color: rgba(var(--glow-accent), 0.35);
        background: rgba(var(--glow-accent), 0.12);
        color: var(--glow-text);
      }
      :host([dark]) .chip.on {
        background: rgba(var(--glow-accent), 0.14);
      }
      .chip:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
      }
      .chip[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .chip .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        flex-shrink: 0;
        box-sizing: border-box;
        border: 1.5px solid var(--glow-muted);
      }
      .chip.on .dot {
        border: 0;
        background: rgb(var(--glow-accent));
        box-shadow: 0 0 8px rgba(var(--glow-accent), 0.9);
      }
    `,
    switchSharedCss(),
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

function switchSharedCss() {
  return css`
    .seg {
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 4px;
      background: rgb(var(--glow-accent));
      box-shadow: 0 0 6px rgba(var(--glow-accent), 0.6);
    }
    :host([dark]) .seg {
      box-shadow: 0 0 10px rgba(var(--glow-accent), 0.7);
    }
  `;
}

const switchShared = switchSharedCss();

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
  .now-power {
    display: flex;
    flex-direction: column;
  }
  .big-watts {
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: var(--glow-muted);
  }
  .big-watts.on {
    color: var(--glow-text);
  }
  :host([dark]) .big-watts.on {
    color: color-mix(in srgb, rgb(var(--glow-accent)) 62%, #ffffff);
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
  .axis.chart-axis {
    margin-left: 0;
  }
  .timer {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .set-row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 50px;
    padding: 10px 0;
    border-bottom: 1px solid var(--glow-line);
  }
  .set-row:last-child {
    border-bottom: 0;
  }
  .set-row.link {
    cursor: pointer;
  }
  .set-row:focus-visible,
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
  .since-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .since {
    display: flex;
    flex-direction: column;
  }
  .label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--glow-muted);
  }
  .duration {
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: var(--glow-muted);
  }
  .duration.on {
    color: var(--glow-text);
  }
  :host([dark]) .duration.on {
    color: color-mix(in srgb, rgb(var(--glow-accent)) 62%, #ffffff);
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
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section {
    font-size: 13px;
    font-weight: 700;
  }
  .tl-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tl-label {
    width: 24px;
    font-size: 11px;
    font-weight: 700;
    color: var(--glow-muted);
  }
  .tl-label.today {
    color: var(--glow-text);
  }
  .tl-bar {
    position: relative;
    flex-grow: 1;
    height: 10px;
    border-radius: 4px;
    background: var(--glow-inset);
  }
  .now {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    border-radius: 2px;
    background: var(--glow-text);
    opacity: 0.55;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-left: 32px;
    font-size: 10px;
    font-weight: 700;
    color: var(--glow-muted);
  }
  .log {
    display: flex;
    flex-direction: column;
  }
  .log .section {
    padding-bottom: 4px;
  }
  .log-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--glow-line);
  }
  .log-row .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    box-sizing: border-box;
    background: var(--glow-inset);
    border: 1px solid var(--glow-muted);
  }
  .log-row .dot.on {
    border: 0;
    background: rgb(var(--glow-accent));
    box-shadow: 0 0 8px rgba(var(--glow-accent), 0.8);
  }
  .what {
    flex-grow: 1;
    font-size: 13px;
    font-weight: 600;
  }
  .when,
  .empty {
    font-size: 12px;
    font-weight: 600;
    color: var(--glow-muted);
  }
  .empty {
    padding: 9px 0;
  }
`;

registerCard(
  {
    type: 'glowcard-switch',
    name: 'GlowCard Switch',
    description: 'Switch, smart plug or input_boolean with glow, 7-day history, power and popup',
  },
  GlowSwitchCard,
);

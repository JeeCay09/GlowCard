import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import {
  areaField,
  configForm,
  editorLabel,
  lookFields,
  sizeField,
  nameIconFields,
  variantField,
} from '../../core/editor';
import { localize } from '../../core/localize';
import {
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
  onPeriods,
  totalHours,
  type DayStrip,
  type StatePoint,
} from '../../core/history';
import type { HomeAssistant } from '../../types/hass';
import '../../components/orb';

export interface SwitchCardConfig extends GlowCardConfig {
  /** small (default), wide (7-day strip) or row (compact list row). */
  variant?: 'small' | 'wide' | 'row';
  /** Several switches → group card; the orb switches all of them. */
  entities?: (string | { entity: string; name?: string })[];
  /** Text under the name in wide/row; default: the entity's area. */
  area?: string;
}

const DAY_MS = 86_400_000;
const HISTORY_REFRESH_MS = 5 * 60_000;
const SWITCH_DOMAINS = ['switch', 'input_boolean'];

/** Switch card from the GlowSwitches board: small, wide, group and row variants plus popup. */
export class GlowSwitchCard extends GlowCardBase<SwitchCardConfig> {
  @state() private history?: StatePoint[];
  private historyTimer?: number;
  private historyFor?: string;

  protected popupStyle = 'glow' as const;

  static getConfigForm() {
    return configForm(
      [
        { name: 'entity', selector: { entity: { domain: SWITCH_DOMAINS } } },
        variantField(['small', 'wide', 'row']),
        nameIconFields,
        lookFields,
        sizeField,
        areaField,
        { name: 'entities', selector: { entity: { domain: SWITCH_DOMAINS, multiple: true } } },
      ],
      { color: 'color_helper', area: 'area_helper', entities: 'entities_helper' },
      (config) => {
        const list = config.entities;
        if (Array.isArray(list) && list.some((e) => typeof e !== 'string')) {
          throw new Error(editorLabel('yaml_only'));
        }
      },
    );
  }

  static getStubConfig(hass: HomeAssistant): Partial<SwitchCardConfig> {
    const entity = Object.keys(hass.states).find((id) => SWITCH_DOMAINS.includes(id.split('.')[0]));
    return { entity: entity ?? 'switch.example' };
  }

  protected validateConfig(config: SwitchCardConfig): void {
    if (!config.entity && !config.entities?.length) {
      throw new Error('Please define an entity or a list of entities');
    }
  }

  setConfig(config: SwitchCardConfig): void {
    super.setConfig(config);
    if (this.isGroup) this.defaultTapAction = { action: 'none' };
  }

  getCardSize(): number {
    if (this.config?.variant === 'row') return 1;
    return this.isGroup || this.config?.variant === 'wide' ? 4 : 3;
  }

  getGridOptions() {
    const wide = this.isGroup || this.config?.variant === 'wide' || this.config?.variant === 'row';
    return { columns: wide ? 6 : 3, rows: 'auto', min_columns: wide ? 6 : 3 };
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
    return this.isGroup ? this.groupItems.map((i) => i.entity) : super.watchedEntities();
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
    return !this.isGroup && (this.config?.variant === 'wide' || this.popupOpen);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.historyTimer = window.setInterval(() => this.loadHistory(true), HISTORY_REFRESH_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.historyTimer);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('hass') || changed.has('config')) {
      const key = `${this.config?.entity}|${this.stateObj?.last_changed}`;
      if (key !== this.historyFor) this.loadHistory(true);
    }
  }

  protected popupOpened(): void {
    this.loadHistory(false);
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

  // ---------- rendering ----------

  private word(on: boolean): string {
    return localize(this.hass, on ? 'on' : 'off');
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

  private orb(size = 52, onClick: (e: Event) => unknown = this.toggle) {
    return html`<glowcard-orb
      .icon=${this.icon}
      .size=${size}
      ?active=${this.isActive}
      ?dark-icon=${this.darkIcon}
      label=${this.displayName}
      @pointerdown=${(e: Event) => e.stopPropagation()}
      @pointerup=${(e: Event) => e.stopPropagation()}
      @click=${onClick}
    ></glowcard-orb>`;
  }

  private cardClass(extra: string): string {
    const s = this.isUnavailable ? 'unavailable' : this.isActive ? 'active' : '';
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
          <span class="word ${on ? 'on' : ''}">${this.isUnavailable ? '' : this.word(on)}</span>
        </div>
        <div class="titles">
          <span class="name small-name">${this.displayName}</span>
          <span class="sub">${this.subText()}</span>
        </div>`,
    );
  }

  private renderWide() {
    const on = this.isActive;
    const { days, hours } = this.stats;
    const area = this.areaText();
    const sub = this.isUnavailable
      ? localize(this.hass, 'unavailable')
      : `${area ? `${area} · ` : ''}${this.word(on).toLowerCase()} ${localize(this.hass, 'since')} ${this.sinceText()}`;
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
          <span class="word big ${on ? 'on' : ''}">${this.isUnavailable ? '' : this.word(on)}</span>
        </div>
        <div class="strip-wrap">
          <div class="strip-head">
            <span>${localize(this.hass, 'last_7_days')}</span>
            <span
              ><b>${formatHours(this.hass, hours)}</b>
              ${localize(this.hass, 'on').toLowerCase()}</span
            >
          </div>
          <div class="strip">
            ${days.map(
              (d) =>
                html`<div class="day">
                  <div class="bar">${this.segments(d)}</div>
                  <span class="day-label ${d.today ? 'today' : ''}">${this.dayLabel(d)}</span>
                </div>`,
            )}
          </div>
        </div>`,
    );
  }

  private renderRow() {
    const on = this.isActive;
    return this.wrap(
      'row',
      html`${this.orb(44)}
        <div class="titles grow">
          <span class="row-name">${this.displayName}</span>
          <span class="row-area"
            >${this.isUnavailable ? localize(this.hass, 'unavailable') : (this.areaText() ?? '')}</span
          >
        </div>
        <span class="row-word ${on ? 'on' : ''}">${this.isUnavailable ? '' : this.word(on)}</span>`,
    );
  }

  private renderGroup() {
    const items = this.groupItems;
    const onCount = items.filter((i) => this.hass?.states[i.entity]?.state === 'on').length;
    return this.wrap(
      'wide group',
      html`<div class="top">
          <div class="head">
            ${this.orb(52, this.toggleGroup)}
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
    if (this.config.variant === 'wide') return this.renderWide();
    if (this.config.variant === 'row') return this.renderRow();
    return this.renderSmall();
  }

  // ---------- popup ----------

  protected renderPopup() {
    if (this.isGroup || !this.config?.entity) return undefined;
    const on = this.isActive;
    const { days, hours, count, log } = this.stats;
    const area = this.areaText();
    const kind = localize(this.hass, 'switch');
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
    return [switchShared, popupCss];
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
      .row {
        height: 68px;
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
      .word.big {
        font-size: var(--glow-word-big);
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
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--glow-muted);
      }
      .strip-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .strip-head {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .strip-head b {
        font-weight: 800;
        color: var(--glow-text);
      }
      .strip {
        display: flex;
        gap: 4px;
      }
      .day {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: center;
      }
      .bar {
        position: relative;
        width: 100%;
        height: 12px;
        border-radius: 4px;
        background: var(--glow-inset);
      }
      .day-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--glow-muted);
      }
      .day-label.today {
        color: var(--glow-text);
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
  ];
}

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
  :host([dark]) {
    --glow-inset: rgba(255, 255, 255, 0.07);
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
    description: 'Switch or input_boolean with glow, 7-day history and popup',
  },
  GlowSwitchCard,
);

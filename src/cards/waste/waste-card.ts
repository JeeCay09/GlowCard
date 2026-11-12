import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { handleAction, type ActionConfig } from '../../core/action';
import { rgbTriplet, type Rgb } from '../../core/color';
import { orbLitBackground } from '../../core/orb-style';
import { registerCard } from '../../core/register';
import {
  actionsField,
  configForm,
  editorLabel,
  fontField,
  lookSection,
  sizeField,
  type GestureSpec,
} from '../../core/editor';
import { language } from '../../core/localize';
import type { HomeAssistant } from '../../types/hass';
import {
  dayLabel,
  daysUntil,
  joinNames,
  longDate,
  nextAndLater,
  pickupFromSensor,
  pickupsFromCalendarState,
  pickupsFromEvents,
  relativeDay,
  shortDate,
  startOfDay,
  upcoming,
  wt,
  type BinOverride,
  type CalendarEvent,
  type Pickup,
} from './waste-logic';

export interface WasteCardConfig extends GlowCardConfig {
  /** Calendars and/or sensors with the pickups. */
  entities?: string[];
  /** Name, icon and colour per bin (YAML), matched by part of the name. */
  bins?: BinOverride[];
  /** The card glows from this many days before a pickup: 0 = on the day, 1 = from the day before. */
  highlight_days?: number | string;
}

const WASTE_GESTURES: GestureSpec = {
  modes: {
    tap: ['popup', 'more-info', 'navigate', 'url', 'perform-action', 'none'],
    hold: ['more-info', 'popup', 'navigate', 'url', 'perform-action', 'none'],
  },
  defaults: { tap: 'popup', hold: 'more-info' },
};

/** Calendar events are loaded for this many days; the popup shows three weeks. */
const LOOKAHEAD_DAYS = 35;
const RELOAD_MS = 30 * 60_000;
const MAX_LATER = 3;
const AGENDA_ROWS = 6;

/** Sizes of the compact card (phones, two grid rows). */
const compactWaste = css`
  --w-gap: 12px;
  --w-later-gap: 6px;
  --w-later-pad: 8px;
  --w-box-r: 13px;
  --w-box-pad: 6px 10px;
  --w-box-gap: 1px;
  --w-bin: 12px;
  --w-bin-gap: 6px;
  --w-dot: 8px;
  --w-date: 14px;
  --w-rel: 11px;
`;

const tone = (rgb: Rgb) => `--glow-accent:${rgbTriplet(rgb)}`;

/**
 * Waste collection card (issue #151, mockup variant B "Nächste Abholung"): the next
 * pickup large, the following bins in small boxes below. The card glows in the bin's
 * colour on the day before and on the day itself. Tap opens the popup with a
 * three week calendar and the next dates, hold the source entity's more info.
 */
export class GlowWasteCard extends GlowCardBase<WasteCardConfig> {
  protected defaultTapAction: ActionConfig = { action: 'popup' };
  protected defaultHoldAction: ActionConfig = { action: 'more-info' };

  /** Pickups loaded from calendars, per calendar entity. */
  private events = new Map<string, Pickup[]>();
  private loadedAt = 0;
  private loadedDay = '';
  private loading = false;
  private calendarStamp = '';

  static getConfigForm() {
    const form = configForm(
      [
        {
          name: 'entities',
          required: true,
          selector: { entity: { domain: ['calendar', 'sensor'], multiple: true } },
        },
        {
          name: 'highlight_days',
          default: '1',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['0', '1', '2'].map((v) => ({
                value: v,
                label: editorLabel(`waste_highlight_${v}` as 'waste_highlight_1'),
              })),
            },
          },
        },
        lookSection({
          name: '',
          type: 'grid',
          schema: [{ name: 'name', selector: { text: {} } }, fontField, sizeField],
        }),
        actionsField,
      ],
      { entities: 'waste_entities_helper', name: 'waste_name_helper' },
      undefined,
      (config) =>
        typeof config.highlight_days === 'number'
          ? { ...config, highlight_days: String(config.highlight_days) }
          : config,
    );
    // `entities` means group members on the switch card; here it is the pickup sources.
    const label = form.computeLabel;
    form.computeLabel = (s) =>
      s.name === 'entities'
        ? editorLabel('waste_entities')
        : s.name === 'highlight_days'
          ? editorLabel('waste_highlight')
          : label(s);
    return form;
  }

  /** Tap opens the GlowCard popup, hold the next bin's calendar or sensor. */
  static gestureSpec(): GestureSpec {
    return WASTE_GESTURES;
  }

  /** No source is picked for the user; the card asks for one until it is chosen. */
  static getStubConfig(): Partial<WasteCardConfig> {
    return { entities: [] };
  }

  protected validateConfig(config: WasteCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.entities !== undefined && !Array.isArray(config.entities)) {
      throw new Error('"entities" must be a list');
    }
    if (config.bins !== undefined && !Array.isArray(config.bins)) {
      throw new Error('"bins" must be a list');
    }
    const days = Number(config.highlight_days ?? 1);
    if (!Number.isInteger(days) || days < 0 || days > 7) {
      throw new Error('"highlight_days" must be a whole number from 0 to 7');
    }
  }

  setConfig(config: WasteCardConfig): void {
    super.setConfig(config);
    this.events.clear();
    this.loadedAt = 0;
  }

  private get sources(): string[] {
    const c = this.config;
    if (!c) return [];
    return [...(c.entities ?? []), ...(c.entity ? [c.entity] : [])].filter(
      (id) => typeof id === 'string' && id.includes('.'),
    );
  }

  private get calendars(): string[] {
    return this.sources.filter((id) => id.startsWith('calendar.'));
  }

  protected watchedEntities(): string[] {
    return this.sources;
  }

  getCardSize(): number {
    return 3;
  }

  /**
   * Fixed height on HA's grid: 3 rows (2 when compact). Full width by default; the boxes
   * need at least half a section, below that the card shows fewer of them.
   */
  getGridOptions() {
    return this.gridOptions(12, this.gridSize === 'compact' ? 2 : 3, 6);
  }

  // ---------- data ----------

  private get highlightDays(): number {
    return Number(this.config?.highlight_days ?? 1);
  }

  private get pickups(): Pickup[] {
    const hass = this.hass;
    if (!hass) return [];
    const bins = this.config?.bins ?? [];
    const all: Pickup[] = [];
    for (const id of this.sources) {
      const st = hass.states[id];
      if (id.startsWith('calendar.')) {
        const loaded = this.events.get(id);
        if (loaded) all.push(...loaded);
        else if (st) all.push(...pickupsFromCalendarState(st, bins));
      } else if (st) {
        const p = pickupFromSensor(st, bins);
        if (p) all.push(p);
      }
    }
    return upcoming(all);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('hass') || changed.has('config')) void this.loadEvents();
  }

  /** Loads calendar events: on start, every 30 min, on a new day and when a calendar changes. */
  private async loadEvents(): Promise<void> {
    const hass = this.hass;
    const cals = this.calendars;
    if (!hass?.callApi || !cals.length || this.loading) return;
    const stamp = cals.map((id) => hass.states[id]?.last_updated ?? '').join('|');
    const today = startOfDay(new Date()).toDateString();
    const fresh =
      Date.now() - this.loadedAt < RELOAD_MS &&
      this.loadedDay === today &&
      stamp === this.calendarStamp;
    if (fresh) return;
    this.loading = true;
    this.calendarStamp = stamp;
    this.loadedDay = today;
    const start = startOfDay(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + LOOKAHEAD_DAYS);
    const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    try {
      await Promise.all(
        cals.map(async (id) => {
          try {
            const events = await hass.callApi!<CalendarEvent[]>('GET', `calendars/${id}?${range}`);
            this.events.set(id, pickupsFromEvents(id, events ?? [], this.config?.bins));
          } catch {
            this.events.delete(id);
          }
        }),
      );
      this.loadedAt = Date.now();
    } finally {
      this.loading = false;
    }
    this.requestUpdate();
  }

  // ---------- state for the base card ----------

  private get nextDay(): Pickup[] {
    return nextAndLater(this.pickups).next;
  }

  private get nextDays(): number | undefined {
    const p = this.nextDay[0];
    return p ? daysUntil(p.date) : undefined;
  }

  protected get isActive(): boolean {
    const d = this.nextDays;
    return d !== undefined && d <= this.highlightDays;
  }

  protected get isUnavailable(): boolean {
    return false;
  }

  protected get accent(): Rgb {
    return this.nextDay[0]?.color ?? super.accent;
  }

  protected get icon(): string {
    return this.config?.icon ?? this.nextDay[0]?.icon ?? 'mdi:trash-can-outline';
  }

  /** Nothing to switch: the popup orb does nothing. */
  protected async toggleMain(): Promise<void> {}

  /** Actions work on the next bin's source (more info), not on a single `entity`. */
  protected async runAction(kind: 'tap' | 'hold'): Promise<void> {
    if (!this.hass || !this.config) return;
    const action =
      kind === 'tap'
        ? (this.config.tap_action ?? this.defaultTapAction)
        : (this.config.hold_action ?? this.defaultHoldAction);
    await handleAction(
      {
        element: this,
        hass: this.hass,
        entity: this.nextDay[0]?.entity ?? this.sources[0],
        openPopup: this.openPopup,
      },
      action,
    );
  }

  protected get popupCalm(): boolean {
    return !this.isActive;
  }

  // ---------- card ----------

  private orbs(list: Pickup[], lit: boolean): TemplateResult {
    return html`<div class="orbs">
      ${list.map(
        (p) =>
          html`<glowcard-orb
            style=${tone(p.color)}
            .icon=${p.icon}
            ?active=${lit}
            ?calm=${!lit}
            .label=${p.name}
          ></glowcard-orb>`,
      )}
    </div>`;
  }

  private box(p: Pickup, hass: HomeAssistant | undefined): TemplateResult {
    return html`<div class="box" style=${tone(p.color)}>
      <div class="bin"><span class="dot"></span><span class="ellip">${p.name}</span></div>
      <div class="date">
        <b>${dayLabel(hass, p.date)}</b><span>${relativeDay(hass, daysUntil(p.date))}</span>
      </div>
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const hass = this.hass;
    const { next, later } = nextAndLater(this.pickups);
    const lit = this.isActive;
    const days = this.nextDays;
    const empty = !next.length;
    const sub = empty
      ? this.sources.length
        ? this.loading
          ? wt(hass, 'loading')
          : ''
        : wt(hass, 'no_pickups_sub')
      : `${shortDate(hass, next[0].date)}${days === 1 ? ` · ${wt(hass, 'put_out_today')}` : ''}`;
    return html`<div
      class="glass sized card ${lit ? 'active' : ''} ${later.length ? '' : 'solo'}"
      role="button"
      tabindex="0"
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointercancel=${this.press.cancel}
      @pointermove=${this.press.move}
      @keydown=${this.key}
    >
      <div class="hero">
        ${
          empty
            ? html`<div class="orbs"><glowcard-orb .icon=${this.icon}></glowcard-orb></div>`
            : this.orbs(next, lit)
        }
        <div class="txt">
          ${empty ? nothing : html`<div class="when-inline">${relativeDay(hass, days ?? 0)}</div>`}
          <div class="name ellip">${empty ? wt(hass, 'no_pickups') : joinNames(hass, next)}</div>
          ${sub ? html`<div class="sub ellip">${sub}</div>` : nothing}
        </div>
        ${empty ? nothing : html`<div class="when">${relativeDay(hass, days ?? 0)}</div>`}
      </div>
      ${
        later.length
          ? html`<div class="later">
              ${later.slice(0, MAX_LATER).map((p) => this.box(p, hass))}
            </div>`
          : nothing
      }
    </div>`;
  }

  private key = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    void this.runAction('tap');
  };

  // ---------- popup ----------

  protected renderPopup() {
    const hass = this.hass;
    const list = this.pickups;
    const next = this.nextDay;
    const heading = this.config?.name ?? wt(hass, 'title');
    const subtitle = next.length
      ? `${relativeDay(hass, daysUntil(next[0].date))}: ${joinNames(hass, next)}`
      : wt(hass, 'no_pickups');
    return {
      heading,
      subtitle,
      content: html`${this.calendar(list, hass)}
        <div class="agenda">
          ${list.slice(0, AGENDA_ROWS).map((p) => {
            const d = daysUntil(p.date);
            const hot = d <= this.highlightDays;
            return html`<div class="ag" style=${tone(p.color)}>
              <div class="dt">
                <b>${p.date.getDate()}</b
                ><span
                  >${new Intl.DateTimeFormat(language(hass), { weekday: 'short' })
                    .format(p.date)
                    .replace(/\.$/, '')}</span
                >
              </div>
              <glowcard-orb .icon=${p.icon} .size=${36} ?active=${hot} ?calm=${!hot}></glowcard-orb>
              <div class="agt">
                <div class="agn ellip">${p.name}</div>
                <div class="ags ellip">${longDate(hass, p.date)}</div>
              </div>
              <div class="rel ${hot ? 'hot' : ''}">${relativeDay(hass, d)}</div>
            </div>`;
          })}
        </div>`,
    };
  }

  /** Three weeks from this week's Monday, with a dot per bin on pickup days. */
  private calendar(list: Pickup[], hass: HomeAssistant | undefined): TemplateResult {
    const today = startOfDay(new Date());
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const fmt = new Intl.DateTimeFormat(language(hass), { weekday: 'short' });
    const heads = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return fmt.format(d).replace(/\.$/, '').slice(0, 2);
    });
    const cells = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const hits = list.filter((p) => p.date.getTime() === d.getTime());
      const past = d < today;
      return html`<div
        class="c ${past ? 'past' : ''} ${d.getTime() === today.getTime() ? 'today' : ''} ${hits.length && !past ? 'hit' : ''}"
        style=${hits.length ? tone(hits[0].color) : ''}
      >
        ${d.getDate()}
        <div class="dots">${hits.map((p) => html`<i style=${tone(p.color)}></i>`)}</div>
      </div>`;
    });
    return html`<div class="cal">
      ${heads.map((h) => html`<div class="wd">${h}</div>`)}${cells}
    </div>`;
  }

  protected popupStyles() {
    return [
      css`
        .cal {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .wd {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: var(--glow-muted);
          padding-bottom: 2px;
        }
        .c {
          height: 42px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 14px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .c.past {
          opacity: 0.35;
        }
        .c.today {
          background: var(--glow-inset);
        }
        .c.hit {
          background: rgba(var(--glow-accent), 0.14);
        }
        .dots {
          display: flex;
          gap: 3px;
          height: 6px;
        }
        .dots i {
          width: 6px;
          height: 6px;
          border-radius: 99px;
          background: rgb(var(--glow-accent));
        }
        .agenda {
          display: flex;
          flex-direction: column;
        }
        .ag {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 2px;
          border-bottom: 1px solid var(--glow-line);
        }
        .ag:last-child {
          border-bottom: 0;
        }
        .dt {
          width: 34px;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
        }
        .dt b {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .dt span {
          font-size: 11px;
          font-weight: 700;
          color: var(--glow-muted);
          text-transform: uppercase;
        }
        .agt {
          min-width: 0;
          flex: 1;
        }
        .agn {
          font-size: 15px;
          font-weight: 700;
        }
        .ags {
          font-size: 13px;
          font-weight: 500;
          color: var(--glow-muted);
        }
        .ellip {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .rel {
          white-space: nowrap;
          font-size: 13px;
          font-weight: 700;
          color: var(--glow-muted);
        }
        .rel.hot {
          color: color-mix(in srgb, rgb(var(--glow-accent)) 75%, var(--glow-text));
        }
      `,
    ];
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        --w-gap: 16px;
        --w-later-gap: 8px;
        --w-later-pad: 12px;
        --w-box-r: 16px;
        --w-box-pad: 9px 12px;
        --w-box-gap: 4px;
        --w-bin: 13px;
        --w-bin-gap: 7px;
        --w-dot: 10px;
        --w-date: 17px;
        --w-rel: 12px;
        display: block;
        container-type: inline-size;
        -webkit-tap-highlight-color: transparent;
      }
      .card {
        height: var(--glow-card-h);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        overflow: hidden;
      }
      .card:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: 2px;
      }
      .card.solo {
        justify-content: center;
      }
      .hero {
        display: flex;
        align-items: center;
        gap: var(--w-gap);
        min-width: 0;
      }
      .orbs {
        display: flex;
        flex-shrink: 0;
      }
      .orbs glowcard-orb + glowcard-orb {
        margin-left: calc(var(--glow-orb-size) * -0.28);
      }
      .txt {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .ellip {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .when {
        flex-shrink: 0;
        font-size: var(--glow-value-size);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
      }
      .when-inline {
        display: none;
        font-size: var(--glow-word-size);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.1;
      }
      .later {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: var(--w-later-gap);
        padding-top: var(--w-later-pad);
        border-top: 1px solid var(--glow-line);
      }
      .box {
        min-width: 0;
        border-radius: var(--w-box-r);
        background: var(--glow-inset);
        padding: var(--w-box-pad);
        display: flex;
        flex-direction: column;
        gap: var(--w-box-gap);
      }
      .bin {
        display: flex;
        align-items: center;
        gap: var(--w-bin-gap);
        font-size: var(--w-bin);
        font-weight: 700;
        min-width: 0;
      }
      .dot {
        flex-shrink: 0;
        width: var(--w-dot);
        height: var(--w-dot);
        border-radius: 99px;
        background: ${orbLitBackground('rgb(var(--glow-accent))')};
        box-shadow: 0 0 8px rgba(var(--glow-accent), 0.7);
      }
      .date {
        display: flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
      }
      .date b {
        font-size: var(--w-date);
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .date span {
        font-size: var(--w-rel);
        font-weight: 600;
        color: var(--glow-muted);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @media (max-width: 600px) {
        :host(:not([size='normal'])) {
          ${compactWaste}
        }
      }
      :host([size='compact']) {
        ${compactWaste}
      }
      /* Narrow cards show fewer boxes; the relative day moves into the box's second line. */
      @container (max-width: 420px) {
        .box:nth-child(n + 3) {
          display: none;
        }
      }
      @container (max-width: 300px) {
        .box:nth-child(n + 2) {
          display: none;
        }
        .hero {
          --w-gap: 10px;
        }
        .when,
        .hero .sub {
          display: none;
        }
        .when-inline {
          display: block;
        }
        .hero .name {
          font-size: var(--glow-sub-size);
          font-weight: 600;
          color: var(--glow-muted);
        }
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-waste',
    name: 'GlowCard Waste collection',
    description: 'Next waste pickup from a calendar or date sensors, with the bins that follow',
    domains: ['calendar'],
  },
  GlowWasteCard,
);

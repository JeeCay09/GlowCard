import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import { configForm, editorLabel, fontField, lookSection } from '../../core/editor';
import { PressController } from '../../core/press';
import { rgbTriplet, resolveAccent, type Rgb } from '../../core/color';
import type { HassEntity } from '../../types/hass';
import {
  CoverAccents,
  F,
  call,
  coverUrl,
  duration,
  groupMembers,
  isLit,
  isOff,
  isPlaying,
  mt,
  nowPlaying,
  playerIcon,
  powerAction,
  shortName,
  stateWord,
  supports,
  tapAction,
  volumePct,
} from './media-logic';
import {
  coverArt,
  ctrlButton,
  mediaBits,
  playerPopupContent,
  playerPopupStyles,
  playerSubtitle,
} from './media-popup';
import '../../components/orb';
import '../../components/marquee';
import '../../components/slider';

export interface MediaRoomEntry {
  entity: string;
  name?: string;
  icon?: string;
}

export interface MediaRoomsCardConfig extends GlowCardConfig {
  /** The players, one row each (entity id or `{ entity, name, icon }`). */
  entities?: (string | MediaRoomEntry)[];
}

/** HA grid: one row of 56 px + 8 px gap per player, plus one for the heading. */
const ROW = 64;
const MAX_ROWS = 12;

/**
 * Rooms card (issue #153, mockup variant C): several players in one card, one grid row
 * each. Playing rows glow in their cover's colour; a thin volume bar can be dragged.
 * Tap a row = play/pause (switch on when off), hold a row = that player's popup.
 */
export class GlowMediaRoomsCard extends GlowCardBase<MediaRoomsCardConfig> {
  protected defaultColor = 'violet';
  /** Player whose popup is open. */
  @state() private popupId?: string;
  private pressed?: string;
  private covers = new CoverAccents(() => this.requestUpdate());
  private ticker?: number;

  protected press = new PressController(
    this,
    () => tapAction(this.hass, this.st(this.pressed)),
    () => {
      if (!this.pressed) return;
      this.popupId = this.pressed;
      this.openPopup();
    },
  );

  static getConfigForm() {
    const form = configForm(
      [
        {
          name: 'entities',
          required: true,
          selector: { entity: { domain: ['media_player'], multiple: true } },
        },
        lookSection({ name: 'name', selector: { text: {} } }, fontField),
      ],
      { entities: 'media_entities_helper', name: 'media_name_helper' },
    );
    const label = form.computeLabel;
    form.computeLabel = (s) => (s.name === 'entities' ? editorLabel('media_entities') : label(s));
    return form;
  }

  /** No gestures to choose: rows always play/pause on tap and open the popup on hold. */
  static gestureSpec(): undefined {
    return undefined;
  }

  static getStubConfig(): Partial<MediaRoomsCardConfig> {
    return { entities: [] };
  }

  protected validateConfig(config: MediaRoomsCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.entities !== undefined && !Array.isArray(config.entities)) {
      throw new Error('"entities" must be a list');
    }
  }

  private get rows(): MediaRoomEntry[] {
    return (this.config?.entities ?? [])
      .map((e) => (typeof e === 'string' ? { entity: e } : e))
      .filter((e): e is MediaRoomEntry => typeof e?.entity === 'string' && e.entity.includes('.'))
      .slice(0, MAX_ROWS - 1);
  }

  private st(id: string | undefined): HassEntity | undefined {
    return id ? this.hass?.states[id] : undefined;
  }

  protected watchedEntities(): string[] {
    if (this.popupOpen && this.hass) {
      return Object.keys(this.hass.states).filter((id) => id.startsWith('media_player.'));
    }
    return this.rows.map((r) => r.entity);
  }

  getCardSize(): number {
    return 1 + Math.max(1, this.rows.length);
  }

  /** Heading row + one grid row per player, full width (at least half). */
  getGridOptions() {
    return this.gridOptions(12, 1 + Math.max(1, this.rows.length), 6);
  }

  // ---------- popup player (base card hooks) ----------

  protected get stateObj(): HassEntity | undefined {
    return this.st(this.popupId);
  }

  protected get isActive(): boolean {
    return isLit(this.stateObj);
  }

  protected get isUnavailable(): boolean {
    return !!this.popupId && (!this.stateObj || this.stateObj.state === 'unavailable');
  }

  private colorOf(st: HassEntity | undefined): Rgb {
    return this.covers.get(st) ?? resolveAccent(this.config?.color, this.dark, this.defaultColor);
  }

  protected get accent(): Rgb {
    return this.colorOf(this.stateObj);
  }

  private entry(id: string | undefined): MediaRoomEntry | undefined {
    return this.rows.find((r) => r.entity === id);
  }

  private nameOf(id: string): string {
    return this.entry(id)?.name ?? shortName(this.hass, id);
  }

  protected get displayName(): string {
    return this.popupId ? this.nameOf(this.popupId) : (this.config?.name ?? mt(this.hass, 'media'));
  }

  protected get icon(): string {
    return this.entry(this.popupId)?.icon ?? playerIcon(this.stateObj);
  }

  protected toggle = async (ev?: Event): Promise<void> => {
    ev?.stopPropagation();
    powerAction(this.hass, this.stateObj);
  };

  protected async toggleMain(): Promise<void> {
    tapAction(this.hass, this.stateObj);
  }

  protected popupClosed(): void {
    this.popupId = undefined;
  }

  protected renderPopup() {
    if (!this.popupId) return undefined;
    return {
      heading: this.displayName,
      subtitle: playerSubtitle(this.hass, this.stateObj),
      content: playerPopupContent(this.hass, this.stateObj),
    };
  }

  protected popupStyles() {
    return playerPopupStyles;
  }

  // ---------- progress clock (popup only) ----------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const st = this.stateObj;
    const tick = this.popupOpen && isPlaying(st) && duration(st) !== undefined;
    if (tick && !this.ticker) {
      this.ticker = window.setInterval(() => this.requestUpdate(), 1000);
    } else if (!tick && this.ticker) {
      window.clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  // ---------- card ----------

  private down(id: string) {
    return (ev: PointerEvent) => {
      this.pressed = id;
      this.press.down(ev);
    };
  }

  private row(r: MediaRoomEntry): TemplateResult {
    const st = this.st(r.entity);
    const off = isOff(st);
    const lit = isLit(st);
    const playing = isPlaying(st);
    const { title, artist } = nowPlaying(st);
    const members = groupMembers(st);
    const others = members[0] === r.entity ? members.slice(1) : [];
    const line = off
      ? stateWord(this.hass, st)
      : title
        ? `${st?.state === 'paused' ? `${stateWord(this.hass, st)} · ` : ''}${[title, artist].filter(Boolean).join(' · ')}`
        : stateWord(this.hass, st);
    const vol = volumePct(st);
    const canPlay = supports(st, F.PAUSE) || supports(st, F.PLAY);
    const icon = r.icon ?? playerIcon(st);
    return html`<div
      class="r ${lit ? 'lit' : ''} ${st?.state === 'unavailable' ? 'na' : ''}"
      style="--glow-accent:${rgbTriplet(this.colorOf(st))}"
      role="button"
      tabindex="0"
      aria-label=${this.nameOf(r.entity)}
      @pointerdown=${this.down(r.entity)}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
      @keydown=${(e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        tapAction(this.hass, st);
      }}
    >
      ${
        !off && coverUrl(st)
          ? coverArt(st, 'round')
          : html`<glowcard-orb
              .icon=${icon}
              .size=${40}
              ?active=${lit}
              ?calm=${!lit && !off}
            ></glowcard-orb>`
      }
      <div class="txt">
        <div class="rn">
          <span class="rname">${this.nameOf(r.entity)}</span>
          ${others.length && !off ? html`<span class="grp">+ ${others.map((o) => this.nameOf(o)).join(', ')}</span>` : nothing}
        </div>
        <glowcard-marquee class="rline" .text=${line} .run=${playing}></glowcard-marquee>
        ${
          !off && supports(st, F.VOLUME_SET) && vol !== undefined
            ? html`<glowcard-slider
                plain
                class="rvol"
                .value=${vol}
                label=${mt(this.hass, 'volume')}
                live
                @pointerdown=${(e: Event) => e.stopPropagation()}
                @pointerup=${(e: Event) => e.stopPropagation()}
                @value-live=${(e: CustomEvent<{ value: number }>) =>
                  call(this.hass, 'volume_set', r.entity, { volume_level: e.detail.value / 100 })}
                @value-changed=${(e: CustomEvent<{ value: number }>) =>
                  call(this.hass, 'volume_set', r.entity, { volume_level: e.detail.value / 100 })}
              ></glowcard-slider>`
            : nothing
        }
      </div>
      ${
        !off && canPlay
          ? ctrlButton(
              playing ? 'mdi:pause' : 'mdi:play',
              mt(this.hass, playing ? 'pause' : 'play'),
              () => call(this.hass, 'media_play_pause', r.entity),
              `main ${lit ? '' : 'idle'}`,
            )
          : nothing
      }
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const rows = this.rows;
    const active = rows.filter((r) => isLit(this.st(r.entity))).length;
    const height = (1 + Math.max(1, rows.length)) * ROW - 8;
    return html`<div class="glass card" style="height:${height}px">
      <div class="hd">
        <span class="name">${this.config.name ?? mt(this.hass, 'media')}</span>
        ${active ? html`<span class="sub">${active} ${mt(this.hass, 'active')}</span>` : nothing}
      </div>
      ${rows.length ? rows.map((r) => this.row(r)) : html`<div class="empty sub">${editorLabel('media_entities_helper')}</div>`}
    </div>`;
  }

  static styles = [
    ...GlowCardBase.styles,
    mediaBits,
    css`
      :host {
        display: block;
        -webkit-tap-highlight-color: transparent;
      }
      .card {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow: hidden;
        user-select: none;
      }
      .hd {
        flex-shrink: 0;
        /* 38 + 2 px border: heading + rows fill the grid rows exactly. */
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 10px;
        white-space: nowrap;
      }
      .hd .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hd .sub {
        flex-shrink: 0;
        line-height: 1.25;
      }
      .r {
        flex-shrink: 0;
        box-sizing: border-box;
        height: 58px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 9px 0 8px;
        border-radius: 20px;
        border: 1px solid transparent;
        cursor: pointer;
        transition:
          background 0.3s,
          border-color 0.3s,
          box-shadow 0.3s;
      }
      .r:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: -2px;
      }
      .r.lit {
        background: linear-gradient(
          160deg,
          rgba(var(--glow-accent), var(--glow-lit-tint)),
          var(--glow-lit-base) 70%
        );
        border-color: rgba(var(--glow-accent), var(--glow-lit-border));
        box-shadow: 0 14px 36px -14px rgba(var(--glow-accent), 0.55);
      }
      .r.na {
        opacity: 0.55;
      }
      .cover.round {
        --cv: 40px;
        border-radius: 999px;
        box-shadow: none;
      }
      .r.lit .cover.round {
        box-shadow: var(--glow-orb-glow);
      }
      .txt {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .rn {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        white-space: nowrap;
      }
      .rname {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.25;
      }
      .grp {
        flex-shrink: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(var(--glow-accent), 0.16);
        color: color-mix(in srgb, rgb(var(--glow-accent)) 70%, var(--glow-text));
      }
      .rline {
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--glow-muted);
      }
      .rvol {
        /* The row's own colour, not the card's. */
        --glow-fill-h: rgb(var(--glow-accent));
        --glow-slider-hit: 12px;
        --glow-slider-bar: 5px;
        margin-top: 2px;
      }
      .btn.main {
        --b-main: 40px;
      }
      .empty {
        padding: 0 10px;
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-media-rooms',
    name: 'GlowCard Media rooms',
    description: 'Several media players in one card, one row each',
  },
  GlowMediaRoomsCard,
);

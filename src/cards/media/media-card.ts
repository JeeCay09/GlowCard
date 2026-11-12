import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { GlowCardBase, stubEntity, type GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import {
  actionsField,
  configForm,
  lookFields,
  lookSection,
  nameIconFields,
  sizeField,
} from '../../core/editor';
import type { Rgb } from '../../core/color';
import type { HassEntity } from '../../types/hass';
import {
  CoverAccents,
  F,
  call,
  clock,
  coverUrl,
  duration,
  isLit,
  isOff,
  isPlaying,
  mt,
  nowPlaying,
  playerIcon,
  position,
  powerAction,
  progress,
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

export type MediaCardConfig = GlowCardConfig;

/** Sizes of the compact card (phones, two grid rows). */
const compactMedia = css`
  --m-wide-pad: 12px;
  --m-wide-gap: 12px;
  --m-cv-max: 96px;
  --m-title: 15px;
  --m-artist: 12px;
  --b-size: 34px;
  --b-main: 38px;
  --m-tile-btn: 36px;
  --m-prog-gap: 6px;
  --m-pill-h: 30px;
`;

/**
 * Media card (issue #153): one media_player. Half width (6 of 12 columns) it is a tile
 * with the round cover, title and a thin progress line; widened to 300 px and more it
 * becomes the wide card with a big cover, controls and volume. The glow colour comes
 * from the cover (violet without one). Tap = play/pause (switch on when off),
 * hold = GlowCard popup with all controls; the popup orb switches the player on/off.
 */
export class GlowMediaCard extends GlowCardBase<MediaCardConfig> {
  protected defaultColor = 'violet';
  private covers = new CoverAccents(() => this.requestUpdate());
  private ticker?: number;

  static getConfigForm() {
    return configForm(
      [
        { name: 'entity', required: true, selector: { entity: { domain: ['media_player'] } } },
        lookSection(nameIconFields, lookFields, sizeField),
        actionsField,
      ],
      { color: 'color_media_helper' },
    );
  }

  static getStubConfig(): Partial<MediaCardConfig> {
    return stubEntity();
  }

  getCardSize(): number {
    return 3;
  }

  /** Fixed rows on HA's grid (3, compact 2); half width by default, wider = wide layout. */
  getGridOptions() {
    return this.gridOptions(6, this.gridSize === 'compact' ? 2 : 3, 6);
  }

  /** The popup also lists the other players to group with. */
  protected watchedEntities(): string[] {
    if (!this.popupOpen || !this.hass) return super.watchedEntities();
    return Object.keys(this.hass.states).filter((id) => id.startsWith('media_player.'));
  }

  protected get isActive(): boolean {
    return isLit(this.stateObj);
  }

  protected get isUnavailable(): boolean {
    return !this.stateObj || this.stateObj.state === 'unavailable';
  }

  /** Cover colour, unless a fixed colour is set. */
  protected get accent(): Rgb {
    const c = this.config?.color;
    if (c && c !== 'auto') return super.accent;
    return this.covers.get(this.stateObj) ?? super.accent;
  }

  protected get icon(): string {
    return this.config?.icon ?? playerIcon(this.stateObj);
  }

  protected async toggleMain(): Promise<void> {
    tapAction(this.hass, this.stateObj);
  }

  /** Popup orb: on/off instead of play/pause. */
  protected toggle = async (ev?: Event): Promise<void> => {
    ev?.stopPropagation();
    powerAction(this.hass, this.stateObj);
  };

  // ---------- progress clock ----------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const st = this.stateObj;
    const tick = isPlaying(st) && duration(st) !== undefined;
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

  private texts(st: HassEntity | undefined): { title: string; sub: string } {
    const off = isOff(st);
    const { title, artist } = nowPlaying(st);
    if (off || !title) return { title: this.displayName, sub: stateWord(this.hass, st) };
    const paused = st?.state === 'paused' ? `${stateWord(this.hass, st)} · ` : '';
    return { title, sub: `${paused}${artist || this.displayName}` };
  }

  private orb(st: HassEntity | undefined): TemplateResult {
    if (!isOff(st) && coverUrl(st)) return coverArt(st, 'round');
    return html`<glowcard-orb
      .icon=${this.icon}
      ?active=${this.isActive}
      ?calm=${!this.isActive && !isOff(st)}
      label=${this.displayName}
    ></glowcard-orb>`;
  }

  private playButton(st: HassEntity | undefined, cls = ''): TemplateResult | typeof nothing {
    if (isOff(st) || !(supports(st, F.PAUSE) || supports(st, F.PLAY))) return nothing;
    const playing = isPlaying(st);
    return ctrlButton(
      playing ? 'mdi:pause' : 'mdi:play',
      mt(this.hass, playing ? 'pause' : 'play'),
      () => call(this.hass, 'media_play_pause', st!.entity_id),
      `main ${playing || st?.state === 'on' ? '' : 'idle'} ${cls}`,
    );
  }

  private progressBar(pct: number | undefined): TemplateResult | typeof nothing {
    return pct === undefined
      ? nothing
      : html`<div class="prog"><i style="width:${pct.toFixed(2)}%"></i></div>`;
  }

  private tile(st: HassEntity | undefined, run: boolean): TemplateResult {
    const { title, sub } = this.texts(st);
    return html`<div class="tile">
      <div class="top">${this.orb(st)}${this.playButton(st, 'tile-btn')}</div>
      <div class="bottom">
        <glowcard-marquee class="name" .text=${title} .run=${run}></glowcard-marquee>
        <glowcard-marquee class="sub" .text=${sub} .run=${run}></glowcard-marquee>
        ${this.progressBar(progress(st))}
      </div>
    </div>`;
  }

  private wide(st: HassEntity | undefined, run: boolean): TemplateResult {
    const off = isOff(st);
    const { title, artist } = nowPlaying(st);
    const pct = progress(st);
    const vol = volumePct(st);
    const id = st?.entity_id ?? '';
    const t = off || !title ? this.displayName : title;
    const a = off || !title ? stateWord(this.hass, st) : artist;
    return html`<div class="wide">
      ${coverArt(st, 'sq')}
      <div class="body">
        <div class="head">
          ${
            !off && title
              ? html`<div class="where">
                  ${isPlaying(st) ? html`<span class="eq"><i></i><i></i><i></i><i></i></span>` : nothing}
                  <ha-icon .icon=${this.icon}></ha-icon><span>${this.displayName}</span>
                </div>`
              : nothing
          }
          <glowcard-marquee class="w-title" .text=${t} .run=${run}></glowcard-marquee>
          ${a ? html`<glowcard-marquee class="w-artist" .text=${a} .run=${run}></glowcard-marquee>` : nothing}
        </div>
        ${
          pct !== undefined && !off
            ? html`<div class="w-prog">
                ${this.progressBar(pct)}
                <div class="times">
                  <span>${clock(position(st))}</span><span>${clock(duration(st))}</span>
                </div>
              </div>`
            : nothing
        }
        ${
          off
            ? nothing
            : html`<div class="row">
                ${
                  supports(st, F.PREVIOUS_TRACK)
                    ? ctrlButton('mdi:skip-previous', mt(this.hass, 'previous'), () =>
                        call(this.hass, 'media_previous_track', id),
                      )
                    : nothing
                }
                ${this.playButton(st)}
                ${
                  supports(st, F.NEXT_TRACK)
                    ? ctrlButton('mdi:skip-next', mt(this.hass, 'next'), () =>
                        call(this.hass, 'media_next_track', id),
                      )
                    : nothing
                }
                ${
                  supports(st, F.VOLUME_SET) && vol !== undefined
                    ? html`<glowcard-slider
                        pill
                        class="vol"
                        .value=${vol}
                        icon="mdi:volume-high"
                        caption=${String(vol)}
                        label=${mt(this.hass, 'volume')}
                        live
                        @pointerdown=${(e: Event) => e.stopPropagation()}
                        @pointerup=${(e: Event) => e.stopPropagation()}
                        @value-live=${(e: CustomEvent<{ value: number }>) =>
                          call(this.hass, 'volume_set', id, { volume_level: e.detail.value / 100 })}
                        @value-changed=${(e: CustomEvent<{ value: number }>) =>
                          call(this.hass, 'volume_set', id, { volume_level: e.detail.value / 100 })}
                      ></glowcard-slider>`
                    : nothing
                }
              </div>`
        }
      </div>
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const st = this.stateObj;
    const run = isPlaying(st);
    const s = this.isUnavailable ? 'unavailable' : this.isActive ? 'active' : '';
    return html`<div
      class="glass sized card ${s}"
      role="button"
      tabindex="0"
      aria-label=${this.displayName}
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
      @keydown=${this.key}
    >
      ${this.tile(st, run)}${this.wide(st, run)}
    </div>`;
  }

  private key = (ev: KeyboardEvent): void => {
    if (ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    void this.runAction('tap');
  };

  // ---------- popup ----------

  protected renderPopup() {
    return {
      heading: this.displayName,
      subtitle: playerSubtitle(this.hass, this.stateObj),
      content: playerPopupContent(this.hass, this.stateObj),
    };
  }

  protected popupStyles() {
    return playerPopupStyles;
  }

  static styles = [
    ...GlowCardBase.styles,
    mediaBits,
    css`
      :host {
        --m-wide-pad: 16px;
        --m-wide-gap: 16px;
        --m-cv-max: 152px;
        --m-title: 19px;
        --m-artist: 13px;
        --m-tile-btn: 48px;
        --m-prog-gap: 10px;
        --m-pill-h: 34px;
        display: block;
        container-type: inline-size;
        -webkit-tap-highlight-color: transparent;
      }
      .card {
        height: var(--glow-card-h);
        cursor: pointer;
        user-select: none;
        overflow: hidden;
      }
      .card:focus-visible {
        outline: 2px solid rgb(var(--glow-accent));
        outline-offset: 2px;
      }
      .name,
      .sub,
      .w-title,
      .w-artist {
        line-height: 1.25;
      }
      .prog {
        position: relative;
        height: 4px;
        border-radius: 999px;
        background: var(--glow-track);
      }
      .prog i {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 999px;
        background: rgb(var(--glow-accent));
        box-shadow: 0 0 10px rgba(var(--glow-accent), 0.7);
        transition: width 1s linear;
      }

      /* ---------- tile (A) ---------- */
      .tile {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .tile .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .cover.round {
        --cv: var(--glow-orb-size);
        border-radius: 999px;
        box-shadow: none;
      }
      .active .cover.round {
        box-shadow: var(--glow-orb-glow);
      }
      .tile-btn {
        --b-main: var(--m-tile-btn);
      }
      .bottom {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .bottom .prog {
        margin-top: var(--m-prog-gap);
      }

      /* ---------- wide (B) ---------- */
      .wide {
        display: none;
        height: 100%;
        gap: var(--m-wide-gap);
        align-items: center;
      }
      .cover.sq {
        --cv: min(var(--m-cv-max), 36cqw);
        --cvr: 20px;
      }
      .body {
        flex: 1;
        min-width: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .head {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .where {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--glow-muted);
        margin-bottom: 4px;
        white-space: nowrap;
      }
      .where span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .where ha-icon {
        display: flex;
        flex-shrink: 0;
        --mdc-icon-size: 14px;
      }
      .eq {
        display: inline-flex;
        flex-shrink: 0;
        gap: 2px;
        align-items: flex-end;
        height: 11px;
      }
      .eq i {
        width: 3px;
        height: 100%;
        border-radius: 2px;
        background: rgb(var(--glow-accent));
        box-shadow: 0 0 6px rgba(var(--glow-accent), 0.8);
        transform-origin: bottom;
        animation: eq 1.1s ease-in-out infinite alternate;
      }
      .eq i:nth-child(2) {
        animation-delay: -0.4s;
      }
      .eq i:nth-child(3) {
        animation-delay: -0.8s;
      }
      .eq i:nth-child(4) {
        animation-delay: -0.2s;
      }
      @keyframes eq {
        from {
          transform: scaleY(0.35);
        }
        to {
          transform: scaleY(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .eq i {
          animation: none;
        }
      }
      .w-title {
        font-size: var(--m-title);
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .w-artist {
        font-size: var(--m-artist);
        font-weight: 600;
        color: var(--glow-muted);
      }
      .times {
        display: flex;
        justify-content: space-between;
        margin-top: 5px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--glow-muted);
        font-variant-numeric: tabular-nums;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      .row .btn.main {
        margin: 0 2px;
      }
      .vol {
        display: none;
        flex: 1;
        min-width: 0;
        margin-left: 8px;
        --glow-pill-h: var(--m-pill-h);
        --glow-pill-r: 12px;
        --glow-pill-pad: 10px;
      }

      @container (min-width: 300px) {
        .tile {
          display: none;
        }
        .wide {
          display: flex;
        }
        .card {
          padding: var(--m-wide-pad);
        }
      }
      @container (min-width: 440px) {
        .vol {
          display: block;
        }
      }

      @media (max-width: 600px) {
        :host(:not([size='normal'])) {
          ${compactMedia}
        }
        @container (min-width: 346px) {
          :host(:not([size='normal'])) .vol {
            display: block;
          }
        }
        :host(:not([size='normal'])) .where,
        :host(:not([size='normal'])) .times {
          display: none;
        }
      }
      :host([size='compact']) {
        ${compactMedia}
      }
      @container (min-width: 346px) {
        :host([size='compact']) .vol {
          display: block;
        }
      }
      :host([size='compact']) .where,
      :host([size='compact']) .times {
        display: none;
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-media',
    name: 'GlowCard Media',
    description: 'A media player: tile at half width, wide card with controls when widened',
    domains: ['media_player'],
  },
  GlowMediaCard,
);

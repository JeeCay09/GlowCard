import { css, html, nothing, type TemplateResult } from 'lit';
import type { HassEntity, HomeAssistant } from '../../types/hass';
import { orbLitBackground } from '../../core/orb-style';
import {
  F,
  album,
  call,
  clock,
  coverUrl,
  duration,
  groupCandidates,
  groupLabel,
  groupMembers,
  isOff,
  isPlaying,
  mt,
  nowPlaying,
  playerIcon,
  position,
  progress,
  shortName,
  stateWord,
  supports,
  volumePct,
} from './media-logic';
import '../../components/marquee';
import '../../components/slider';

const stop = (e: Event) => e.stopPropagation();

/** Round control button; `main` = the lit play/pause orb. */
export function ctrlButton(
  icon: string,
  label: string,
  onClick: () => void,
  cls = '',
): TemplateResult {
  return html`<button
    class="btn ${cls}"
    aria-label=${label}
    title=${label}
    @pointerdown=${stop}
    @pointerup=${stop}
    @click=${(e: Event) => {
      e.stopPropagation();
      onClick();
    }}
  >
    <ha-icon .icon=${icon}></ha-icon>
  </button>`;
}

/** Popup subtitle: "Spielt · Gruppe mit Bad". */
export function playerSubtitle(
  hass: HomeAssistant | undefined,
  st: HassEntity | undefined,
): string {
  const word = stateWord(hass, st);
  const others = groupMembers(st).filter((id) => id !== st?.entity_id);
  return others.length && !isOff(st)
    ? `${word} · ${mt(hass, 'group')} ${mt(hass, 'with')} ${groupLabel(hass, others)}`
    : word;
}

/** Cover image or, without one, a tinted square with the player's icon. */
export function coverArt(st: HassEntity | undefined, cls = ''): TemplateResult {
  const url = coverUrl(st);
  return url
    ? html`<div class="cover ${cls}"><img src=${url} alt="" draggable="false" /></div>`
    : html`<div class="cover none ${cls}">
        <ha-icon .icon=${playerIcon(st)}></ha-icon>
      </div>`;
}

/** Content of the GlowCard popup for one player (shared by the media and rooms cards). */
export function playerPopupContent(
  hass: HomeAssistant | undefined,
  st: HassEntity | undefined,
): TemplateResult {
  if (!st) return html``;
  const id = st.entity_id;
  const off = isOff(st);
  const { title, artist } = nowPlaying(st);
  const playing = isPlaying(st);
  const alb = album(st);
  const hero = html`<div class="hero">
    ${coverArt(st, 'big')}
    <div class="ht">
      <glowcard-marquee
        class="pt"
        .text=${off ? stateWord(hass, st) : title || mt(hass, 'nothing')}
        .run=${playing}
      ></glowcard-marquee>
      ${artist ? html`<glowcard-marquee class="pa" .text=${artist} .run=${playing}></glowcard-marquee>` : nothing}
      ${alb && alb !== title ? html`<glowcard-marquee class="pl" .text=${alb} .run=${playing}></glowcard-marquee>` : nothing}
    </div>
  </div>`;
  if (off) return hero;

  const dur = duration(st);
  const pct = progress(st);
  const seek = supports(st, F.SEEK);
  const prog =
    pct !== undefined
      ? html`<div class="prog">
          <glowcard-slider
            plain
            class="seek"
            .value=${pct}
            .step=${0.1}
            ?disabled=${!seek}
            label=${clock(position(st))}
            @value-changed=${(e: CustomEvent<{ value: number }>) =>
              call(hass, 'media_seek', id, {
                seek_position: Math.round(((dur ?? 0) * e.detail.value) / 100),
              })}
          ></glowcard-slider>
          <div class="times"><span>${clock(position(st))}</span><span>${clock(dur)}</span></div>
        </div>`
      : nothing;

  const shuffle = st.attributes.shuffle === true;
  const repeat = String(st.attributes.repeat ?? 'off');
  const canPlay = supports(st, F.PAUSE) || supports(st, F.PLAY);
  const controls = html`<div class="ctrl">
    ${
      supports(st, F.SHUFFLE_SET)
        ? ctrlButton(
            'mdi:shuffle-variant',
            mt(hass, 'shuffle'),
            () => call(hass, 'shuffle_set', id, { shuffle: !shuffle }),
            shuffle ? 'flat on' : 'flat',
          )
        : nothing
    }
    ${
      supports(st, F.PREVIOUS_TRACK)
        ? ctrlButton(
            'mdi:skip-previous',
            mt(hass, 'previous'),
            () => call(hass, 'media_previous_track', id),
            'ghost',
          )
        : nothing
    }
    ${
      canPlay
        ? ctrlButton(
            playing ? 'mdi:pause' : 'mdi:play',
            mt(hass, playing ? 'pause' : 'play'),
            () => call(hass, 'media_play_pause', id),
            `main big ${playing ? '' : 'idle'}`,
          )
        : nothing
    }
    ${
      supports(st, F.NEXT_TRACK)
        ? ctrlButton(
            'mdi:skip-next',
            mt(hass, 'next'),
            () => call(hass, 'media_next_track', id),
            'ghost',
          )
        : nothing
    }
    ${
      supports(st, F.REPEAT_SET)
        ? ctrlButton(
            repeat === 'one' ? 'mdi:repeat-once' : 'mdi:repeat',
            mt(hass, 'repeat'),
            () =>
              call(hass, 'repeat_set', id, {
                repeat: repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off',
              }),
            repeat !== 'off' ? 'flat on' : 'flat',
          )
        : nothing
    }
  </div>`;

  const vol = volumePct(st);
  const volume =
    supports(st, F.VOLUME_SET) && vol !== undefined
      ? html`<glowcard-slider
          pill
          class="vol"
          .value=${vol}
          icon=${st.attributes.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-high'}
          text=${mt(hass, 'volume')}
          caption=${`${vol} %`}
          label=${mt(hass, 'volume')}
          live
          @value-live=${(e: CustomEvent<{ value: number }>) =>
            call(hass, 'volume_set', id, { volume_level: e.detail.value / 100 })}
          @value-changed=${(e: CustomEvent<{ value: number }>) =>
            call(hass, 'volume_set', id, { volume_level: e.detail.value / 100 })}
        ></glowcard-slider>`
      : nothing;

  const sources = Array.isArray(st.attributes.source_list)
    ? (st.attributes.source_list as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const source =
    supports(st, F.SELECT_SOURCE) && sources.length
      ? html`<div class="sect">${mt(hass, 'source')}</div>
          <div class="src">
            ${sources.map(
              (s) =>
                html`<button
                  class=${s === st.attributes.source ? 'on' : ''}
                  @click=${() => call(hass, 'select_source', id, { source: s })}
                >
                  ${s}
                </button>`,
            )}
          </div>`
      : nothing;

  const candidates = supports(st, F.GROUPING) ? groupCandidates(hass, id) : [];
  const members = groupMembers(st);
  const speakers = candidates.length
    ? html`<div class="sect">${mt(hass, 'speakers')}</div>
        <div class="chips">
          ${[id, ...candidates].map((p) => {
            const on = p === id || members.includes(p);
            return html`<button
              class="chip ${on ? 'on' : ''}"
              ?disabled=${p === id}
              @click=${() =>
                on ? call(hass, 'unjoin', p) : call(hass, 'join', id, { group_members: [p] })}
            >
              <span class="d"><ha-icon .icon=${on ? 'mdi:check' : 'mdi:plus'}></ha-icon></span>
              <span class="cn">${shortName(hass, p)}</span>
            </button>`;
          })}
        </div>`
    : nothing;

  return html`${hero}${prog}${controls}${volume}${source}${speakers}`;
}

/** Buttons and covers, shared by the cards and the popup. */
export const mediaBits = css`
  .btn {
    all: unset;
    box-sizing: border-box;
    flex-shrink: 0;
    width: var(--b-size, 40px);
    height: var(--b-size, 40px);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--glow-text);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 0.12s,
      background 0.2s,
      box-shadow 0.2s;
  }
  .btn:active {
    transform: scale(0.94);
  }
  .btn:focus-visible {
    outline: 2px solid rgb(var(--glow-accent));
    outline-offset: 2px;
  }
  .btn ha-icon {
    display: flex;
    --mdc-icon-size: calc(var(--b-size, 40px) * 0.52);
  }
  .btn.ghost {
    background: var(--glow-inset);
  }
  .btn.flat {
    color: var(--glow-muted);
  }
  .btn.flat.on {
    color: rgb(var(--glow-accent));
  }
  .btn.main {
    --b-size: var(--b-main, 48px);
    color: #fff;
    background: ${orbLitBackground('rgb(var(--glow-accent))')};
    box-shadow: var(--glow-orb-glow);
  }
  .btn.main ha-icon {
    filter: drop-shadow(0 1px 2px color-mix(in srgb, rgb(var(--glow-accent)) 45%, #3a1c00));
  }
  .btn.main.idle {
    background: var(--glow-inset);
    color: var(--glow-text);
    box-shadow: none;
  }
  .btn.main.idle ha-icon {
    filter: none;
  }
  .cover {
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
    width: var(--cv);
    height: var(--cv);
    border-radius: var(--cvr, 16px);
    background: var(--glow-inset);
    box-shadow: 0 10px 28px -10px rgba(var(--glow-accent), 0.7);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }
  .cover::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }
  .cover.none {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--glow-accent), var(--glow-calm, 0.12));
    color: rgb(var(--glow-accent));
    box-shadow: none;
  }
  .cover.none ha-icon {
    display: flex;
    --mdc-icon-size: calc(var(--cv) * 0.42);
  }
  .cover.none::after {
    display: none;
  }
`;

export const playerPopupStyles = [
  mediaBits,
  css`
    .hero {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .cover.big {
      --cv: 112px;
      --cvr: 22px;
    }
    .ht {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pt {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }
    .pa {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--glow-muted);
    }
    .pl {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--glow-muted);
    }
    .prog {
      margin: -6px 0 -8px;
    }
    .seek {
      --glow-slider-hit: 22px;
      --glow-slider-bar: 4px;
    }
    .times {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--glow-muted);
      font-variant-numeric: tabular-nums;
    }
    .ctrl {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }
    .btn.big {
      --b-main: 60px;
    }
    .sect {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 1.25;
      text-transform: uppercase;
      color: var(--glow-muted);
      margin-bottom: -8px;
    }
    .src {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 -20px;
      padding: 0 20px;
      -webkit-mask-image: linear-gradient(
        90deg,
        transparent,
        #000 20px,
        #000 calc(100% - 20px),
        transparent
      );
      mask-image: linear-gradient(
        90deg,
        transparent,
        #000 20px,
        #000 calc(100% - 20px),
        transparent
      );
    }
    .src::-webkit-scrollbar {
      display: none;
    }
    .src button {
      all: unset;
      flex-shrink: 0;
      cursor: pointer;
      padding: 8px 14px;
      border-radius: 12px;
      background: var(--glow-inset);
      font: 700 13px / 1.25 var(--glow-font);
      color: var(--glow-muted);
      white-space: nowrap;
    }
    .src button.on {
      background: var(--glow-tab-active);
      color: var(--glow-text);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      max-width: 100%;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px 7px 8px;
      border-radius: 999px;
      background: var(--glow-inset);
      font: 700 13px / 1.25 var(--glow-font);
      color: var(--glow-text);
    }
    .chip[disabled] {
      cursor: default;
    }
    .chip .cn {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chip .d {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--glow-inset);
      color: var(--glow-muted);
    }
    .chip .d ha-icon {
      display: flex;
      --mdc-icon-size: 14px;
    }
    .chip.on {
      background: rgba(var(--glow-accent), 0.16);
      box-shadow: inset 0 0 0 1px rgba(var(--glow-accent), 0.35);
    }
    .chip.on .d {
      background: ${orbLitBackground('rgb(var(--glow-accent))')};
      color: #fff;
      box-shadow: 0 0 10px rgba(var(--glow-accent), 0.7);
    }
    @media (max-width: 480px) {
      .cover.big {
        --cv: 96px;
      }
      .pt {
        font-size: 18px;
      }
    }
  `,
];

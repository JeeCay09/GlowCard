import { css, html, nothing, type PropertyValues } from 'lit';
import type { GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import { configForm, editorLabel, fontField, sizeField, type FormSchema } from '../../core/editor';
import { paletteColor, validateSegment, type SegmentConfig } from './status-logic';
import { GlowStatusBase, avatar, dot, toneDot } from './status-base';
import { avatarStyles, dotStyles, statusTokens } from './status-styles';
import { rgbTriplet } from '../../core/color';

export interface StatusCardConfig extends GlowCardConfig {
  /** Full control in YAML: any number of segments in any order. */
  segments?: SegmentConfig[];
  // Simple form (visual editor) → weather, lights, energy, security, alerts in this order.
  weather?: string;
  lights?: string[] | 'all';
  all_lights?: boolean;
  solar?: string;
  battery?: string;
  battery_power?: string;
  grid?: string;
  home?: string;
  navigation_path?: string;
  security?: string[];
  alerts?: string[];
}

const CHEVRON = 'M9 6l6 6-6 6';

/** Builds the segments of the simple (editor) form. */
export function simpleSegments(c: StatusCardConfig): SegmentConfig[] {
  const out: SegmentConfig[] = [];
  if (c.weather) out.push({ type: 'weather', entity: c.weather });
  if (c.lights === 'all' || c.all_lights) out.push({ type: 'lights' });
  else if (Array.isArray(c.lights) && c.lights.length) {
    out.push({ type: 'lights', entities: c.lights });
  }
  if (c.solar || c.home || c.grid || c.battery_power) {
    out.push({
      type: 'energy',
      solar: c.solar,
      battery: c.battery,
      battery_power: c.battery_power,
      grid: c.grid,
      home: c.home,
      navigation_path: c.navigation_path,
    });
  }
  if (c.security?.length) out.push({ type: 'security', entities: c.security });
  for (const entity of c.alerts ?? []) out.push({ type: 'alert', entity });
  return out;
}

/** Status bar ("Status-Leiste") from the GlowChips board: one glass capsule with segments. */
export class GlowStatusCard extends GlowStatusBase<StatusCardConfig> {
  private resizeObserver?: ResizeObserver;

  /** Narrow screens: fade the right edge while more segments are hidden there. */
  private updateFade = (): void => {
    const track = this.renderRoot.querySelector<HTMLElement>('.track');
    if (!track) return;
    const more = track.scrollWidth - track.clientWidth - track.scrollLeft > 2;
    track.classList.toggle('more', more);
  };

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const track = this.renderRoot.querySelector<HTMLElement>('.track');
    if (track && !this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.updateFade);
      this.resizeObserver.observe(track);
    }
    this.updateFade();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  private segs: SegmentConfig[] = [];

  static getConfigForm() {
    const sensor = (device_class?: string): FormSchema['selector'] => ({
      entity: { domain: ['sensor'], ...(device_class ? { device_class } : {}) },
    });
    return configForm(
      [
        { name: 'weather', selector: { entity: { domain: ['weather'] } } },
        { name: 'all_lights', selector: { boolean: {} } },
        { name: 'lights', selector: { entity: { domain: ['light'], multiple: true } } },
        {
          name: '',
          type: 'expandable',
          title: 'energy_section',
          icon: 'mdi:lightning-bolt-outline',
          schema: [
            {
              name: '',
              type: 'grid',
              schema: [
                { name: 'solar', selector: sensor('power') },
                { name: 'home', selector: sensor('power') },
                { name: 'battery', selector: sensor('battery') },
                { name: 'battery_power', selector: sensor('power') },
                { name: 'grid', selector: sensor('power') },
                { name: 'navigation_path', selector: { text: {} } },
              ],
            },
          ],
        },
        {
          name: 'security',
          selector: {
            entity: {
              domain: ['binary_sensor', 'lock', 'alarm_control_panel', 'cover'],
              multiple: true,
            },
          },
        },
        {
          name: 'alerts',
          selector: { entity: { domain: ['binary_sensor', 'vacuum'], multiple: true } },
        },
        fontField,
        sizeField,
      ],
      {
        lights: 'lights_helper',
        security: 'security_helper',
        alerts: 'alerts_helper',
        navigation_path: 'navigation_path_helper',
      },
      (config) => {
        if (config.segments !== undefined || config.lights === 'all') {
          throw new Error(editorLabel('segments_yaml_only'));
        }
      },
    );
  }

  /** No entity is picked for the user; counting all lights is a setting, not an entity. */
  static getStubConfig(): Partial<StatusCardConfig> {
    return { all_lights: true };
  }

  protected validateConfig(config: StatusCardConfig): void {
    if (config.segments !== undefined) {
      if (!Array.isArray(config.segments)) throw new Error('"segments" must be a list');
      config.segments.forEach((s, i) => validateSegment(s, `segments[${i}]`));
      this.segs = config.segments;
    } else {
      this.segs = simpleSegments(config);
    }
    if (!this.segs.length) {
      throw new Error('Please add segments (weather, lights, energy, security, alerts)');
    }
  }

  protected get segmentConfigs(): SegmentConfig[] {
    return this.segs;
  }

  getCardSize(): number {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const green = paletteColor('green', this.dark);
    return html`<div class="dock" role="toolbar" aria-label="Status">
      <div class="track" @scroll=${this.updateFade}>
        ${this.segs.map((cfg, i) => {
          const v = this.viewOf(cfg);
          if (!v || v.hidden) return nothing;
          const clickable = this.isClickable(cfg, v);
          const selected = clickable && this.openSeg === i;
          const orb = v.avatar
            ? avatar(v, 40, 15, green)
            : dot(v.icon, toneDot(v), v.rgb, 40, 19, 22, v.pulse);
          return html`<div
            class="seg ${selected ? 'selected' : ''} ${clickable ? 'clickable' : ''} ${v.tone}"
            style="--c:${rgbTriplet(v.rgb)}"
            role="button"
            tabindex=${clickable ? 0 : -1}
            aria-disabled=${clickable ? 'false' : 'true'}
            aria-pressed=${selected ? 'true' : 'false'}
            aria-label=${`${v.value}, ${v.label}`}
            @pointerdown=${(e: PointerEvent) => clickable && this.segDown(i, e)}
            @pointerup=${() => clickable && this.segUp(i)}
            @pointercancel=${this.segCancel}
            @pointerleave=${this.segCancel}
            @keydown=${(e: KeyboardEvent) => clickable && this.segKey(i, e)}
            @contextmenu=${(e: Event) => e.preventDefault()}
          >
            ${orb}
            <span class="txt">
              <span class="val">${v.value}</span>
              <span class="lab">${v.label}</span>
            </span>
            ${
              clickable
                ? html`<svg
                    class="chev"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d=${CHEVRON}></path>
                  </svg>`
                : nothing
            }
          </div>`;
        })}
      </div>
    </div>`;
  }

  static styles = [
    ...GlowStatusBase.styles,
    statusTokens,
    dotStyles,
    avatarStyles,
    css`
      :host {
        display: block;
        container-type: inline-size;
        font-family: var(--glow-font);
        color: var(--glow-text);
      }
      .dock {
        height: var(--glow-dock-h);
        box-sizing: border-box;
        border-radius: 999px;
        display: flex;
        background: var(--gc-glass);
        border: 1px solid var(--gc-glass-border);
        backdrop-filter: var(--glow-blur);
        -webkit-backdrop-filter: var(--glow-blur);
        box-shadow: var(--gc-dock-shadow);
      }
      .track {
        flex: 1 1 auto;
        min-width: 0;
        box-sizing: border-box;
        padding: var(--glow-dock-pad);
        display: flex;
        align-items: stretch;
        gap: 4px;
      }
      .seg {
        --dot-scale: var(--glow-dot-scale);
        flex: 1 1 0;
        min-width: 0;
        border-radius: 999px;
        padding: var(--glow-seg-pad);
        display: flex;
        align-items: center;
        gap: var(--glow-seg-gap);
        text-align: left;
        cursor: default;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        transition:
          background 0.2s,
          box-shadow 0.2s;
      }
      .seg.clickable {
        cursor: pointer;
      }
      .seg.selected {
        background: rgba(var(--c), var(--gc-seg-sel));
        box-shadow: inset 0 0 0 1px rgba(var(--c), 0.38);
      }
      .seg:focus-visible {
        box-shadow: inset 0 0 0 2px rgba(var(--c), 0.6);
      }
      .seg.unavailable {
        opacity: 0.6;
      }
      .txt {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .val {
        font-size: var(--glow-seg-val);
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .warning .val {
        color: rgb(var(--c));
      }
      .lab {
        font-size: var(--glow-seg-lab);
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--glow-muted);
      }
      .chev {
        flex-shrink: 0;
        opacity: 0.7;
        color: var(--glow-muted);
      }
      /* Narrow (phones): segments keep their text and the bar scrolls sideways.
         The icon-only chips are the compact alternative. */
      @container (max-width: 600px) {
        .track {
          overflow-x: auto;
          scrollbar-width: none;
          scroll-snap-type: x proximity;
          border-radius: 999px;
        }
        .track::-webkit-scrollbar {
          display: none;
        }
        /* More segments to the right: let the cut one fade out softly. */
        .track.more {
          -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent);
          mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent);
        }
        .seg {
          flex: 1 0 auto;
          scroll-snap-align: start;
        }
        .chev {
          display: none;
        }
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-status',
    name: 'GlowCard Status bar',
    description: 'Glass status bar: weather, lights, energy, security and alerts with popups',
  },
  GlowStatusCard,
);

import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
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
import { localize } from '../../core/localize';
import { lightColor, mix, rgbTriplet, type Rgb } from '../../core/color';
import type { HomeAssistant } from '../../types/hass';
import {
  HUE_GRADIENT,
  brightnessPct,
  hue,
  kelvinGradient,
  kelvinRange,
  lightCaps,
  matchSwatch,
  swatchServiceData,
  swatchesFor,
  type LightSwatch,
} from './light-logic';
import '../../components/orb';
import '../../components/slider';
import '../../components/segments';
import '../../components/swatches';

export interface LightCardConfig extends GlowCardConfig {
  /** Only `wide` (2 columns with drag bar). The former `small` variant is shown as `wide`. */
  variant?: 'wide' | 'small';
}

type Tab = 'brightness' | 'color_temp' | 'color';

/** Light card from the GlowCards board plus the light popup from GlowPopups. */
export class GlowLightCard extends GlowCardBase<LightCardConfig> {
  /** Value while the popup column is dragged, for the live caption. */
  @state() private dragging?: number;
  /** Value while the card's bar is dragged, for the live value top right. */
  @state() private cardDrag?: number;
  private cardDragTimer?: number;
  @state() private tab: Tab = 'brightness';

  protected defaultColor = 'warm';

  static getConfigForm() {
    return configForm(
      [
        { name: 'entity', required: true, selector: { entity: { domain: ['light'] } } },
        lookSection(nameIconFields, lookFields, sizeField),
        actionsField,
      ],
      { color: 'color_light_helper' },
    );
  }

  /** No entity is picked for the user; "by entity" passes the chosen ones. */
  static getStubConfig(): Partial<LightCardConfig> {
    return stubEntity();
  }

  getCardSize(): number {
    return 3;
  }

  getGridOptions() {
    return { columns: 6, rows: 'auto', min_columns: 6 };
  }

  /** Orb, bar and tint follow the light's current colour while it is on. */
  protected get accent(): Rgb {
    return lightColor(this.stateObj) ?? super.accent;
  }

  protected get icon(): string {
    const fromEntity = this.stateObj?.attributes.icon;
    if (this.config?.icon) return this.config.icon;
    return typeof fromEntity === 'string' ? fromEntity : 'mdi:lightbulb';
  }

  private get caps() {
    return lightCaps(this.stateObj);
  }

  private get bright(): number {
    return brightnessPct(this.stateObj);
  }

  private get swatch(): LightSwatch | undefined {
    return matchSwatch(this.stateObj);
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const old = changed.get('hass') as HomeAssistant | undefined;
    const id = this.config?.entity;
    if (this.cardDrag !== undefined && old && id && old.states[id] !== this.hass?.states[id]) {
      this.cardDrag = undefined;
      window.clearTimeout(this.cardDragTimer);
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.style.setProperty('--glow-value-dark', rgbTriplet(mix(this.accent, [255, 255, 255], 0.6)));
  }

  // ---------- actions ----------

  private call(data: Record<string, unknown>): void {
    if (!this.hass || !this.config?.entity) return;
    void this.hass.callService('light', 'turn_on', { entity_id: this.config.entity, ...data });
  }

  private setBrightness = (ev: CustomEvent<{ value: number }>) => {
    ev.stopPropagation();
    this.dragging = undefined;
    // Keep showing the dragged value until the light reports its new state (or 4 s pass).
    window.clearTimeout(this.cardDragTimer);
    this.cardDragTimer = window.setTimeout(() => (this.cardDrag = undefined), 4000);
    const v = ev.detail.value;
    if (v <= 0) {
      void this.hass?.callService('light', 'turn_off', { entity_id: this.config?.entity });
    } else {
      this.call({ brightness_pct: v });
    }
  };

  private setColumn = (ev: CustomEvent<{ value: number }>) => {
    if (this.tab === 'brightness') return this.setBrightness(ev);
    this.dragging = undefined;
    if (this.tab === 'color_temp') this.call({ color_temp_kelvin: ev.detail.value });
    else this.call({ hs_color: [ev.detail.value, 100] });
  };

  private dragBar = (ev: CustomEvent<{ value: number }>) => {
    ev.stopPropagation();
    this.cardDrag = ev.detail.value;
  };

  private dragColumn = (ev: CustomEvent<{ value: number }>) => {
    this.dragging = ev.detail.value;
    this.refreshPopup();
  };

  private pickSwatch = (ev: CustomEvent<{ value: { name: string } }>) => {
    const s = swatchesFor(this.caps).find(
      (x) => localize(this.hass, x.key) === ev.detail.value.name,
    );
    if (s) this.call(swatchServiceData(s, this.caps));
  };

  private pickTab = (ev: CustomEvent<{ value: string }>) => {
    this.tab = ev.detail.value as Tab;
    this.refreshPopup();
  };

  // ---------- rendering ----------

  private stateText(): string {
    if (this.isUnavailable) return localize(this.hass, 'unavailable');
    if (!this.isActive) return localize(this.hass, 'off');
    const on = localize(this.hass, 'on');
    const s = this.swatch;
    if (s) return `${on} · ${localize(this.hass, s.key)}`;
    const a = this.stateObj?.attributes;
    if (a?.color_mode === 'color_temp' && typeof a.color_temp_kelvin === 'number')
      return `${on} · ${Math.round(a.color_temp_kelvin)} K`;
    return on;
  }

  /** Brightness top right; empty when off or not dimmable (the state is shown under the name). */
  private valueText(): string {
    if (this.isUnavailable) return '';
    if (this.cardDrag !== undefined) return this.cardDrag > 0 ? `${this.cardDrag}%` : '';
    if (!this.isActive || !this.caps.brightness) return '';
    return `${this.bright}%`;
  }

  private orb() {
    return html`<glowcard-orb
      .icon=${this.icon}
      ?active=${this.isActive}
      ?dark-icon=${this.darkIcon}
      label=${this.displayName}
    ></glowcard-orb>`;
  }

  render() {
    if (!this.config) return nothing;
    const s = this.isUnavailable ? 'unavailable' : this.isActive ? 'active' : '';
    const showBar = this.caps.brightness && !this.isUnavailable;
    const value = this.valueText();
    return html`<div
      class="glass sized wide ${s}"
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <div class="top">
        ${this.orb()}
        <span class="value ${this.isActive ? 'lit' : ''}">${value}</span>
      </div>
      <div class="bottom">
        <div class="titles">
          <span class="name">${this.displayName}</span>
          <span class="sub">${this.stateText()}</span>
        </div>
        ${
          showBar
            ? html`<glowcard-slider
                .value=${this.bright}
                label=${localize(this.hass, 'brightness')}
                @pointerdown=${(e: Event) => e.stopPropagation()}
                @pointerup=${(e: Event) => e.stopPropagation()}
                @value-changing=${this.dragBar}
                @value-changed=${this.setBrightness}
              ></glowcard-slider>`
            : nothing
        }
      </div>
    </div>`;
  }

  // ---------- popup ----------

  private get tabs(): Tab[] {
    const c = this.caps;
    const t: Tab[] = [];
    if (c.brightness) t.push('brightness');
    if (c.colorTemp) t.push('color_temp');
    if (c.color) t.push('color');
    return t;
  }

  /** Big on/off switch in the shape of the column, for lights without brightness. */
  private switchColumn() {
    const on = this.isActive;
    return html`<button
      class="onoff ${on ? 'on' : ''} ${this.darkIcon ? 'dark-text' : ''}"
      aria-pressed=${on ? 'true' : 'false'}
      ?disabled=${this.isUnavailable}
      @click=${this.toggle}
    >
      <span class="onoff-halo"></span>
      <span class="onoff-fill"></span>
      <span class="onoff-word">${localize(this.hass, on ? 'on' : 'off')}</span>
    </button>`;
  }

  private column() {
    const tabs = this.tabs;
    if (!tabs.length) return this.switchColumn();
    const tab = tabs.includes(this.tab) ? this.tab : (tabs[0] ?? 'brightness');
    const on = this.isActive;
    const dragging = this.dragging;
    if (tab === 'color_temp') {
      const [min, max] = kelvinRange(this.stateObj);
      const inCt = on && this.stateObj?.attributes.color_mode === 'color_temp';
      const k = inCt ? Number(this.stateObj?.attributes.color_temp_kelvin) || min : min;
      const v = dragging ?? (inCt ? k : undefined);
      return html`<glowcard-slider
        vertical
        .min=${min}
        .max=${max}
        .step=${50}
        .value=${k}
        caption=${v === undefined ? '–' : `${Math.round(v)} K`}
        dark-text
        label=${localize(this.hass, 'color_temp')}
        style=${`--glow-fill-v:${kelvinGradient([min, max])} bottom / 100% 300px no-repeat`}
        @value-changing=${this.dragColumn}
        @value-changed=${this.setColumn}
      ></glowcard-slider>`;
    }
    if (tab === 'color') {
      const inColor = on && this.stateObj?.attributes.color_mode !== 'color_temp';
      const h = inColor ? hue(this.stateObj) : 0;
      const v = dragging ?? (inColor ? h : undefined);
      return html`<glowcard-slider
        vertical
        .min=${0}
        .max=${360}
        .value=${h}
        caption=${v === undefined ? '–' : `${Math.round(v)}°`}
        label=${localize(this.hass, 'color')}
        style=${`--glow-fill-v:${HUE_GRADIENT} bottom / 100% 300px no-repeat`}
        @value-changing=${this.dragColumn}
        @value-changed=${this.setColumn}
      ></glowcard-slider>`;
    }
    const v = dragging ?? this.bright;
    return html`<glowcard-slider
      vertical
      .value=${this.bright}
      caption=${v > 0 ? `${v}%` : localize(this.hass, 'off')}
      ?dark-text=${this.darkIcon}
      label=${localize(this.hass, 'brightness')}
      @value-changing=${this.dragColumn}
      @value-changed=${this.setColumn}
    ></glowcard-slider>`;
  }

  protected renderPopup() {
    if (!this.config?.entity) return undefined;
    const area = this.areaName();
    let heading = this.displayName;
    if (
      area &&
      heading.toLowerCase().includes(area.toLowerCase()) &&
      heading.length > area.length
    ) {
      heading = heading
        .replace(new RegExp(`\\s*${area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), ' ')
        .trim();
    }
    const tabs = this.tabs;
    const swatches = swatchesFor(this.caps);
    return {
      heading,
      subtitle: area ? `${area} · ${this.stateText()}` : this.stateText(),
      content: html`${this.column()}
      ${
        tabs.length > 1
          ? html`<glowcard-segments
              .options=${tabs.map((t) => ({ value: t, label: localize(this.hass, t) }))}
              .value=${tabs.includes(this.tab) ? this.tab : tabs[0]}
              @value-changed=${this.pickTab}
            ></glowcard-segments>`
          : nothing
      }
      ${
        swatches.length
          ? html`<glowcard-swatches
              .swatches=${swatches.map((s) => ({ name: localize(this.hass, s.key), color: s.color }))}
              .selected=${this.swatch ? localize(this.hass, this.swatch.key) : ''}
              @value-changed=${this.pickSwatch}
            ></glowcard-swatches>`
          : nothing
      }`,
    };
  }

  protected popupStyles() {
    return [
      css`
        glowcard-slider,
        .onoff {
          align-self: center;
        }
        .onoff {
          position: relative;
          width: 128px;
          height: 300px;
          margin: 6px 4px;
          padding: 0;
          border: 0;
          border-radius: 40px;
          background: var(--glow-track);
          font: inherit;
          color: var(--glow-text);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .onoff:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .onoff:focus-visible {
          outline: 2px solid rgb(var(--glow-accent));
          outline-offset: 3px;
        }
        .onoff-fill,
        .onoff-halo {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .onoff-fill {
          background: var(--glow-fill-v, rgb(var(--glow-accent)));
        }
        .onoff-halo {
          inset: 10px 10px 0;
          background: rgba(var(--glow-accent), var(--glow-halo, 0.75));
          filter: blur(22px);
        }
        .onoff.on .onoff-fill,
        .onoff.on .onoff-halo {
          opacity: 1;
        }
        .onoff-word {
          position: relative;
          font: 800 30px var(--glow-font);
          letter-spacing: -0.03em;
        }
        .onoff.on .onoff-word {
          color: #ffffff;
        }
        .onoff.on.dark-text .onoff-word {
          color: #1f1a12;
        }
      `,
    ];
  }

  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
      }
      .glass {
        height: var(--glow-card-h);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }
      .bottom {
        display: flex;
        align-items: flex-end;
        gap: 20px;
      }
      .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex-shrink: 0;
        max-width: 60%;
      }
      .name,
      .sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      glowcard-slider {
        flex-grow: 1;
        margin-bottom: -9px;
      }
      .value {
        white-space: nowrap;
      }
      :host([dark]) .value.lit {
        color: rgb(var(--glow-value-dark));
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-light',
    name: 'GlowCard Light',
    description: 'Light with its current colour, drag bar for brightness and a colour popup',
  },
  GlowLightCard,
);

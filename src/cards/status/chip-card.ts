import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { GlowCardConfig } from '../../core/base-card';
import { registerCard } from '../../core/register';
import {
  configForm,
  editorLabel,
  lookFields,
  nameIconFields,
  type EditorLabel,
} from '../../core/editor';
import { rgbTriplet } from '../../core/color';
import {
  SEGMENT_TYPES,
  paletteColor,
  validateSegment,
  type SegmentConfig,
  type SegmentType,
  type SegmentView,
} from './status-logic';
import { GlowStatusBase, avatar, dot, toneDot } from './status-base';
import { avatarStyles, dotStyles, statusTokens } from './status-styles';

export interface ChipCardConfig
  extends GlowCardConfig, Omit<SegmentConfig, 'type' | 'tap_action' | 'hold_action'> {
  /** Kind of the single chip; guessed from the entity when missing. */
  chip?: SegmentType;
  /** Several chips in one row (YAML), each like a status bar segment. */
  chips?: SegmentConfig[];
  /** Round icon-only chips with count badges, e.g. for phones. */
  icon_only?: boolean;
}

const GUESS: Record<string, SegmentType> = {
  weather: 'weather',
  person: 'person',
  vacuum: 'alert',
};

/** Single chip config → segment config. */
export function chipSegment(c: ChipCardConfig): SegmentConfig {
  const rest: Record<string, unknown> = { ...c };
  for (const k of ['type', 'chip', 'chips', 'icon_only', 'font']) delete rest[k];
  const chip = c.chip;
  const domain = c.entity?.split('.')[0] ?? '';
  const guessed: SegmentType =
    chip ??
    GUESS[domain] ??
    (c.solar || c.grid || c.home ? 'energy' : c.battery ? 'battery' : 'entity');
  return { ...rest, type: guessed } as SegmentConfig;
}

/** Status chips from the GlowChips board: pills, or icon-only circles with badges. */
export class GlowChipCard extends GlowStatusBase<ChipCardConfig> {
  private list: SegmentConfig[] = [];

  static getConfigForm() {
    return configForm(
      [
        {
          name: 'chip',
          selector: {
            select: {
              mode: 'dropdown',
              options: SEGMENT_TYPES.map((t) => ({
                value: t,
                label: editorLabel(`${t}_t` as EditorLabel),
              })),
            },
          },
        },
        { name: 'entity', selector: { entity: {} } },
        { name: 'entities_chip', selector: { entity: { multiple: true } } },
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
                { name: 'solar', selector: { entity: { domain: ['sensor'] } } },
                { name: 'home', selector: { entity: { domain: ['sensor'] } } },
                { name: 'battery', selector: { entity: { domain: ['sensor'] } } },
                { name: 'battery_power', selector: { entity: { domain: ['sensor'] } } },
                { name: 'grid', selector: { entity: { domain: ['sensor'] } } },
                { name: 'navigation_path', selector: { text: {} } },
              ],
            },
          ],
        },
        { name: 'icon_only', selector: { boolean: {} } },
        nameIconFields,
        lookFields,
      ],
      { color: 'color_helper', navigation_path: 'navigation_path_helper' },
      (config) => {
        if (config.chips !== undefined) throw new Error(editorLabel('chips_yaml_only'));
      },
    );
  }

  /** A lights chip. HA passes unused dashboard entities here, so none is picked. */
  static getStubConfig(): Partial<ChipCardConfig> {
    return { chip: 'lights' };
  }

  setConfig(config: ChipCardConfig): void {
    // The editor stores the chip's entities under `entities_chip`.
    const c = { ...config } as ChipCardConfig & { entities_chip?: string[] };
    if (c.entities_chip) {
      c.entities = c.entities_chip;
      delete c.entities_chip;
    }
    super.setConfig(c);
  }

  protected validateConfig(config: ChipCardConfig): void {
    if (config.chips !== undefined) {
      if (!Array.isArray(config.chips) || !config.chips.length) {
        throw new Error('"chips" must be a list');
      }
      config.chips.forEach((s, i) => validateSegment(s, `chips[${i}]`));
      this.list = config.chips;
    } else {
      const seg = chipSegment(config);
      validateSegment(seg, 'chip');
      this.list = [seg];
    }
  }

  protected get segmentConfigs(): SegmentConfig[] {
    return this.list;
  }

  getCardSize(): number {
    return 1;
  }

  /** A single chip is one grid row (56 px); a list of chips can wrap, so it stays auto. */
  getGridOptions() {
    if (this.config?.chips) return { columns: 12, rows: 'auto', min_columns: 3 };
    return this.config?.icon_only ? this.gridOptions(3, 1, 2) : this.gridOptions(6, 1, 3);
  }

  private orb(v: SegmentView): TemplateResult {
    if (v.avatar) return avatar(v, 36, 13, paletteColor('green', this.dark));
    if (v.ring !== undefined) {
      return html`<span
        class="ring"
        style="--c:${rgbTriplet(v.rgb)};background:conic-gradient(rgb(${rgbTriplet(v.rgb)}) ${Math.max(0, Math.min(100, v.ring))}%, var(--gc-inset) 0)"
      >
        <span class="inner ico"><ha-icon .icon=${v.icon}></ha-icon></span>
      </span>`;
    }
    return dot(v.icon, toneDot(v), v.rgb, 36, 17, 16, v.pulse);
  }

  private pill(v: SegmentView, clickable: boolean) {
    const lit = v.tone === 'active' || v.tone === 'warning';
    return html`<div
      class="chip ${lit ? 'lit' : ''} ${v.tone} ${clickable ? 'clickable' : ''}"
      style="--c:${rgbTriplet(v.rgb)}"
      role="button"
      tabindex=${clickable ? 0 : -1}
      aria-disabled=${clickable ? 'false' : 'true'}
      aria-label=${[v.chipText, v.chipSub].filter(Boolean).join(', ')}
    >
      ${this.orb(v)}
      <span class="text">${v.chipText}</span>
      ${v.chipSub ? html`<span class="sub">${v.chipSub}</span>` : nothing}
    </div>`;
  }

  private iconChip(v: SegmentView, clickable: boolean) {
    const kind = v.tone === 'active' || v.tone === 'warning' ? 'on' : v.tone;
    return html`<div
      class="icon-chip ${kind} ${clickable ? 'clickable' : ''}"
      style="--c:${rgbTriplet(v.rgb)}"
      role="button"
      tabindex=${clickable ? 0 : -1}
      aria-disabled=${clickable ? 'false' : 'true'}
      aria-label=${[v.chipText, v.chipSub].filter(Boolean).join(', ')}
    >
      ${v.avatar ? avatar(v, 52, 17, paletteColor('green', this.dark)) : html`<span class="ico"><ha-icon .icon=${v.icon}></ha-icon></span>`}
      ${v.pulse ? html`<span class="ping"></span>` : nothing}
      ${v.badge && v.tone !== 'calm' ? html`<span class="badge">${v.badge}</span>` : nothing}
    </div>`;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    // A single alert chip with nothing to report takes no space in the dashboard.
    this.toggleAttribute(
      'hidden',
      !!this.hass && this.renderRoot.querySelector('[data-i]') === null,
    );
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const iconOnly = !!this.config.icon_only;
    return html`<div class="chips ${iconOnly ? 'icons' : ''}">
      ${this.list.map((cfg, i) => {
        const v = this.viewOf(cfg);
        if (!v || v.hidden) return nothing;
        const clickable = this.isClickable(cfg, v);
        const body = iconOnly ? this.iconChip(v, clickable) : this.pill(v, clickable);
        return html`<span
          class="wrap"
          data-i=${i}
          @pointerdown=${(e: PointerEvent) => clickable && this.segDown(i, e)}
          @pointerup=${() => clickable && this.segUp(i)}
          @pointercancel=${this.segCancel}
          @pointerleave=${this.segCancel}
          @keydown=${(e: KeyboardEvent) => clickable && this.segKey(i, e)}
          @contextmenu=${(e: Event) => e.preventDefault()}
          >${body}</span
        >`;
      })}
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
        font-family: var(--glow-font);
        color: var(--glow-text);
      }
      :host([hidden]) {
        display: none;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .chips.icons {
        gap: 12px;
        padding: 3px 3px 0 0;
      }
      .wrap {
        display: inline-flex;
        max-width: 100%;
        min-width: 0;
      }
      .chip {
        height: 56px;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-radius: 999px;
        padding: 0 16px 0 6px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 700;
        background: var(--gc-glass);
        border: 1px solid var(--gc-glass-border);
        backdrop-filter: var(--glow-blur);
        -webkit-backdrop-filter: var(--glow-blur);
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        transition:
          transform 0.12s,
          box-shadow 0.3s,
          background 0.3s;
      }
      .chip.lit {
        border-color: rgba(var(--c), var(--gc-chip-lit-border));
        background: linear-gradient(
          135deg,
          rgba(var(--c), var(--gc-chip-lit-tint)),
          var(--gc-chip-lit-base) 70%
        );
        box-shadow: var(--gc-chip-lit-shadow) rgba(var(--c), var(--gc-chip-lit-glow));
      }
      .chip.unavailable,
      .icon-chip.unavailable {
        opacity: 0.6;
        border-style: dashed;
        border-color: var(--glow-muted);
      }
      .clickable {
        cursor: pointer;
      }
      .clickable:active {
        transform: scale(0.97);
      }
      .chip:focus-visible,
      .icon-chip:focus-visible {
        box-shadow: 0 0 0 2px rgba(var(--c), 0.6);
      }
      .text,
      .sub {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .text {
        flex-shrink: 0;
        max-width: 100%;
      }
      .sub {
        min-width: 0;
        font-weight: 600;
        color: var(--glow-muted);
      }
      .ring {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 14px rgba(var(--c), var(--gc-ring-glow));
      }
      .inner {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--gc-chip-inner);
        color: rgb(var(--c));
        --i: 17px;
      }
      .icon-chip {
        position: relative;
        box-sizing: border-box;
        width: 52px;
        height: 52px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--gc-glass);
        border: 1px solid var(--gc-glass-border);
        backdrop-filter: var(--glow-blur);
        -webkit-backdrop-filter: var(--glow-blur);
        color: var(--glow-muted);
        -webkit-tap-highlight-color: transparent;
        outline: none;
        --i: 21px;
        --g: 22px;
      }
      .icon-chip.on {
        border: 0;
        background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.6), rgb(var(--c)) 62%);
        box-shadow: 0 0 calc(var(--g) * var(--gc-glow-f)) rgba(var(--c), var(--gc-glow-a));
        color: #ffffff;
      }
      .icon-chip.calm {
        border: 1px solid rgba(var(--c), 0.3);
        background: rgba(var(--c), var(--glow-calm));
        color: rgb(var(--c));
        backdrop-filter: none;
      }
      .icon-chip .avatar {
        position: absolute;
        inset: -1px;
        width: auto;
        height: auto;
      }
      .badge {
        position: absolute;
        top: -3px;
        right: -3px;
        min-width: 20px;
        height: 20px;
        box-sizing: border-box;
        padding: 0 5px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--gc-badge-bg);
        color: var(--gc-badge-fg);
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-chip',
    name: 'GlowCard Chip',
    description: 'Status chips (weather, lights, battery, security, alerts, people) with popups',
  },
  GlowChipCard,
);

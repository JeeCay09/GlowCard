import { css, html, nothing, type TemplateResult } from 'lit';
import type { GlowCardConfig } from '../../core/base-card';
import { handleAction, type ActionConfig } from '../../core/action';
import { rgbTriplet, rgbToHex } from '../../core/color';
import { registerCard } from '../../core/register';
import { configForm, editorLabel, fontField, sizeField } from '../../core/editor';
import type { HomeAssistant } from '../../types/hass';
import { GlowStatusBase, dot, toneDot } from '../status/status-base';
import type { SegmentConfig, SegmentView } from '../status/status-logic';
import { dotStyles, statusPopupStyles, statusTokens } from '../status/status-styles';
import {
  badgeSegment,
  badgeView,
  glowColor,
  iconLook,
  parseColor,
  type BadgeConfig,
} from './heading-logic';

export interface HeadingCardConfig extends GlowCardConfig {
  /** The heading text. */
  heading?: string;
  /** `title` (default): big title with icon; `subtitle`: small caps line to group sections. */
  heading_style?: 'title' | 'subtitle';
  /** Title: line under the heading. Subtitle: muted text on the right. */
  subtitle?: string;
  /** Entities shown as badges, or segment configs (YAML) like the status bar. */
  badges?: BadgeConfig[];
  /** Optional: the icon glows while this entity is on. Default: the icon stays neutral. */
  glow_entity?: string;
  /**
   * Icon colour (GlowCard or HA colour name, hex, or [r, g, b] from older configs). Shown as a tint without glow, and as the glow
   * colour while `glow_entity` is on. Default: neutral icon; glow in the light's colour.
   */
  glow_color?: string | number[];
}

/**
 * Heading from the GlowHeading board: a section title with a round icon, a line below
 * and small glass badges, or a small caps subtitle with a fading rule. Badges reuse the
 * status bar logic (tap/hold, popups for lights, energy, security and alerts).
 */
export class GlowHeadingCard extends GlowStatusBase<HeadingCardConfig> {
  private segs: SegmentConfig[] = [];

  static getConfigForm() {
    return configForm(
      [
        { name: 'heading', selector: { text: {} } },
        {
          name: '',
          type: 'grid',
          schema: [
            {
              name: 'heading_style',
              default: 'title',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: ['title', 'subtitle'].map((v) => ({
                    value: v,
                    label: editorLabel(`style_${v}` as 'style_title'),
                  })),
                },
              },
            },
            { name: 'icon', selector: { icon: {} } },
          ],
        },
        { name: 'subtitle', selector: { text: {} } },
        { name: 'badges', selector: { entity: { multiple: true } } },
        {
          name: '',
          type: 'expandable',
          title: 'glow_section',
          icon: 'mdi:shimmer',
          schema: [
            { name: 'glow_entity', selector: { entity: {} } },
            { name: 'glow_color', selector: { ui_color: {} } },
          ],
        },
        {
          name: '',
          type: 'expandable',
          title: 'actions_section',
          icon: 'mdi:gesture-tap',
          schema: [
            {
              name: 'tap_action',
              selector: {
                ui_action: {
                  actions: ['navigate', 'url', 'more-info', 'toggle', 'perform-action', 'none'],
                  default_action: 'none',
                },
              },
            },
          ],
        },
        {
          name: '',
          type: 'grid',
          schema: [fontField, sizeField],
        },
      ],
      {
        subtitle: 'heading_subtitle_helper',
        badges: 'badges_helper',
        glow_entity: 'glow_entity_helper',
        glow_color: 'glow_color_helper',
        tap_action: 'heading_tap_helper',
      },
      (config) => {
        const badges = config.badges;
        if (Array.isArray(badges) && badges.some((b) => typeof b !== 'string')) {
          throw new Error(editorLabel('badges_yaml_only'));
        }
      },
      // Older configs store [r, g, b] from the RGB picker; HA's colour list shows hex.
      (config) => {
        const rgb = parseColor(config.glow_color, false);
        return Array.isArray(config.glow_color) && rgb
          ? { ...config, glow_color: rgbToHex(rgb) }
          : config;
      },
    );
  }

  static getStubConfig(hass: HomeAssistant): Partial<HeadingCardConfig> {
    return { heading: hass.language?.startsWith('de') ? 'Überschrift' : 'Heading' };
  }

  protected validateConfig(config: HeadingCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.badges !== undefined && !Array.isArray(config.badges)) {
      throw new Error('"badges" must be a list');
    }
    if (config.heading_style && !['title', 'subtitle'].includes(config.heading_style)) {
      throw new Error('"heading_style" must be "title" or "subtitle"');
    }
    this.segs = (config.badges ?? []).map(badgeSegment);
    this.segs.forEach((s, i) => {
      if (s.type === 'entity' && !s.entity) throw new Error(`badges[${i}]: needs an entity`);
    });
  }

  protected get segmentConfigs(): SegmentConfig[] {
    return this.segs;
  }

  protected viewOf(cfg: SegmentConfig): SegmentView | undefined {
    return this.hass ? badgeView(this.hass, cfg, this.dark) : undefined;
  }

  protected watchedEntities(): string[] {
    const ids = super.watchedEntities();
    if (this.config?.glow_entity) ids.push(this.config.glow_entity);
    return ids;
  }

  getCardSize(): number {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 3 };
  }

  // ---------- title action ----------

  private get titleAction(): ActionConfig {
    return this.config?.tap_action ?? { action: 'none' };
  }

  private runTitle = (): void => {
    if (!this.hass || this.titleAction.action === 'none') return;
    void handleAction(
      { element: this, hass: this.hass, entity: this.config?.glow_entity },
      this.titleAction,
    );
  };

  private titleKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.runTitle();
  };

  // ---------- parts ----------

  private badges(): TemplateResult | typeof nothing {
    if (!this.segs.length) return nothing;
    return html`<div class="badges">
      ${this.segs.map((cfg, i) => {
        const v = this.viewOf(cfg);
        if (!v || v.hidden) return nothing;
        const clickable = this.isClickable(cfg, v);
        const lit = v.tone === 'active' || v.tone === 'warning';
        const kind = toneDot(v);
        return html`<span
          class="badge ${lit ? 'lit' : ''} ${v.tone} ${clickable ? 'clickable' : ''} ${
            this.openSeg === i ? 'open' : ''
          }"
          style="--c:${rgbTriplet(v.rgb)}"
          role="button"
          tabindex=${clickable ? 0 : -1}
          aria-disabled=${clickable ? 'false' : 'true'}
          aria-label=${[v.label, v.value].filter(Boolean).join(', ')}
          @pointerdown=${(e: PointerEvent) => clickable && this.segDown(i, e)}
          @pointerup=${() => clickable && this.segUp(i)}
          @pointercancel=${this.segCancel}
          @pointerleave=${this.segCancel}
          @keydown=${(e: KeyboardEvent) => clickable && this.segKey(i, e)}
          @contextmenu=${(e: Event) => e.preventDefault()}
        >
          ${dot(v.icon, kind === 'bare' ? 'off' : kind, v.rgb, 30, 15, 14, v.pulse)}
          <span class="val">${v.value}</span>
        </span>`;
      })}
    </div>`;
  }

  private chevron(): TemplateResult {
    return html`<span class="chev" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>
    </span>`;
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const c = this.config;
    const glowEntity = c.glow_entity ? this.hass.states[c.glow_entity] : undefined;
    const look = iconLook(glowEntity, c.glow_color, this.dark, this);
    const rgb = rgbTriplet(glowColor(glowEntity, c.glow_color, this.dark, this));
    const clickable = this.titleAction.action !== 'none';
    const heading = c.heading ?? '';
    const titleAttrs = clickable
      ? { role: 'button', tabindex: 0 }
      : { role: undefined, tabindex: undefined };

    if (c.heading_style === 'subtitle') {
      return html`<div class="sub-heading" style="--hc:${rgb}">
        <div
          class="sub-main ${clickable ? 'clickable' : ''}"
          role=${titleAttrs.role ?? nothing}
          tabindex=${titleAttrs.tabindex ?? nothing}
          @click=${this.runTitle}
          @keydown=${this.titleKey}
        >
          <span class="mark ${look}"></span>
          <span class="caps">${heading}</span>
          ${clickable ? this.chevron() : nothing}
        </div>
        <span class="rule"></span>
        ${c.subtitle ? html`<span class="meta">${c.subtitle}</span>` : nothing} ${this.badges()}
      </div>`;
    }

    return html`<div class="heading" style="--hc:${rgb}">
      <div
        class="main ${clickable ? 'clickable' : ''}"
        role=${titleAttrs.role ?? nothing}
        tabindex=${titleAttrs.tabindex ?? nothing}
        @click=${this.runTitle}
        @keydown=${this.titleKey}
      >
        ${
          c.icon
            ? html`<span class="orb ${look}"><ha-icon .icon=${c.icon}></ha-icon></span>`
            : nothing
        }
        <span class="texts">
          <span class="tline">
            <span class="title">${heading}</span>
            ${clickable ? this.chevron() : nothing}
          </span>
          ${c.subtitle ? html`<span class="subline">${c.subtitle}</span>` : nothing}
        </span>
      </div>
      ${this.badges()}
    </div>`;
  }

  static styles = [
    ...GlowStatusBase.styles,
    statusTokens,
    dotStyles,
    statusPopupStyles,
    css`
      :host {
        display: block;
        font-family: var(--glow-font);
        color: var(--glow-text);
        /* sizes from the GlowHeading board (desktop) */
        --hd-orb: 48px;
        --hd-orb-icon: 22px;
        --hd-orb-glow: 26px;
        --hd-title: 28px;
        --hd-badge-h: 40px;
        --hd-badge-pad: 0 14px 0 5px;
        --hd-badge-gap: 8px;
        --hd-badge-font: 14px;
        --hd-chev: 28px;
        --hd-caps: 13px;
        --hd-mark: 8px;
        --hd-meta: 12px;
        --dot-scale: 1;
        --hd-rule: linear-gradient(90deg, rgba(20, 22, 26, 0.16), rgba(20, 22, 26, 0));
      }
      :host([dark]) {
        --hd-rule: linear-gradient(90deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0));
      }
      @media (max-width: 600px) {
        :host(:not([size='normal'])) {
          --hd-orb: 36px;
          --hd-orb-icon: 17px;
          --hd-orb-glow: 18px;
          --hd-title: 22px;
          --hd-badge-h: 32px;
          --hd-badge-pad: 0 11px 0 4px;
          --hd-badge-gap: 6px;
          --hd-badge-font: 12px;
          --hd-chev: 24px;
          --hd-caps: 12px;
          --hd-mark: 7px;
          --hd-meta: 11px;
          --dot-scale: 0.8;
        }
        :host(:not([size='normal'])) .heading .badges {
          flex-basis: 100%;
          flex-wrap: wrap;
        }
      }
      :host([size='compact']) {
        --hd-orb: 36px;
        --hd-orb-icon: 17px;
        --hd-orb-glow: 18px;
        --hd-title: 22px;
        --hd-badge-h: 32px;
        --hd-badge-pad: 0 11px 0 4px;
        --hd-badge-gap: 6px;
        --hd-badge-font: 12px;
        --hd-chev: 24px;
        --hd-caps: 12px;
        --hd-mark: 7px;
        --hd-meta: 11px;
        --dot-scale: 0.8;
      }
      :host([size='compact']) .heading .badges {
        flex-basis: 100%;
        flex-wrap: wrap;
      }

      /* ---------- title ---------- */
      .heading {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
        padding: 4px 0;
      }
      .main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        border-radius: 999px;
        outline: none;
        -webkit-tap-highlight-color: transparent;
      }
      :host([size='compact']) .main {
        gap: 10px;
      }
      .clickable {
        cursor: pointer;
      }
      .main.clickable:focus-visible,
      .sub-main.clickable:focus-visible {
        box-shadow: 0 0 0 2px var(--glow-muted);
      }
      .orb {
        width: var(--hd-orb);
        height: var(--hd-orb);
        flex-shrink: 0;
        box-sizing: border-box;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--gc-glass);
        border: 1px solid var(--gc-glass-border);
        backdrop-filter: var(--glow-blur);
        -webkit-backdrop-filter: var(--glow-blur);
        color: var(--glow-muted);
        transition:
          background 0.3s,
          box-shadow 0.3s;
      }
      .orb ha-icon {
        display: flex;
        --mdc-icon-size: var(--hd-orb-icon);
      }
      .orb.on {
        border: 0;
        background: radial-gradient(
          circle at 35% 30%,
          color-mix(in srgb, #ffffff 60%, rgb(var(--hc))),
          rgb(var(--hc)) 62%
        );
        box-shadow: 0 0 calc(var(--hd-orb-glow) * var(--gc-glow-f))
          rgba(var(--hc), var(--gc-glow-a));
        color: #ffffff;
      }
      .orb.tint {
        background: rgba(var(--hc), 0.14);
        border-color: rgba(var(--hc), 0.32);
        color: rgb(var(--hc));
      }
      .texts {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .tline {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .title {
        font-size: var(--hd-title);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        /* overflow: hidden clips at the 1.1 line box, which cuts the descenders of
           g/j/p/y and the dots of Ä/Ö/Ü. Grow the clip box, keep the layout unchanged. */
        padding: 0.15em 0;
        margin: -0.15em 0;
      }
      .subline {
        font-size: 13px;
        font-weight: 600;
        color: var(--glow-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chev {
        width: var(--hd-chev);
        height: var(--hd-chev);
        flex-shrink: 0;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--gc-inset);
        color: var(--glow-muted);
      }
      .chev svg {
        width: 50%;
        height: 50%;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* ---------- badges ---------- */
      .badges {
        display: flex;
        gap: var(--hd-badge-gap);
        flex-shrink: 0;
        min-width: 0;
      }
      .badge {
        height: var(--hd-badge-h);
        box-sizing: border-box;
        border-radius: 999px;
        padding: var(--hd-badge-pad);
        display: flex;
        align-items: center;
        gap: var(--hd-badge-gap);
        font-size: var(--hd-badge-font);
        font-weight: 800;
        letter-spacing: -0.01em;
        white-space: nowrap;
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
      .badge.lit {
        border-color: rgba(var(--c), var(--gc-chip-lit-border));
        background: linear-gradient(
          135deg,
          rgba(var(--c), var(--gc-chip-lit-tint)),
          var(--gc-chip-lit-base) 70%
        );
        box-shadow: var(--gc-chip-lit-shadow) rgba(var(--c), var(--gc-chip-lit-glow));
      }
      .badge.warning .val {
        color: rgb(var(--c));
      }
      .badge.unavailable {
        opacity: 0.6;
        border-style: dashed;
        border-color: var(--glow-muted);
      }
      .badge.clickable:active {
        transform: scale(0.97);
      }
      .badge:focus-visible,
      .badge.open {
        box-shadow: 0 0 0 2px rgba(var(--c), 0.6);
      }

      /* ---------- subtitle ---------- */
      .sub-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 28px;
      }
      .sub-main {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        border-radius: 999px;
        outline: none;
      }
      .mark {
        width: var(--hd-mark);
        height: var(--hd-mark);
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--glow-muted);
        opacity: 0.5;
      }
      .mark.tint {
        opacity: 1;
        background: rgb(var(--hc));
      }
      .mark.on {
        opacity: 1;
        background: rgb(var(--hc));
        box-shadow: 0 0 10px rgba(var(--hc), 0.8);
      }
      .caps {
        font-size: var(--hd-caps);
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sub-heading .chev {
        --hd-chev: 22px;
      }
      .rule {
        flex: 1 1 24px;
        height: 1px;
        background: var(--hd-rule);
      }
      .meta {
        font-size: var(--hd-meta);
        font-weight: 700;
        color: var(--glow-muted);
        white-space: nowrap;
      }
      .sub-heading .badges {
        --hd-badge-h: 32px;
        --hd-badge-pad: 0 11px 0 4px;
        --hd-badge-gap: 6px;
        --hd-badge-font: 12px;
        --dot-scale: 0.8;
      }
    `,
  ];
}

registerCard(
  {
    type: 'glowcard-heading',
    name: 'GlowCard Heading',
    description: 'Section heading with icon, badges and an optional glow, or a small subtitle',
  },
  GlowHeadingCard,
);

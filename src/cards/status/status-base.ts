import { html, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { GlowCardBase, type GlowCardConfig } from '../../core/base-card';
import { handleAction, type ActionConfig } from '../../core/action';
import { fireEvent } from '../../core/fire-event';
import { sameDay } from '../../core/format';
import { localize } from '../../core/localize';
import { lightColor, rgbTriplet, type Rgb } from '../../core/color';
import { brightnessPct, lightCaps } from '../light/light-logic';
import type { HassEntity } from '../../types/hass';
import {
  alertDetail,
  alertName,
  areaOf,
  batteryMode,
  defaultTap,
  energyNow,
  findAlertParts,
  formatKw,
  formatPct,
  formatTime,
  formatWhen,
  isProblem,
  isUnavailable,
  lightIds,
  lightsLabel,
  lightsOn,
  paletteColor,
  refId,
  refName,
  securityIcon,
  securityRefs,
  securityState,
  segmentEntities,
  segmentView,
  stateText,
  type SegmentConfig,
  type SegmentView,
} from './status-logic';
import { st } from './status-i18n';
import { dotStyles, statusPopupStyles, statusTokens } from './status-styles';
import '../../components/orb';
import '../../components/slider';

const HOLD_MS = 500;

/** Small orb: `on`, `off`, `calm` or `bare`, with optional pulse ring. */
export function dot(
  icon: string,
  kind: 'on' | 'off' | 'calm' | 'bare',
  rgb: Rgb,
  size: number,
  iconSize: number,
  glow: number,
  pulse = false,
  extra: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  return html`<span
    class="dot ${kind}"
    style="--c:${rgbTriplet(rgb)};--s:${size}px;--i:${iconSize}px;--g:${glow}px"
  >
    ${pulse ? html`<span class="ping"></span>` : nothing}
    ${extra === nothing ? html`<ha-icon .icon=${icon}></ha-icon>` : extra}
  </span>`;
}

export function toneDot(v: SegmentView): 'on' | 'off' | 'calm' | 'bare' {
  if (v.bareIcon && v.tone === 'neutral') return 'bare';
  if (v.tone === 'active' || v.tone === 'warning') return 'on';
  if (v.tone === 'calm') return 'calm';
  return 'off';
}

const ALERT_PATH = 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5';

/**
 * Shared behaviour of header, status bar and chips: segment views, tap/hold per segment
 * and the popups from the GlowChips board (Lichter an, Energie jetzt, Sicherheit, Warnung).
 */
export abstract class GlowStatusBase<C extends GlowCardConfig> extends GlowCardBase<C> {
  /** Index of the segment whose popup is open (it gets the tinted ring). */
  @state() protected openSeg?: number;
  /** Lights listed in the lights popup: the ones on when it opened, plus any turned on. */
  private popupLights: string[] = [];
  private holdTimer?: number;
  private held = false;

  protected popupStyle = 'glow' as const;

  /** The segments (status bar) or chips of this card. */
  protected abstract get segmentConfigs(): SegmentConfig[];

  /** Subclasses check their own config; there is no single main entity here. */
  protected validateConfig(config: C): void {
    if (!config) throw new Error('Invalid configuration');
  }

  protected watchedEntities(): string[] {
    return [...new Set(this.segmentConfigs.flatMap((c) => segmentEntities(this.hass, c)))];
  }

  protected viewOf(cfg: SegmentConfig): SegmentView | undefined {
    return this.hass ? segmentView(this.hass, cfg, this.dark) : undefined;
  }

  protected tapAction(cfg: SegmentConfig, v: SegmentView): ActionConfig {
    return cfg.tap_action ?? defaultTap(v);
  }

  protected isClickable(cfg: SegmentConfig, v: SegmentView): boolean {
    const a = this.tapAction(cfg, v);
    return a.action !== 'none' && !(a.action === 'popup' && !v.popup);
  }

  // ---------- tap / hold per segment ----------

  protected segDown = (i: number, ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    this.held = false;
    window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => {
      this.held = true;
      void this.runSegment(i, 'hold');
    }, HOLD_MS);
  };

  protected segUp = (i: number): void => {
    window.clearTimeout(this.holdTimer);
    if (!this.held) void this.runSegment(i, 'tap');
    this.held = false;
  };

  protected segCancel = (): void => {
    window.clearTimeout(this.holdTimer);
  };

  protected segKey = (i: number, ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    void this.runSegment(i, 'tap');
  };

  protected async runSegment(i: number, kind: 'tap' | 'hold'): Promise<void> {
    const cfg = this.segmentConfigs[i];
    const v = cfg && this.viewOf(cfg);
    if (!this.hass || !cfg || !v) return;
    let action: ActionConfig =
      kind === 'tap'
        ? this.tapAction(cfg, v)
        : (cfg.hold_action ?? (v.entity ? { action: 'more-info' } : { action: 'none' }));
    if (action.action === 'popup' && !v.popup) action = { action: 'more-info' };
    await handleAction(
      { element: this, hass: this.hass, entity: v.entity, openPopup: () => this.openSegment(i) },
      action,
    );
  }

  protected openSegment(i: number): void {
    const cfg = this.segmentConfigs[i];
    if (!cfg || !this.hass) return;
    this.openSeg = i;
    if (cfg.type === 'lights') this.popupLights = lightsOn(this.hass, lightIds(this.hass, cfg));
    this.openPopup();
  }

  protected popupClosed(): void {
    this.openSeg = undefined;
    this.popupLights = [];
  }

  // ---------- popup header (orb, glow) ----------

  protected get openCfg(): SegmentConfig | undefined {
    return this.openSeg === undefined ? undefined : this.segmentConfigs[this.openSeg];
  }

  /** Header view of the open popup; the battery chip opens the energy popup. */
  private get popupView(): SegmentView | undefined {
    const cfg = this.openCfg;
    if (!cfg) return undefined;
    return this.viewOf(cfg.type === 'battery' ? { ...cfg, type: 'energy' } : cfg);
  }

  protected get icon(): string {
    const cfg = this.openCfg;
    if (cfg?.type === 'energy' || cfg?.type === 'battery') {
      return cfg.type === 'energy' && cfg.icon ? cfg.icon : 'mdi:white-balance-sunny';
    }
    if (cfg?.type === 'alert') return 'mdi:alert';
    return this.popupView?.icon ?? 'mdi:circle-outline';
  }

  protected get isActive(): boolean {
    const t = this.popupView?.tone;
    return t === 'active' || t === 'warning';
  }

  protected get popupCalm(): boolean {
    return this.popupView?.tone === 'calm';
  }

  protected get isUnavailable(): boolean {
    return false;
  }

  protected get accent(): Rgb {
    return this.popupView?.rgb ?? paletteColor('warm', this.dark);
  }

  protected get darkIcon(): boolean {
    return false;
  }

  /** Popup orb: lights switch all listed lights; other popups have no orb action. */
  protected toggle = async (ev?: Event): Promise<void> => {
    ev?.stopPropagation();
    if (this.openCfg?.type === 'lights') this.bulkLights();
  };

  // ---------- popups ----------

  protected renderPopup() {
    const cfg = this.openCfg;
    if (!cfg || !this.hass) return undefined;
    switch (cfg.type) {
      case 'lights':
        return this.lightsPopup(cfg);
      case 'energy':
      case 'battery':
        return this.energyPopup(cfg);
      case 'security':
        return this.securityPopup(cfg);
      case 'alert':
        return this.alertPopup(cfg);
      default:
        return undefined;
    }
  }

  protected popupStyles() {
    return [statusTokens, dotStyles, statusPopupStyles];
  }

  private moreInfo(entityId: string) {
    return () => fireEvent(this, 'hass-more-info', { entityId });
  }

  private call(domain: string, service: string, data: Record<string, unknown>): void {
    void this.hass?.callService(domain, service, data);
  }

  // Lichter an

  private listedLights(cfg: SegmentConfig): string[] {
    if (!this.hass) return [];
    const now = lightsOn(this.hass, lightIds(this.hass, cfg));
    const list = [...this.popupLights, ...now.filter((id) => !this.popupLights.includes(id))];
    return list.sort((a, b) =>
      refName(this.hass!, a).localeCompare(refName(this.hass!, b), undefined, { numeric: true }),
    );
  }

  private bulkLights = (): void => {
    const cfg = this.openCfg;
    if (!cfg || !this.hass) return;
    const list = this.listedLights(cfg);
    const on = lightsOn(this.hass, list);
    if (on.length) this.call('light', 'turn_off', { entity_id: on });
    else if (list.length) this.call('light', 'turn_on', { entity_id: list });
  };

  private lightSince(e: HassEntity): string {
    const changed = new Date(e.last_changed);
    if (e.state === 'on')
      return st(this.hass, 'on_since', { when: formatWhen(this.hass, changed) });
    if (Date.now() - changed.getTime() < 60_000) return st(this.hass, 'just_off');
    return st(this.hass, 'off_since', { when: formatWhen(this.hass, changed) });
  }

  private lightRow(id: string) {
    const hass = this.hass!;
    const e = hass.states[id];
    if (!e) return nothing;
    const on = e.state === 'on';
    const rgb = lightColor(e) ?? paletteColor('warm', this.dark);
    const caps = lightCaps(e);
    const pct = brightnessPct(e);
    const c = rgbTriplet(rgb);
    const pctText = on
      ? caps.brightness
        ? formatPct(hass, pct)
        : localize(hass, 'on')
      : st(hass, 'lights_off_short');
    const name = refName(hass, id);
    const setBrightness = (ev: CustomEvent<{ value: number }>) => {
      const v = ev.detail.value;
      if (v <= 0) this.call('light', 'turn_off', { entity_id: id });
      else this.call('light', 'turn_on', { entity_id: id, brightness_pct: v });
    };
    return html`<div
      class="lrow ${on ? 'lit' : ''}"
      style="--glow-accent:${c};--glow-fill-h:linear-gradient(90deg, rgba(${c},.55), rgb(${c}))"
    >
      <glowcard-orb
        .icon=${'mdi:lightbulb'}
        .size=${44}
        ?active=${on}
        label=${name}
        @click=${() => this.call('light', 'toggle', { entity_id: id })}
      ></glowcard-orb>
      <div class="lbody">
        <div class="lhead">
          <span class="lname">${name}</span>
          <span class="lpct ${on ? '' : 'off'}">${pctText}</span>
        </div>
        <glowcard-slider
          plain
          .value=${on ? (caps.brightness ? pct : 100) : 0}
          ?disabled=${!caps.brightness || isUnavailable(e)}
          label=${name}
          @value-changed=${setBrightness}
        ></glowcard-slider>
        <span class="since">${this.lightSince(e)}</span>
      </div>
    </div>`;
  }

  private lightsPopup(cfg: SegmentConfig) {
    const hass = this.hass!;
    const list = this.listedLights(cfg);
    const n = lightsOn(hass, list).length;
    const areas = [...new Set(list.map((id) => areaOf(hass, id)).filter(Boolean))];
    const subtitle =
      areas.length === 1
        ? (areas[0] as string)
        : areas.length > 1
          ? st(hass, 'areas', { n: areas.length })
          : '';
    return {
      heading: lightsLabel(hass, n),
      subtitle,
      content: html`<div class="rows">
          ${
            list.length
              ? list.map((id) => this.lightRow(id))
              : html`<span class="empty">${lightsLabel(hass, 0)}</span>`
          }
        </div>
        ${
          list.length
            ? html`<div class="actions">
                <button @click=${this.bulkLights}>
                  ${n ? st(hass, 'all_off') : st(hass, 'all_on_again')}
                </button>
              </div>`
            : nothing
        }`,
    };
  }

  // Energie jetzt

  private infoRow(
    icon: string,
    label: string,
    sub: string,
    value: string,
    kind: 'on' | 'off' | 'calm',
    rgb: Rgb,
    onClick?: () => void,
    muted = false,
  ) {
    return html`<div
      class="irow"
      style=${onClick ? 'cursor:pointer' : ''}
      @click=${onClick ?? (() => undefined)}
    >
      ${dot(icon, kind, rgb, 40, 18, 14)}
      <div class="itext">
        <span class="ilabel">${label}</span>
        <span class="isub">${sub}</span>
      </div>
      <span class="ival ${muted ? 'off' : ''}">${value}</span>
    </div>`;
  }

  private energyPopup(cfg: SegmentConfig) {
    const hass = this.hass!;
    const d = this.dark;
    const now = energyNow(hass, cfg);
    const rows: TemplateResult[] = [];
    const more = (id?: string) => (id ? this.moreInfo(id) : undefined);
    if (now.solar !== null) {
      const on = now.solar >= 5;
      rows.push(
        this.infoRow(
          'mdi:white-balance-sunny',
          st(hass, 'solar'),
          st(hass, on ? 'producing' : 'not_producing'),
          formatKw(hass, now.solar),
          on ? 'on' : 'off',
          paletteColor('solar', d),
          more(cfg.solar),
          !on,
        ),
      );
    }
    if (now.home !== null) {
      rows.push(
        this.infoRow(
          'mdi:home',
          st(hass, 'home'),
          st(hass, 'consumption'),
          formatKw(hass, now.home),
          'calm',
          paletteColor('home', d),
          more(cfg.home),
        ),
      );
    }
    if (now.battery !== null || now.soc !== null) {
      const mode = batteryMode(hass, now.battery);
      const sub = [now.soc !== null ? formatPct(hass, now.soc) : '', mode]
        .filter(Boolean)
        .join(' · ');
      const charging = (now.battery ?? 0) > 20;
      rows.push(
        this.infoRow(
          'mdi:battery',
          st(hass, 'battery'),
          sub,
          now.battery !== null ? formatKw(hass, now.battery, true) : formatPct(hass, now.soc ?? 0),
          charging ? 'on' : 'calm',
          paletteColor('green', d),
          more(cfg.battery_power ?? cfg.battery),
        ),
      );
    }
    if (now.grid !== null) {
      const g = now.grid;
      const idle = Math.abs(g) < 5;
      rows.push(
        this.infoRow(
          'mdi:transmission-tower',
          st(hass, 'grid'),
          idle ? st(hass, 'grid_idle') : st(hass, g > 0 ? 'importing' : 'exporting'),
          formatKw(hass, Math.abs(g)),
          idle ? 'off' : g > 0 ? 'on' : 'calm',
          paletteColor('grid', d),
          more(cfg.grid),
          idle,
        ),
      );
    }
    const path = cfg.navigation_path ?? '/energy';
    const open = () => {
      this.closePopup();
      void handleAction({ element: this, hass }, { action: 'navigate', navigation_path: path });
    };
    return {
      heading: st(hass, 'energy_now'),
      subtitle: st(hass, 'as_of', { time: formatTime(hass, new Date()) }),
      content: html`<div class="info">${rows}</div>
        <div class="actions"><button @click=${open}>${st(hass, 'open_energy')}</button></div>`,
    };
  }

  // Sicherheit

  private securityPopup(cfg: SegmentConfig) {
    const hass = this.hass!;
    const refs = securityRefs(cfg);
    const k = refs.filter((r) => isProblem(hass.states[refId(r)])).length;
    const n = refs.length;
    const subtitle =
      k > 0
        ? st(hass, 'some_alerting', { k, n })
        : n === 1
          ? st(hass, 'one_quiet')
          : st(hass, 'all_quiet', { n });
    const green = paletteColor('green', this.dark);
    const red = paletteColor('red', this.dark);
    const rows = refs.map((r) => {
      const id = refId(r);
      const e = hass.states[id];
      const p = isProblem(e);
      const members = e?.attributes.entity_id;
      const sub = Array.isArray(members)
        ? st(hass, e?.attributes.device_class === 'smoke' ? 'members_smoke' : 'members', {
            n: members.length,
          })
        : e
          ? st(hass, 'since', { when: formatWhen(hass, new Date(e.last_changed)) })
          : '';
      return this.infoRow(
        securityIcon(e),
        refName(hass, r),
        sub,
        securityState(hass, e),
        isUnavailable(e) ? 'off' : p ? 'on' : 'calm',
        p ? red : green,
        this.moreInfo(id),
      );
    });
    return {
      heading: this.popupView?.value ?? '',
      subtitle,
      content: html`<div class="info">${rows}</div>`,
    };
  }

  // Warnung (e.g. robot vacuum)

  private alertPopup(cfg: SegmentConfig) {
    const hass = this.hass!;
    const id = cfg.entity ?? '';
    const e = hass.states[id];
    const parts = findAlertParts(hass, cfg);
    const vac = parts.vacuum ? hass.states[parts.vacuum] : undefined;
    const name = alertName(hass, cfg);
    const reported = e ? new Date(e.last_changed) : new Date();
    const time = formatTime(hass, reported);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const day = sameDay(reported, now)
      ? st(hass, 'today')
      : sameDay(reported, yesterday)
        ? st(hass, 'yesterday')
        : new Intl.DateTimeFormat(hass.language, { day: '2-digit', month: '2-digit' }).format(
            reported,
          );
    let text = st(hass, 'reported', { when: st(hass, 'reported_at', { day, time }) });
    if (vac?.state === 'paused') text += ` ${st(hass, 'paused_since_report', { name })}`;
    const subtitle = vac
      ? `${stateText(hass, vac)} ${st(hass, 'since', { when: formatTime(hass, new Date(vac.last_changed)) })}`
      : st(hass, 'since', { when: formatWhen(hass, reported) });
    const actions = vac
      ? html`<button
            class="primary"
            @click=${() => this.call('vacuum', 'start', { entity_id: vac.entity_id })}
          >
            ${st(hass, 'resume')}
          </button>
          <button
            @click=${() => this.call('vacuum', 'return_to_base', { entity_id: vac.entity_id })}
          >
            ${st(hass, 'to_base')}
          </button>`
      : html`<button @click=${this.moreInfo(id)}>${st(hass, 'details')}</button>`;
    return {
      heading: name,
      subtitle,
      content: html`<div class="alert">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d=${ALERT_PATH}></path>
          </svg>
          <div class="atext">
            <span class="atitle">${alertDetail(hass, cfg)}</span>
            <span class="asub">${text}</span>
          </div>
        </div>
        <div class="actions">${actions}</div>`,
    };
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.holdTimer);
  }
}

/** Person avatar: picture or initial, green ring + glow while at home. */
export function avatar(
  v: SegmentView,
  size: number,
  fontSize: number,
  green: Rgb,
  overlap = false,
): TemplateResult {
  const a = v.avatar!;
  return html`<span
    class="avatar ${a.home ? 'home' : ''} ${overlap ? 'overlap' : ''}"
    style="--c:${rgbTriplet(green)};--s:${size}px;font-size:${fontSize}px"
  >
    ${a.picture ? html`<img src=${a.picture} alt="" />` : a.initial}
  </span>`;
}

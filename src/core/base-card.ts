import { LitElement, nothing, type CSSResult, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HassEntity, HomeAssistant } from '../types/hass';
import { handleAction, type ActionConfig } from './action';
import { isBright, mix, rgbTriplet, resolveAccent, type Rgb } from './color';
import { DEFAULT_GESTURES, cleanConfig, type ConfigForm, type GestureSpec } from './editor';
import { ensureHaForm, type GlowCardEditor } from './editor-element';
import { ensureFont } from './font';
import { PressController } from './press';
import { localize } from './localize';
import { glassStyles, glowTokens } from './theme';
import { openPopup, type GlowPopup } from '../components/popup';

export interface GlowCardConfig {
  type: string;
  entity?: string;
  name?: string;
  icon?: string;
  color?: string;
  /** `glow` (default) uses the embedded Plus Jakarta Sans, `theme` the HA theme font. */
  font?: 'glow' | 'theme';
  /** `auto` (default) = compact on phones (< 600 px), `compact` = always, `normal` = never. */
  size?: 'auto' | 'compact' | 'normal';
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

const UNAVAILABLE = new Set(['unavailable', 'unknown']);

const DEFAULT_ICONS: Record<string, string> = {
  light: 'mdi:lightbulb',
  switch: 'mdi:toggle-switch-variant',
  input_boolean: 'mdi:toggle-switch-variant',
  fan: 'mdi:fan',
};

/**
 * Card picker stub: an empty `entity`. Home Assistant passes the dashboard's unused
 * entities here (not the one chosen), so GlowCard picks none of them. The empty key is
 * needed: "by entity" fills in the chosen entity only if the stub has an `entity` field.
 */
export function stubEntity(): { entity: string } {
  return { entity: '' };
}

/** Accent-derived colours from the mockups, applied to card and popup. */
function applyAccent(el: HTMLElement, accent: Rgb): void {
  const css = (c: Rgb) => `rgb(${c.join(',')})`;
  el.style.setProperty('--glow-accent', rgbTriplet(accent));
  el.style.setProperty(
    '--glow-fill-h',
    `linear-gradient(90deg, ${css(mix(accent, [0, 0, 0], 0.25))}, ${css(mix(accent, [255, 255, 255], 0.3))})`,
  );
  el.style.setProperty(
    '--glow-fill-v',
    `linear-gradient(180deg, ${css(mix(accent, [255, 255, 255], 0.35))}, ${css(accent)} 60%, ${css(mix(accent, [0, 0, 0], 0.22))})`,
  );
  el.style.setProperty('--glow-knob', css(mix(accent, [255, 255, 255], 0.75)));
}

/** Shared behaviour of all GlowCard cards. */
export abstract class GlowCardBase<C extends GlowCardConfig = GlowCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config?: C;

  static styles: CSSResult[] = [glowTokens, glassStyles];

  /** Accent name used when the config has no `color`. */
  protected defaultColor = 'amber';
  /** Tap anywhere on the card (orb included) switches, holding opens the GlowCard popup. */
  protected defaultTapAction: ActionConfig = { action: 'toggle' };
  protected defaultHoldAction: ActionConfig = { action: 'popup' };

  /** Visual editor: HA's ha-form with the card's getConfigForm() and the gesture choices. */
  static async getConfigElement(): Promise<HTMLElement> {
    await ensureHaForm();
    const cls = this as unknown as {
      getConfigForm(): ConfigForm;
      gestureSpec?(config: Record<string, unknown>): GestureSpec | undefined;
    };
    const el = document.createElement('glowcard-editor') as GlowCardEditor;
    el.form = cls.getConfigForm();
    if (cls.gestureSpec?.({})) el.gestures = (config) => cls.gestureSpec!(config);
    return el;
  }

  /** Gesture choices in the editor; cards without tap/hold actions return undefined. */
  static gestureSpec(): GestureSpec | undefined {
    return DEFAULT_GESTURES;
  }

  private popup?: GlowPopup;
  protected press = new PressController(
    this,
    () => void this.runAction('tap'),
    () => void this.runAction('hold'),
  );

  setConfig(config: C): void {
    if (!config) throw new Error('Invalid configuration');
    config = cleanConfig(config);
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Throw an Error with a readable message for a bad config. A missing entity is fine:
   * new cards start without one and show "Choose an entity" until it is picked.
   */
  protected validateConfig(config: C): void {
    if (!config) throw new Error('Invalid configuration');
  }

  getCardSize(): number {
    return 2;
  }

  /** Entities whose changes re-render the card (default: the main entity). */
  protected watchedEntities(): string[] {
    return this.config?.entity ? [this.config.entity] : [];
  }

  /** Re-render only when a watched entity, the theme or the language changed. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has('hass') || changed.size > 1) return true;
    const old = changed.get('hass') as HomeAssistant | undefined;
    if (!old || !this.hass) return true;
    if (
      old.themes?.darkMode !== this.hass.themes?.darkMode ||
      old.language !== this.hass.language
    ) {
      return true;
    }
    return this.watchedEntities().some((id) => old.states[id] !== this.hass!.states[id]);
  }

  /** Area name of an entity (entity area first, then its device's area). */
  protected areaName(entityId?: string): string | undefined {
    const id = entityId ?? this.config?.entity;
    if (!id || !this.hass) return undefined;
    const entry = this.hass.entities?.[id];
    const areaId =
      entry?.area_id ??
      (entry?.device_id ? this.hass.devices?.[entry.device_id]?.area_id : undefined);
    return areaId ? this.hass.areas?.[areaId]?.name : undefined;
  }

  protected friendlyName(entityId: string): string {
    return this.hass?.states[entityId]?.attributes.friendly_name ?? entityId;
  }

  get dark(): boolean {
    return this.hass?.themes?.darkMode ?? false;
  }

  protected get stateObj(): HassEntity | undefined {
    return this.config?.entity ? this.hass?.states[this.config.entity] : undefined;
  }

  protected get isUnavailable(): boolean {
    const s = this.stateObj?.state;
    return s === undefined || UNAVAILABLE.has(s);
  }

  protected get isActive(): boolean {
    return this.stateObj?.state === 'on';
  }

  protected get displayName(): string {
    return (
      this.config?.name ??
      this.stateObj?.attributes.friendly_name ??
      (this.config?.entity || localize(this.hass, 'pick_entity'))
    );
  }

  /** Accent colour; cards can override, e.g. lights use their current colour. */
  protected get accent(): Rgb {
    return resolveAccent(this.config?.color, this.dark, this.defaultColor);
  }

  /** True for very light accents (e.g. warm white): icons and labels on them turn dark. */
  protected get darkIcon(): boolean {
    return isBright(this.accent);
  }

  protected get icon(): string {
    const fromEntity = this.stateObj?.attributes.icon;
    if (this.config?.icon) return this.config.icon;
    if (typeof fromEntity === 'string') return fromEntity;
    const domain = this.config?.entity?.split('.')[0] ?? '';
    return DEFAULT_ICONS[domain] ?? 'mdi:circle-outline';
  }

  /** Popup title, subtitle and body; return undefined when the card has no popup. */
  protected renderPopup():
    { heading: string; subtitle?: string; content: TemplateResult } | undefined {
    return undefined;
  }

  /** Extra styles for the popup content. */
  protected popupStyles(): CSSResult[] {
    return [];
  }

  /** `tint` (light/climate popups) or `glow` (switch/plug popups: plain glass + glow). */
  protected popupStyle: 'tint' | 'glow' = 'tint';

  /** Called when the popup opens, e.g. to load history. */
  protected popupOpened(): void {}

  /** Called after the popup was closed. */
  protected popupClosed(): void {}

  /** Popup orb in the soft "calm" style (tinted background, coloured icon). */
  protected get popupCalm(): boolean {
    return false;
  }

  protected get popupOpen(): boolean {
    return this.popup !== undefined;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.config?.font !== 'theme') ensureFont();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.closePopup();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('config') && this.config?.font !== 'theme') ensureFont();
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.toggleAttribute('dark', this.dark);
    if (this.config?.font === 'theme') this.setAttribute('font', 'theme');
    else this.removeAttribute('font');
    const size = this.config?.size;
    if (size === 'compact' || size === 'normal') this.setAttribute('size', size);
    else this.removeAttribute('size');
    applyAccent(this, this.accent);
    this.syncPopup();
  }

  protected openPopup = (): void => {
    const view = this.renderPopup();
    if (!view) return;
    this.closePopup();
    this.popup = openPopup({ contentStyles: this.popupStyles() });
    this.popup.addEventListener('closed', () => {
      this.popup = undefined;
      this.popupClosed();
    });
    this.popup.addEventListener('orb-tap', () => void this.toggle());
    this.syncPopup();
    this.popupOpened();
  };

  /** Re-renders the open popup, e.g. after history was loaded. */
  protected refreshPopup(): void {
    this.syncPopup();
  }

  protected closePopup(): void {
    this.popup?.close();
    this.popup = undefined;
  }

  private syncPopup(): void {
    if (!this.popup) return;
    const view = this.renderPopup();
    this.popup.dark = this.dark;
    this.popup.font = this.config?.font;
    applyAccent(this.popup, this.accent);
    this.popup.heading = view?.heading ?? '';
    this.popup.subtitle = view?.subtitle ?? '';
    this.popup.icon = this.icon;
    this.popup.active = this.isActive;
    this.popup.darkIcon = this.darkIcon;
    this.popup.calm = this.popupCalm;
    this.popup.toggleAttribute('glow-only', this.popupStyle === 'glow');
    this.popup.toggleAttribute('unavailable', this.isUnavailable);
    this.popup.content = view?.content ?? nothing;
  }

  protected async runAction(kind: 'tap' | 'hold'): Promise<void> {
    if (!this.hass || !this.config) return;
    const config =
      kind === 'tap'
        ? (this.config.tap_action ?? this.defaultTapAction)
        : (this.config.hold_action ?? this.defaultHoldAction);
    const effective =
      config.action === 'popup' && !this.renderPopup() ? { action: 'more-info' as const } : config;
    if (effective.action === 'toggle' && !effective.entity) {
      await this.toggleMain();
      return;
    }
    await handleAction(
      { element: this, hass: this.hass, entity: this.config.entity, openPopup: this.openPopup },
      effective,
    );
  }

  /** Toggles the main entity (tap default, popup orb). */
  protected toggle = async (ev?: Event): Promise<void> => {
    ev?.stopPropagation();
    await this.toggleMain();
  };

  /** What "toggle" means for this card; switch groups switch all members. */
  protected async toggleMain(): Promise<void> {
    if (!this.hass || !this.config?.entity || this.isUnavailable) return;
    await handleAction(
      { element: this, hass: this.hass, entity: this.config.entity },
      { action: 'toggle' },
    );
  }
}

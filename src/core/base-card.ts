import { LitElement, nothing, type CSSResult, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HassEntity, HomeAssistant } from '../types/hass';
import { handleAction, type ActionConfig } from './action';
import { rgbTriplet, resolveAccent, type Rgb } from './color';
import { ensureFont } from './font';
import { PressController } from './press';
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
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

const UNAVAILABLE = new Set(['unavailable', 'unknown']);

/** Shared behaviour of all GlowCard cards. */
export abstract class GlowCardBase<C extends GlowCardConfig = GlowCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config?: C;

  static styles: CSSResult[] = [glowTokens, glassStyles];

  /** Accent name used when the config has no `color`. */
  protected defaultColor = 'amber';
  protected defaultTapAction: ActionConfig = { action: 'popup' };
  protected defaultHoldAction: ActionConfig = { action: 'more-info' };

  private popup?: GlowPopup;
  protected press = new PressController(
    this,
    () => void this.runAction('tap'),
    () => void this.runAction('hold'),
  );

  setConfig(config: C): void {
    if (!config) throw new Error('Invalid configuration');
    this.validateConfig(config);
    this.config = config;
  }

  /** Throw an Error with a readable message for a bad config. */
  protected validateConfig(config: C): void {
    if (!config.entity) throw new Error('Please define an entity');
  }

  getCardSize(): number {
    return 2;
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
      this.config?.name ?? this.stateObj?.attributes.friendly_name ?? this.config?.entity ?? ''
    );
  }

  /** Accent colour; cards can override, e.g. lights use their current colour. */
  protected get accent(): Rgb {
    return resolveAccent(this.config?.color, this.dark, this.defaultColor);
  }

  /** Popup heading + content; return undefined when the card has no popup. */
  protected renderPopup(): { heading: string; content: TemplateResult } | undefined {
    return undefined;
  }

  /** Extra styles for the popup content. */
  protected popupStyles(): CSSResult[] {
    return [];
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
    this.style.setProperty('--glow-accent', rgbTriplet(this.accent));
    this.syncPopup();
  }

  protected openPopup = (): void => {
    const view = this.renderPopup();
    if (!view) return;
    this.closePopup();
    this.popup = openPopup({ ...view, contentStyles: this.popupStyles() });
    this.popup.addEventListener('closed', () => (this.popup = undefined));
    this.syncPopup();
  };

  protected closePopup(): void {
    this.popup?.close();
    this.popup = undefined;
  }

  private syncPopup(): void {
    if (!this.popup) return;
    const view = this.renderPopup();
    this.popup.dark = this.dark;
    this.popup.font = this.config?.font;
    this.popup.style.setProperty('--glow-accent', rgbTriplet(this.accent));
    this.popup.heading = view?.heading ?? '';
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
    await handleAction(
      { element: this, hass: this.hass, entity: this.config.entity, openPopup: this.openPopup },
      effective,
    );
  }

  /** Toggles the main entity, used by the orb. */
  protected toggle = async (ev?: Event): Promise<void> => {
    ev?.stopPropagation();
    if (!this.hass || !this.config?.entity || this.isUnavailable) return;
    await handleAction(
      { element: this, hass: this.hass, entity: this.config.entity },
      { action: 'toggle' },
    );
  };
}

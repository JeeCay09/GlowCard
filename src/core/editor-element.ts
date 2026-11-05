import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types/hass';
import { defineOnce } from './define';
import {
  cleanConfig,
  fromFormData,
  gestureSchema,
  toFormData,
  type ConfigForm,
  type FormSchema,
  type GestureSpec,
} from './editor';
import { fireEvent } from './fire-event';

interface CardHelpers {
  createCardElement(config: Record<string, unknown>): Promise<HTMLElement>;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/**
 * Makes sure Home Assistant's `ha-form` is loaded. HA loads it lazily with its own card
 * editors, so a built-in card editor (tile) is loaded once if it is not there yet.
 */
export async function ensureHaForm(): Promise<void> {
  if (customElements.get('ha-form')) return;
  try {
    const helpers = await window.loadCardHelpers?.();
    const tile = await helpers?.createCardElement({ type: 'tile', entity: 'sun.sun' });
    const cls = tile?.constructor as { getConfigElement?: () => Promise<unknown> } | undefined;
    await cls?.getConfigElement?.();
  } catch {
    // ha-form may still arrive on its own; the wait below covers that.
  }
  await Promise.race([
    customElements.whenDefined('ha-form'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

/**
 * Visual editor of all GlowCard cards: HA's `ha-form` with the card's form, plus the
 * gesture choices (tap / hold) mapped to `tap_action` / `hold_action`.
 */
export class GlowCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: Record<string, unknown>;

  form!: ConfigForm;
  gestures?: (config: Record<string, unknown>) => GestureSpec | undefined;

  static styles = css`
    :host {
      display: block;
    }
  `;

  /** HA switches to YAML mode when this throws (e.g. named group members). */
  setConfig(config: Record<string, unknown>): void {
    this.form.assertConfig?.(config);
    this.config = config;
  }

  private get spec(): GestureSpec | undefined {
    return this.config ? this.gestures?.(this.config) : undefined;
  }

  render() {
    if (!this.config) return nothing;
    const spec = this.spec;
    const data = spec ? toFormData(this.config, spec) : this.config;
    const schema = spec
      ? gestureSchema(this.form.schema, spec, data, this.hass?.language)
      : this.form.schema;
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${schema}
      .computeLabel=${(s: FormSchema) => this.form.computeLabel(s)}
      .computeHelper=${(s: FormSchema) => this.form.computeHelper(s)}
      @value-changed=${this.changed}
    ></ha-form>`;
  }

  private changed(ev: CustomEvent<{ value: Record<string, unknown> }>): void {
    ev.stopPropagation();
    const spec = this.spec;
    const value = ev.detail.value;
    const config = cleanConfig(spec ? fromFormData(value, spec) : value);
    this.config = config;
    fireEvent(this, 'config-changed', { config });
  }
}

defineOnce('glowcard-editor', GlowCardEditor);

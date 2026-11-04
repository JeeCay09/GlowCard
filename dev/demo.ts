/**
 * Preview helpers for dev/index.html: a fake `hass`, a stand-in for <ha-icon>
 * and a small demo card built on the Glow core. Not part of the release bundle.
 */
import { css, html } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../src/core/base-card';
import { defineOnce } from '../src/core/define';
import { lightColor, type Rgb } from '../src/core/color';
import type { HassEntity, HomeAssistant } from '../src/types/hass';
import '../src/components/orb';
import '../src/components/slider';
import '../src/components/segments';

const ICON_PATHS: Record<string, string> = {
  'mdi:lightbulb':
    'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  'mdi:sprinkler': 'M12 3v6M8 9h8l-1 4H9zM6 21c0-3 3-5 6-5s6 2 6 5',
  'mdi:power-socket-eu':
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM9 11v2M15 11v2',
  'mdi:television': 'M3 5h18v12H3zM8 21h8',
};

/** Stand-in for Home Assistant's <ha-icon>, drawing stroke icons like the mockups. */
class FakeIcon extends HTMLElement {
  set icon(v: string) {
    const d = ICON_PATHS[v] ?? 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';
    this.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg>`;
  }
}
defineOnce('ha-icon', FakeIcon);

const now = new Date().toISOString();
const entity = (
  id: string,
  state: string,
  attributes: HassEntity['attributes'] = {},
): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: now,
  last_updated: now,
});

const states: Record<string, HassEntity> = {
  'light.living': entity('light.living', 'on', {
    friendly_name: 'Deckenlicht Wohnzimmer',
    brightness: 184,
    rgb_color: [255, 200, 114],
  }),
  'switch.sprinkler': entity('switch.sprinkler', 'on', { friendly_name: 'Rasensprenger' }),
  'light.tv_wall': entity('light.tv_wall', 'off', { friendly_name: 'TV Wand' }),
  'switch.office_plug': entity('switch.office_plug', 'off', { friendly_name: 'Home Office' }),
  'switch.terrace': entity('switch.terrace', 'unavailable', { friendly_name: 'Terrasse' }),
};

const listeners = new Set<() => void>();
export function fakeHass(darkMode: boolean): HomeAssistant {
  return {
    states,
    language: 'de',
    themes: { darkMode },
    async callService(domain, service, data) {
      const id = String(data?.entity_id ?? '');
      const e = states[id];
      if (!e) return;
      if (service === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
      if (domain === 'light' && service === 'turn_on' && typeof data?.brightness_pct === 'number') {
        e.state = data.brightness_pct > 0 ? 'on' : 'off';
        e.attributes.brightness = Math.round((data.brightness_pct / 100) * 255);
      }
      states[id] = { ...e, last_changed: new Date().toISOString() };
      listeners.forEach((fn) => fn());
    },
  };
}

class DemoCard extends GlowCardBase<GlowCardConfig> {
  static styles = [
    ...GlowCardBase.styles,
    css`
      :host {
        display: block;
      }
      .glass {
        height: 164px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
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
        flex-shrink: 0;
      }
      glowcard-slider {
        flex-grow: 1;
        margin-bottom: -9px;
      }
      .value.lit {
        color: var(--glow-value-lit, var(--glow-text));
      }
      :host([dark]) .value.lit {
        color: rgb(var(--glow-value-dark));
      }
    `,
  ];

  protected get accent(): Rgb {
    return lightColor(this.stateObj) ?? super.accent;
  }

  private get isLight(): boolean {
    return this.config?.entity?.startsWith('light.') ?? false;
  }

  private get brightness(): number {
    const b = this.stateObj?.attributes.brightness;
    return this.isActive && typeof b === 'number' ? Math.round((b / 255) * 100) : 0;
  }

  private setBrightness = (ev: CustomEvent<{ value: number }>) => {
    void this.hass?.callService('light', 'turn_on', {
      entity_id: this.config?.entity,
      brightness_pct: ev.detail.value,
    });
  };

  private tab = 'brightness';

  protected renderPopup() {
    const sub = this.isUnavailable ? 'Nicht verfügbar' : this.isActive ? 'An' : 'Aus';
    return {
      heading: this.displayName,
      subtitle: sub,
      content: this.isLight
        ? html`<glowcard-slider
              vertical
              .value=${this.brightness}
              caption=${this.isActive ? `${this.brightness}%` : 'Aus'}
              ?dark-text=${this.darkIcon}
              label="Helligkeit"
              @value-changed=${this.setBrightness}
            ></glowcard-slider>
            <glowcard-segments
              .options=${[
                { value: 'brightness', label: 'Helligkeit' },
                { value: 'temp', label: 'Farbtemperatur' },
                { value: 'color', label: 'Farbe' },
              ]}
              .value=${this.tab}
              @value-changed=${(e: CustomEvent<{ value: string }>) => (this.tab = e.detail.value)}
            ></glowcard-segments>`
        : html``,
    };
  }

  protected popupStyles() {
    return [
      css`
        glowcard-slider {
          align-self: center;
        }
      `,
    ];
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    const a = this.accent;
    this.style.setProperty(
      '--glow-value-dark',
      a.map((v) => Math.round(v + (255 - v) * 0.6)).join(','),
    );
  }

  render() {
    if (!this.config) return html``;
    const cls = this.isUnavailable ? 'unavailable' : this.isActive ? 'active' : '';
    const sub = this.isUnavailable ? 'Nicht verfügbar' : this.isActive ? 'An' : 'Aus';
    const orb = html`<glowcard-orb
      .icon=${this.icon}
      ?active=${this.isActive}
      ?dark-icon=${this.darkIcon}
      label=${this.displayName}
      @pointerdown=${(e: Event) => e.stopPropagation()}
      @pointerup=${(e: Event) => e.stopPropagation()}
      @click=${this.toggle}
    ></glowcard-orb>`;
    return html`<div
      class="glass ${cls}"
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
    >
      <div class="top">
        ${orb}
        ${
          this.isLight
            ? html`<span class="value lit">${this.isActive ? `${this.brightness}%` : ''}</span>`
            : html`<span class="word"
                >${this.isUnavailable ? '' : this.isActive ? 'An' : 'Aus'}</span
              >`
        }
      </div>
      <div class="bottom">
        <div class="titles">
          <span class="name">${this.displayName}</span>
          <span class="sub">${sub}</span>
        </div>
        ${
          this.isLight && this.isActive
            ? html`<glowcard-slider
                .value=${this.brightness}
                label="Helligkeit"
                @value-changed=${this.setBrightness}
              ></glowcard-slider>`
            : ''
        }
      </div>
    </div>`;
  }
}
defineOnce('glowcard-dev-demo', DemoCard);

/** Re-renders all demo cards after a fake service call. */
export function mount(root: ParentNode): void {
  const refresh = () =>
    root
      .querySelectorAll<DemoCard & { hass?: HomeAssistant }>('glowcard-dev-demo')
      .forEach((card) => {
        const dark = card.closest('[data-dark]') !== null;
        card.hass = fakeHass(dark);
      });
  listeners.add(refresh);
  refresh();
}

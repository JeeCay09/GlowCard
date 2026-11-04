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

class FakeIcon extends HTMLElement {
  set icon(v: string) {
    const glyphs: Record<string, string> = {
      'mdi:lightbulb': '💡',
      'mdi:power-socket-eu': '🔌',
      'mdi:sprinkler': '💧',
      'mdi:led-strip': '✦',
    };
    this.textContent = glyphs[v] ?? '●';
    this.style.fontSize = '20px';
    this.style.lineHeight = '1';
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
  'light.tv_wall': entity('light.tv_wall', 'on', {
    friendly_name: 'TV-Wand',
    brightness: 158,
    rgb_color: [255, 165, 110],
  }),
  'switch.sprinkler': entity('switch.sprinkler', 'on', { friendly_name: 'Rasensprenger' }),
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
      .glass {
        padding: 16px;
        display: grid;
        gap: 14px;
        cursor: pointer;
        user-select: none;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .name {
        font-weight: 700;
        font-size: 15px;
      }
      .state {
        font-size: 13px;
        color: var(--glow-text-2);
      }
    `,
  ];

  protected get accent(): Rgb {
    return lightColor(this.stateObj) ?? super.accent;
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

  protected renderPopup() {
    const isLight = this.config?.entity?.startsWith('light.');
    return {
      heading: this.displayName,
      content: html`<div class="popup">
        <glowcard-orb
          .icon=${this.config?.icon ?? ''}
          .size=${72}
          ?active=${this.isActive}
          @click=${this.toggle}
        ></glowcard-orb>
        ${
          isLight
            ? html`<glowcard-slider
                .value=${this.brightness}
                caption="${this.brightness} %"
                label="Helligkeit"
                @value-changed=${this.setBrightness}
              ></glowcard-slider>`
            : html`<p>${this.isActive ? 'An' : 'Aus'}</p>`
        }
      </div>`,
    };
  }

  protected popupStyles() {
    return [
      css`
        .popup {
          display: grid;
          justify-items: center;
          gap: 20px;
        }
        glowcard-slider {
          width: 100%;
        }
      `,
    ];
  }

  render() {
    if (!this.config) return html``;
    const cls = this.isUnavailable ? 'unavailable' : this.isActive ? 'active' : '';
    return html`<div
      class="glass ${cls}"
      @pointerdown=${this.press.down}
      @pointerup=${this.press.up}
      @pointermove=${this.press.move}
      @pointercancel=${this.press.cancel}
    >
      <div class="row">
        <glowcard-orb
          .icon=${this.config.icon ?? ''}
          ?active=${this.isActive}
          label=${this.displayName}
          @pointerdown=${(e: Event) => e.stopPropagation()}
          @click=${this.toggle}
        ></glowcard-orb>
        <div>
          <div class="name">${this.displayName}</div>
          <div class="state">
            ${this.isUnavailable ? 'Nicht verfügbar' : this.isActive ? 'An' : 'Aus'}
          </div>
        </div>
      </div>
      ${
        this.config.entity?.startsWith('light.')
          ? html`<glowcard-slider
              .value=${this.brightness}
              caption="${this.brightness} %"
              label="Helligkeit"
              @pointerdown=${(e: Event) => e.stopPropagation()}
              @value-changed=${this.setBrightness}
            ></glowcard-slider>`
          : ''
      }
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

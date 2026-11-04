/**
 * Preview helpers for dev/index.html: a fake `hass`, a stand-in for <ha-icon>
 * and a small demo card built on the Glow core. Not part of the release bundle.
 */
import { css, html } from 'lit';
import { GlowCardBase, type GlowCardConfig } from '../src/core/base-card';
import { defineOnce } from '../src/core/define';
import { hexToRgb, hsToRgb, kelvinToRgb, lightColor, type Rgb } from '../src/core/color';
import { LIGHT_SWATCHES, type Swatch } from '../src/components/swatches';
import type { HassEntity, HomeAssistant } from '../src/types/hass';
import '../src/components/orb';
import '../src/components/slider';
import '../src/components/segments';

const ICON_PATHS: Record<string, string> = {
  'mdi:lightbulb': 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  'mdi:sprinkler': 'M12 3.5c3 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.5 6-10.5z',
  'mdi:power-socket-eu':
    'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9.3 12h.01M14.7 12h.01M12 4.5v1.5M12 18v1.5',
  'mdi:television':
    'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9 21h6M12 17v4',
  'mdi:flag-checkered': 'M5 21V4h11l-2 4 2 4H5',
  'mdi:moon-waning-crescent': 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  'mdi:smoke-detector': 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  'mdi:dishwasher':
    'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4 8h16M8 5.5h1',
  'mdi:flash': 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  'mdi:power-socket-de':
    'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9.3 12h.01M14.7 12h.01M12 4.5v1.5M12 18v1.5',
  'mdi:power-plug-off-outline': 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M5 19L19 5',
};

/** Stand-in for Home Assistant's <ha-icon>, drawing stroke icons like the mockups. */
class FakeIcon extends HTMLElement {
  set icon(v: string) {
    const d = ICON_PATHS[v] ?? 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';
    this.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg>`;
  }
}
defineOnce('ha-icon', FakeIcon);

const HOUR = 3_600_000;
const nowMs = Date.now();
const ago = (h: number) => new Date(nowMs - h * HOUR).toISOString();
const entity = (
  id: string,
  state: string,
  attributes: HassEntity['attributes'] = {},
  changedHoursAgo = 2,
): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: ago(changedHoursAgo),
  last_updated: ago(changedHoursAgo),
});

const states: Record<string, HassEntity> = {
  'light.living': entity('light.living', 'on', {
    friendly_name: 'Deckenlicht Wohnzimmer',
    brightness: 184,
    rgb_color: [255, 200, 114],
    color_mode: 'hs',
    supported_color_modes: ['color_temp', 'hs'],
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
  }),
  'light.kitchen': entity('light.kitchen', 'on', {
    friendly_name: 'Küche Arbeitsfläche',
    brightness: 120,
    color_mode: 'color_temp',
    color_temp_kelvin: 4000,
    rgb_color: [255, 206, 166],
    supported_color_modes: ['color_temp'],
    min_color_temp_kelvin: 2700,
    max_color_temp_kelvin: 6500,
  }),
  'light.hall': entity('light.hall', 'on', {
    friendly_name: 'Flur',
    brightness: 255,
    color_mode: 'hs',
    hs_color: [262, 63],
    rgb_color: [139, 92, 246],
    supported_color_modes: ['hs'],
  }),
  'switch.sprinkler': entity('switch.sprinkler', 'off', { friendly_name: 'Rasensprenger' }, 63),
  'input_boolean.f1_live': entity('input_boolean.f1_live', 'on', { friendly_name: 'F1 Live' }, 133),
  'switch.night_light': entity(
    'switch.night_light',
    'off',
    { friendly_name: 'TV Schrank Nachtlicht' },
    49,
  ),
  'switch.dnd': entity('switch.dnd', 'on', { friendly_name: 'Minerva Bitte nicht stören' }, 63),
  'input_boolean.tv_warm': entity(
    'input_boolean.tv_warm',
    'on',
    { friendly_name: 'TV Wand Warmweiß' },
    45,
  ),
  'switch.carpet_boost': entity(
    'switch.carpet_boost',
    'on',
    { friendly_name: 'Vesta Teppich-Boost' },
    20,
  ),
  'switch.dishwasher': entity('switch.dishwasher', 'off', { friendly_name: 'Geschirrspüler' }, 5),
  'light.tv_wall': entity('light.tv_wall', 'off', {
    friendly_name: 'TV Wand',
    supported_color_modes: ['brightness'],
  }),
  'switch.office_plug': entity('switch.office_plug', 'off', { friendly_name: 'Home Office' }),
  'switch.terrace': entity('switch.terrace', 'unavailable', { friendly_name: 'Terrasse' }),
};
// Smart plugs (GlowPlugs board)
Object.assign(states, {
  'switch.home_office': entity('switch.home_office', 'on', { friendly_name: 'Home Office' }, 3),
  'sensor.home_office_power': entity(
    'sensor.home_office_power',
    '186',
    { device_class: 'power', unit_of_measurement: 'W' },
    0.01,
  ),
  'sensor.home_office_energy': entity(
    'sensor.home_office_energy',
    '11.76',
    { device_class: 'energy', unit_of_measurement: 'kWh' },
    0.1,
  ),
  'number.home_office_countdown': entity('number.home_office_countdown', '0', {
    unit_of_measurement: 's',
    min: 0,
    max: 43200,
  }),
  'switch.home_office_child_lock': entity('switch.home_office_child_lock', 'off'),
  'select.home_office_power_outage_memory': entity(
    'select.home_office_power_outage_memory',
    'restore',
    { options: ['on', 'off', 'restore'] },
  ),
  'select.home_office_indicator_mode': entity('select.home_office_indicator_mode', 'off', {
    options: ['off', 'off/on', 'on/off', 'on'],
  }),
  'switch.dryer': entity('switch.dryer', 'on', { friendly_name: 'Wäschetrockner' }),
  'sensor.dryer_power': entity('sensor.dryer_power', '0', {
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  'switch.bedroom_plug': entity('switch.bedroom_plug', 'on', { friendly_name: 'Schlafzimmer' }),
  'sensor.bedroom_plug_power': entity('sensor.bedroom_plug_power', '0', {
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  'switch.fairy_lights': entity('switch.fairy_lights', 'unavailable', {
    friendly_name: 'Lichterkette',
  }),
});
const OFFICE_SERIES = [
  4, 4, 70, 126, 144, 152, 135, 134, 115, 117, 111, 108, 119, 126, 123, 140, 130, 157, 145, 149,
  156, 159, 168, 186,
];

const leds = ['Esszimmer', 'Flur oben', 'Dachboden', 'Kinderzimmer', 'Büro', 'Schlafzimmer'];
leds.forEach((room, i) => {
  const id = `switch.led_${i}`;
  states[id] = entity(id, 'on', { friendly_name: `Rauchmelder ${room}` });
});

const areas = {
  living: { area_id: 'living', name: 'Wohnzimmer' },
  hall: { area_id: 'hall', name: 'Flur' },
  utility: { area_id: 'utility', name: 'Hauswirtschaftsraum' },
  kitchen: { area_id: 'kitchen', name: 'Küche' },
  terrace: { area_id: 'terrace', name: 'Terrasse' },
};
const entities: HomeAssistant['entities'] = {
  'input_boolean.tv_warm': { entity_id: 'input_boolean.tv_warm', area_id: 'living' },
  'light.living': { entity_id: 'light.living', area_id: 'living' },
  'light.kitchen': { entity_id: 'light.kitchen', area_id: 'kitchen' },
  'switch.carpet_boost': { entity_id: 'switch.carpet_boost', area_id: 'utility' },
  'switch.dishwasher': { entity_id: 'switch.dishwasher', area_id: 'kitchen' },
  'switch.fairy_lights': { entity_id: 'switch.fairy_lights', area_id: 'terrace' },
};

/** Recorder-like history: TV Wand pattern from the mockup, simple patterns for the rest. */
function fakeHistory(id: string, start: number) {
  if (id === 'sensor.home_office_power') {
    const step = (nowMs - start) / OFFICE_SERIES.length;
    return OFFICE_SERIES.map((v, i) => ({ s: String(v), lu: (start + i * step) / 1000 }));
  }
  if (id.endsWith('_power')) return [{ s: '0', lu: start / 1000 }];
  if (id === 'sensor.home_office_energy') {
    const today = new Date(nowMs);
    today.setHours(0, 0, 0, 0);
    return [
      { s: '10.00', lu: start / 1000 },
      { s: '11.52', lu: today.getTime() / 1000 },
      { s: '11.76', lu: (nowMs - HOUR) / 1000 },
    ];
  }
  const day0 = new Date(nowMs);
  day0.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, h: number) => day0.getTime() - dayOffset * 24 * HOUR + h * HOUR;
  const tv: [number, number, number][] = [
    [6, 21.92, 23.54],
    [5, 8.03, 8.04],
    [5, 12.52, 48],
    [2, 14.21, 24 * 3],
  ];
  const pattern =
    id === 'input_boolean.tv_warm'
      ? tv
      : [[3, 18, 22] as [number, number, number], [1, 7, 9] as [number, number, number]];
  const points: { s: string; lu: number }[] = [{ s: 'off', lu: start / 1000 }];
  for (const [d, a, b] of pattern) {
    points.push({ s: 'on', lu: at(d, a) / 1000 });
    if (at(d, b) < nowMs) points.push({ s: 'off', lu: at(d, b) / 1000 });
  }
  return points;
}

const listeners = new Set<() => void>();
export function fakeHass(darkMode: boolean): HomeAssistant {
  return {
    states: { ...states },
    entities,
    areas,
    devices: {},
    language: 'de',
    themes: { darkMode },
    async callWS<T>(msg: Record<string, unknown>): Promise<T> {
      const ids = (msg.entity_ids as string[]) ?? [];
      const start = new Date(String(msg.start_time)).getTime();
      return Object.fromEntries(ids.map((id) => [id, fakeHistory(id, start)])) as T;
    },
    async callService(domain, service, data) {
      const ids = ([] as string[]).concat((data?.entity_id as string | string[]) ?? []);
      for (const id of ids) {
        const e = states[id];
        if (!e) continue;
        if (service === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
        if (service === 'set_value') e.state = String(data?.value);
        if (service === 'turn_on') e.state = 'on';
        if (service === 'turn_off') e.state = 'off';
        if (domain === 'light' && service === 'turn_on' && Array.isArray(data?.rgb_color)) {
          e.attributes.rgb_color = data.rgb_color as [number, number, number];
          e.attributes.color_mode = 'rgb';
        }
        if (domain === 'light' && typeof data?.color_temp_kelvin === 'number') {
          e.attributes.color_temp_kelvin = data.color_temp_kelvin;
          e.attributes.color_mode = 'color_temp';
          e.attributes.rgb_color = kelvinToRgb(data.color_temp_kelvin).map(Math.round) as Rgb;
        }
        if (domain === 'light' && Array.isArray(data?.hs_color)) {
          const [h, sat] = data.hs_color as [number, number];
          e.attributes.hs_color = [h, sat];
          e.attributes.color_mode = 'hs';
          e.attributes.rgb_color = hsToRgb(h, sat).map(Math.round) as Rgb;
        }
        if (
          domain === 'light' &&
          service === 'turn_on' &&
          typeof data?.brightness_pct === 'number'
        ) {
          e.state = data.brightness_pct > 0 ? 'on' : 'off';
          e.attributes.brightness = Math.round((data.brightness_pct / 100) * 255);
        }
        const t = new Date().toISOString();
        states[id] = { ...e, last_changed: t, last_updated: t };
      }
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

  private get swatchName(): string {
    const rgb = this.stateObj?.attributes.rgb_color;
    if (!rgb) return '';
    return LIGHT_SWATCHES.find((s) => hexToRgb(s.color)?.join() === rgb.join())?.name ?? '';
  }

  private setSwatch = (ev: CustomEvent<{ value: Swatch }>) => {
    void this.hass?.callService('light', 'turn_on', {
      entity_id: this.config?.entity,
      rgb_color: hexToRgb(ev.detail.value.color),
    });
  };

  protected renderPopup() {
    const state = this.isUnavailable ? 'Nicht verfügbar' : this.isActive ? 'An' : 'Aus';
    const sub = this.isActive && this.swatchName ? `${state} · ${this.swatchName}` : state;
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
            ></glowcard-segments>
            <glowcard-swatches
              .selected=${this.swatchName}
              @value-changed=${this.setSwatch}
            ></glowcard-swatches>`
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
    root.querySelectorAll<HTMLElement & { hass?: HomeAssistant }>('[data-card]').forEach((card) => {
      const dark = card.closest('[data-dark]') !== null;
      card.hass = fakeHass(dark);
    });
  listeners.add(refresh);
  refresh();
}

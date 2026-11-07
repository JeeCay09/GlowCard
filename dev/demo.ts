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
  'mdi:sofa-outline':
    'M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM5 17v2M19 17v2',
  'mdi:flower-outline':
    'M12 21v-8M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 13c0-3.2-2.4-5.5-6-5.5 0 3.2 2.4 5.5 6 5.5zM8 21h8',
  'mdi:thermometer': 'M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z',
  'mdi:water-percent': 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  'mdi:battery-alert-variant-outline':
    'M5 8h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM21 11v2M7 11v2',
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
  'mdi:lightning-bolt': 'M13 2L4 14h7l-1 8 9-12h-7z',
  'mdi:power-socket-de':
    'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9.3 12h.01M14.7 12h.01M12 4.5v1.5M12 18v1.5',
  'mdi:power-plug-off-outline': 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M5 19L19 5',
  // GlowChips board
  'mdi:weather-cloudy': 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z',
  'mdi:white-balance-sunny':
    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  'mdi:shield-check': 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
  'mdi:shield-alert': 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM12 8v4M12 15v.5',
  'mdi:alert': 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  'mdi:battery':
    'M5 8h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM21 11v2M7 11v2M10 11v2',
  'mdi:power-plug': 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9.5 10.5v3M14.5 10.5v3',
  'mdi:home': 'M4 11l8-6 8 6v9H4zM10 20v-5h4v5',
  'mdi:transmission-tower': 'M12 3l-5 18M12 3l5 18M8.5 9h7M7 14h10',
  'mdi:window-closed-variant': 'M6 3h12v18H6zM12 3v18M6 12h12',
  'mdi:smoke-detector-variant':
    'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  'mdi:bell': 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0',
};

/** Stand-in for Home Assistant's <ha-icon>, drawing stroke icons like the mockups. */
class FakeIcon extends HTMLElement {
  set icon(v: string) {
    const d = ICON_PATHS[v] ?? 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';
    this.innerHTML = `<svg style="width:var(--mdc-icon-size,22px);height:var(--mdc-icon-size,22px)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg>`;
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
  'light.led_strip': entity('light.led_strip', 'on', {
    friendly_name: 'LED Leiste',
    color_mode: 'onoff',
    supported_color_modes: ['onoff'],
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

/** Fixed clock time today (dayOffset 1 = yesterday), as ISO string. */
const at = (dayOffset: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(nowMs);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const fixed = (e: HassEntity, iso: string): HassEntity => ({
  ...e,
  last_changed: iso,
  last_updated: iso,
});
// Header, status bar and chips (GlowChips board, Gilbert's real entities)
Object.assign(states, {
  'weather.wetter_home': entity('weather.wetter_home', 'cloudy', {
    friendly_name: 'Wetter',
    temperature: 7.8,
    humidity: 81,
  }),
  'person.gilbert': entity('person.gilbert', 'home', { friendly_name: 'Gilbert' }),
  'person.sam': entity('person.sam', 'home', { friendly_name: 'Sam' }),
  'sensor.sigen_plant_pv_power': entity('sensor.sigen_plant_pv_power', '2.35', {
    device_class: 'power',
    unit_of_measurement: 'kW',
  }),
  'sensor.sigen_battery_soc': entity('sensor.sigen_battery_soc', '60', {
    device_class: 'battery',
    unit_of_measurement: '%',
  }),
  'sensor.sigen_battery_power': entity('sensor.sigen_battery_power', '2050', {
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  'sensor.sigen_grid_power': entity('sensor.sigen_grid_power', '0', {
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  'sensor.sigen_home_power': entity('sensor.sigen_home_power', '320', {
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  'binary_sensor.fenster_bad': fixed(
    entity('binary_sensor.fenster_bad', 'off', { device_class: 'window' }),
    at(0, '06:31'),
  ),
  'binary_sensor.rauchmelder_alle': entity('binary_sensor.rauchmelder_alle', 'off', {
    device_class: 'smoke',
    friendly_name: 'Rauchmelder alle',
    entity_id: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `binary_sensor.rauchmelder_${x}`),
  }),
  'binary_sensor.basisstation_alarm': fixed(
    entity('binary_sensor.basisstation_alarm', 'off', { icon: 'mdi:bell' }),
    at(1, '13:48'),
  ),
  'binary_sensor.vesta_problem': fixed(
    entity('binary_sensor.vesta_problem', 'on', {
      device_class: 'problem',
      friendly_name: 'Vesta Problem',
    }),
    at(0, '08:31'),
  ),
  'sensor.vesta_error': entity('sensor.vesta_error', 'water_tank_dry', {
    friendly_name: 'Vesta Fehler',
  }),
  'vacuum.vesta': fixed(
    entity('vacuum.vesta', 'paused', { friendly_name: 'Vesta' }),
    at(0, '08:31'),
  ),
});
['1', '2', '3'].forEach((n, i) => {
  const id = `light.tv_wand_streifen_${n}`;
  states[id] = fixed(
    entity(id, 'on', {
      friendly_name: `TV Wand Streifen ${n}`,
      brightness: 255,
      rgb_color: [255, 165, 110],
      color_mode: 'hs',
      supported_color_modes: ['hs'],
    }),
    at(1, i === 0 ? '17:02' : '16:52'),
  );
});

// Heading (GlowHeading board, Gilbert's real entities)
Object.assign(states, {
  'sensor.temperatursensor_wohnzimmer_temperature': entity(
    'sensor.temperatursensor_wohnzimmer_temperature',
    '21.5',
    { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Temperatur' },
  ),
  'sensor.temperatursensor_wohnzimmer_humidity': entity(
    'sensor.temperatursensor_wohnzimmer_humidity',
    '60',
    { device_class: 'humidity', unit_of_measurement: '%', friendly_name: 'Luftfeuchtigkeit' },
  ),
  'sensor.temperatursensor_wohnzimmer_battery': entity(
    'sensor.temperatursensor_wohnzimmer_battery',
    '0',
    { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Batterie' },
  ),
  'sensor.bodenfeuchte_vorbeet_temperature': entity(
    'sensor.bodenfeuchte_vorbeet_temperature',
    '14.03',
    { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Boden Vorbeet' },
  ),
  'sensor.temperatursensor_bad_temperature': entity(
    'sensor.temperatursensor_bad_temperature',
    '23.9',
    { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Bad' },
  ),
  'light.tv_wand': entity('light.tv_wand', 'on', {
    friendly_name: 'TV Wand',
    rgb_color: [255, 165, 110],
    entity_id: [1, 2, 3].map((n) => `light.tv_wand_streifen_${n}`),
  }),
});

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
  'light.led_strip': { entity_id: 'light.led_strip', area_id: 'kitchen' },
  'switch.carpet_boost': { entity_id: 'switch.carpet_boost', area_id: 'utility' },
  'switch.dishwasher': { entity_id: 'switch.dishwasher', area_id: 'kitchen' },
  'switch.fairy_lights': { entity_id: 'switch.fairy_lights', area_id: 'terrace' },
  'light.tv_wand_streifen_1': { entity_id: 'light.tv_wand_streifen_1', area_id: 'living' },
  'light.tv_wand_streifen_2': { entity_id: 'light.tv_wand_streifen_2', area_id: 'living' },
  'light.tv_wand_streifen_3': { entity_id: 'light.tv_wand_streifen_3', area_id: 'living' },
  'binary_sensor.vesta_problem': { entity_id: 'binary_sensor.vesta_problem', device_id: 'vesta' },
  'sensor.vesta_error': { entity_id: 'sensor.vesta_error', device_id: 'vesta' },
  'vacuum.vesta': { entity_id: 'vacuum.vesta', device_id: 'vesta' },
};

// Energy card "Haus" (GlowEnergyHaus board): Jetzt / Abend / Nacht scenarios
const ENERGY_SCENES: Record<
  string,
  [pv: number, bat: number, soc: number, grid: number, load: number]
> = {
  day: [4.86, 4.2, 38.7, -0.23, 0.42],
  eve: [0.3, -0.9, 72, 0, 1.2],
  night: [0, 0, 10, 0.55, 0.55],
};
for (const [k, [pv, bat, soc, grid, load]] of Object.entries(ENERGY_SCENES)) {
  const kwE = (n: string, v: number) =>
    entity(`sensor.energy_${k}_${n}`, String(v), {
      device_class: 'power',
      unit_of_measurement: 'kW',
    });
  Object.assign(states, {
    [`sensor.energy_${k}_pv`]: kwE('pv', pv),
    [`sensor.energy_${k}_battery`]: kwE('battery', bat),
    [`sensor.energy_${k}_grid`]: kwE('grid', grid),
    [`sensor.energy_${k}_load`]: kwE('load', load),
    [`sensor.energy_${k}_soc`]: entity(`sensor.energy_${k}_soc`, String(soc), {
      device_class: 'battery',
      unit_of_measurement: '%',
    }),
  });
}
for (const [n, v] of Object.entries({
  pv: 4.9,
  consumed: 3.99,
  grid_import: 2.26,
  grid_export: 0.16,
  battery_charge: 3.51,
  battery_discharge: 0.5,
})) {
  states[`sensor.energy_daily_${n}`] = entity(`sensor.energy_daily_${n}`, String(v), {
    device_class: 'energy',
    unit_of_measurement: 'kWh',
  });
}

/** Today's curves for the energy popup chart (board shape: sunrise ~7:30, now ~9:40). */
function energyHistory(id: string, start: number) {
  const day0 = new Date(nowMs);
  day0.setHours(0, 0, 0, 0);
  const d0 = day0.getTime();
  const pts: { s: string; lu: number }[] = [];
  const push = (t: number, v: number) => t <= nowMs && pts.push({ s: v.toFixed(3), lu: t / 1000 });
  if (id === 'sensor.energy_daily_pv') {
    push(start, 1.2);
    push(d0 - 3 * HOUR, 8.33);
    push(d0 + 60_000, 0);
    push(nowMs - HOUR, 3.2);
    return pts;
  }
  const hNow = (nowMs - d0) / HOUR;
  for (let t = 0; t <= hNow; t += 0.25) {
    const ts = d0 + t * HOUR;
    let v = 0;
    if (id.endsWith('_pv'))
      v = t < 7.5 ? 0 : 4.86 * Math.pow(Math.min(1, (t - 7.5) / Math.max(0.5, hNow - 7.5)), 2.2);
    else if (id.endsWith('_load'))
      v = 0.35 + (t > 6 && t < 9 ? 0.25 : 0) + 0.05 * Math.sin(t * 2.3);
    push(ts, v);
  }
  if (id.endsWith('_soc')) {
    // dips until sunrise, then charges up to the current 38,7 %… board: 49 % at 0 h → 39 % now
    pts.length = 0;
    for (let t = 0; t <= hNow; t += 0.25) {
      const v =
        t < 7.5
          ? 49 - (t / 7.5) * 10
          : 39 + Math.sin(((t - 7.5) / Math.max(0.5, hNow - 7.5)) * Math.PI) * 4 - 0.3;
      push(d0 + t * HOUR, v);
    }
  }
  return pts;
}

const STATE_TEXT: Record<string, string> = {
  cloudy: 'Bewölkt',
  water_tank_dry: 'Wassertank leer',
  paused: 'Pausiert',
  home: 'Zu Hause',
};

/** Recorder-like history: TV Wand pattern from the mockup, simple patterns for the rest. */
function fakeHistory(id: string, start: number) {
  if (id.startsWith('sensor.energy_')) return energyHistory(id, start);
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
    devices: { vesta: { id: 'vesta', name: 'Vesta' } },
    language: 'de',
    user: { name: 'Gilbert' },
    formatEntityState: (e: HassEntity) => STATE_TEXT[e.state] ?? e.state,
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

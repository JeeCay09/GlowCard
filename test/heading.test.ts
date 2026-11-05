import { describe, expect, it } from 'vitest';
import {
  badgeSegment,
  badgeView,
  compactValue,
  glowActive,
  glowColor,
  parseColor,
} from '../src/cards/heading/heading-logic';
import type { HassEntity, HomeAssistant } from '../src/types/hass';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '2026-11-05T08:00:00',
  last_updated: '2026-11-05T08:00:00',
});

const hass = (states: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    entities: {},
    devices: {},
    areas: {},
    language: 'de',
    callService: async () => undefined,
  }) as HomeAssistant;

const temp = e('sensor.wz_temperature', '21.5', {
  device_class: 'temperature',
  unit_of_measurement: '°C',
});
const hum = e('sensor.wz_humidity', '60', { device_class: 'humidity', unit_of_measurement: '%' });
const batt = e('sensor.wz_battery', '0', { device_class: 'battery', unit_of_measurement: '%' });
const light = e('light.tv', 'on', { rgb_color: [255, 165, 110] });

describe('heading badges', () => {
  it('accepts plain entity ids and segment configs', () => {
    expect(badgeSegment('sensor.a')).toEqual({ type: 'entity', entity: 'sensor.a' });
    expect(badgeSegment({ type: 'lights', entities: ['light.a'] }).type).toBe('lights');
    expect(badgeSegment({ entity: 'sensor.a', name: 'A' })).toEqual({
      type: 'entity',
      entity: 'sensor.a',
      name: 'A',
    });
  });

  it('shows short values like the mockup', () => {
    const h = hass([temp, hum]);
    expect(compactValue(h, temp)).toBe('21,5°');
    expect(compactValue(h, hum)).toBe('60 %');
  });

  it('turns a low battery into a pulsing red warning', () => {
    const v = badgeView(hass([batt]), badgeSegment('sensor.wz_battery'), true);
    expect(v.tone).toBe('warning');
    expect(v.pulse).toBe(true);
    expect(v.value).toBe('Batterie 0 %');
  });

  it('keeps a full battery neutral', () => {
    const full = e('sensor.wz_battery', '80', { device_class: 'battery' });
    const v = badgeView(hass([full]), badgeSegment('sensor.wz_battery'), true);
    expect(v.tone).toBe('neutral');
    expect(v.value).toBe('80 %');
  });

  it('lights a badge in the light’s colour', () => {
    const v = badgeView(hass([light]), badgeSegment('light.tv'), true);
    expect(v.tone).toBe('active');
    expect(v.rgb).toEqual([255, 165, 110]);
  });

  it('marks missing entities as unavailable', () => {
    const v = badgeView(hass([]), badgeSegment('sensor.gone'), false);
    expect(v.tone).toBe('unavailable');
  });
});

describe('heading glow', () => {
  it('glows only while the chosen entity is on', () => {
    expect(glowActive(undefined)).toBe(false);
    expect(glowActive(light)).toBe(true);
    expect(glowActive(e('light.x', 'off'))).toBe(false);
    expect(glowActive(e('light.x', 'unavailable'))).toBe(false);
  });

  it('uses the chosen colour first, then the light colour, then warm', () => {
    expect(glowColor(light, [10, 20, 30], true)).toEqual([10, 20, 30]);
    expect(glowColor(light, '#00ff00', true)).toEqual([0, 255, 0]);
    expect(glowColor(light, undefined, true)).toEqual([255, 165, 110]);
    expect(glowColor(e('switch.x', 'on'), undefined, true)).toEqual([255, 165, 110]);
    expect(glowColor(e('switch.x', 'on'), undefined, false)).toEqual([249, 140, 80]);
  });

  it('parses accent names, hex and rgb lists', () => {
    expect(parseColor('green', true)).toEqual([16, 185, 129]);
    expect(parseColor('nonsense', true)).toBeNull();
    expect(parseColor([1, 2], true)).toBeNull();
  });
});

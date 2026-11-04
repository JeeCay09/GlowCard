import { describe, expect, it } from 'vitest';
import {
  chartPaths,
  countdownSeconds,
  findPlugParts,
  formatWatts,
  niceMax,
  selectedTimer,
  toKwh,
  watts,
} from '../src/cards/plug/plug-logic';
import type { HassEntity, HomeAssistant } from '../src/types/hass';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '',
  last_updated: '',
});

const hass = (states: HassEntity[], entities: HomeAssistant['entities'] = {}): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    entities,
    language: 'de',
    callService: async () => undefined,
  }) as HomeAssistant;

describe('plug parts', () => {
  it('finds sensors, countdown, child lock and selects on the same device', () => {
    const h = hass(
      [
        e('switch.plug', 'on'),
        e('sensor.x_leistung', '12', { device_class: 'power', unit_of_measurement: 'W' }),
        e('sensor.x_energie', '3.1', { device_class: 'energy', unit_of_measurement: 'kWh' }),
        e('number.x_countdown', '0'),
        e('switch.x_child_lock', 'off'),
        e('select.x_power_outage_memory', 'restore'),
        e('select.x_indicator_mode', 'off'),
        e('sensor.other_power', '5', { device_class: 'power' }),
      ],
      {
        'switch.plug': { entity_id: 'switch.plug', device_id: 'd1' },
        'sensor.x_leistung': { entity_id: 'sensor.x_leistung', device_id: 'd1' },
        'sensor.x_energie': { entity_id: 'sensor.x_energie', device_id: 'd1' },
        'number.x_countdown': { entity_id: 'number.x_countdown', device_id: 'd1' },
        'switch.x_child_lock': { entity_id: 'switch.x_child_lock', device_id: 'd1' },
        'select.x_power_outage_memory': {
          entity_id: 'select.x_power_outage_memory',
          device_id: 'd1',
        },
        'select.x_indicator_mode': { entity_id: 'select.x_indicator_mode', device_id: 'd1' },
        'sensor.other_power': { entity_id: 'sensor.other_power', device_id: 'd2' },
      },
    );
    expect(findPlugParts(h, 'switch.plug')).toEqual({
      power: 'sensor.x_leistung',
      energy: 'sensor.x_energie',
      countdown: 'number.x_countdown',
      child_lock: 'switch.x_child_lock',
      power_on: 'select.x_power_outage_memory',
      indicator: 'select.x_indicator_mode',
    });
  });

  it('falls back to the object id prefix and leaves missing parts out', () => {
    const h = hass([
      e('switch.office', 'on'),
      e('sensor.office_power', '186', { unit_of_measurement: 'W' }),
      e('sensor.office_2_power', '1', { unit_of_measurement: 'W' }),
    ]);
    const parts = findPlugParts(h, 'switch.office');
    expect(parts.power).toBe('sensor.office_power');
    expect(parts.energy).toBeUndefined();
    expect(parts.countdown).toBeUndefined();
  });
});

describe('plug values', () => {
  it('reads watts and kWh in any unit', () => {
    expect(watts(e('sensor.p', '0.2', { unit_of_measurement: 'kW' }))).toBe(200);
    expect(watts(e('sensor.p', 'unavailable'))).toBeUndefined();
    expect(toKwh(1500, e('sensor.e', '1', { unit_of_measurement: 'Wh' }))).toBe(1.5);
  });

  it('formats watts like the mockup', () => {
    expect(formatWatts('de', 186)).toBe('186 W');
    expect(formatWatts('de', 0)).toBe('0 W');
    expect(formatWatts('de', 4.5)).toBe('4,5 W');
    expect(formatWatts('de', 1234)).toBe('1,2 kW');
  });

  it('picks a round chart ceiling', () => {
    expect(niceMax(186)).toBe(200);
    expect(niceMax(0)).toBe(10);
    expect(niceMax(480)).toBe(500);
  });

  it('draws the curve like the mockup chart', () => {
    const { line, area, lastY } = chartPaths([0, 200], 340, 100, 200);
    expect(line).toBe('M0,96 L340,8');
    expect(area).toBe('M0,96 L340,8 L340,100 L0,100 Z');
    expect(lastY).toBe(8);
  });

  it('maps a running countdown to the timer option', () => {
    expect(selectedTimer(0)).toBe(0);
    expect(selectedTimer(1500)).toBe(1800);
    expect(selectedTimer(3601)).toBe(7200);
    expect(selectedTimer(99999)).toBe(7200);
    expect(countdownSeconds(e('number.c', '25', { unit_of_measurement: 'min' }))).toBe(1500);
  });
});

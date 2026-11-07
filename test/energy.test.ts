import { describe, expect, it } from 'vitest';
import {
  baseLoad,
  currency,
  dashboardTariff,
  energyKwh,
  flows,
  kw,
  priceSource,
  priceValue,
  quantile,
  readDevices,
  readNow,
  ringAngle,
  usualByHour,
  verdict,
  type HourStat,
} from '../src/cards/energy/energy-logic';
import { configForm } from '../src/core/editor';
import type { HassEntity, HomeAssistant } from '../src/types/hass';
import '../src/glowcard';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '2026-11-07T14:20:00',
  last_updated: '2026-11-07T14:20:00',
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

const W = { unit_of_measurement: 'W' };
const KW = { unit_of_measurement: 'kW' };

describe('energy: what the house draws now', () => {
  it('reads the house consumption in W', () => {
    const h = hass([e('sensor.home', '0.62', KW)]);
    expect(readNow(h, { home: 'sensor.home' }).home).toBeCloseTo(620);
  });

  it('derives the house from grid, solar and battery without a house sensor', () => {
    const h = hass([
      e('sensor.grid', '-300', W),
      e('sensor.pv', '2500', W),
      e('sensor.bat', '1200', W),
    ]);
    const n = readNow(h, { grid: 'sensor.grid', solar: 'sensor.pv', battery_power: 'sensor.bat' });
    expect(n.home).toBe(1000);
  });

  it('works with only a grid sensor (no PV)', () => {
    const h = hass([e('sensor.grid', '450', W)]);
    const n = readNow(h, { grid: 'sensor.grid' });
    expect(n.home).toBe(450);
    const f = flows(n);
    expect(f.main).toBe('grid');
    expect(f.toHome).toEqual({ solar: 0, bat: 0, grid: 450 });
  });

  it('splits sources: solar first, then battery, then grid; surplus to battery then grid', () => {
    const day = flows({ home: 800, solar: 3000, battery: 1500, soc: 50, grid: -700 });
    expect(day.toHome.solar).toBe(800);
    expect(day.toBattery).toBe(1500);
    expect(day.toGrid).toBe(700);
    expect(day.main).toBe('solar');
    const night = flows({ home: 600, solar: 0, battery: -600, soc: 40, grid: 0 });
    expect(night.toHome.bat).toBe(600);
    expect(night.main).toBe('bat');
  });
});

describe('energy: devices', () => {
  it('sorts devices by power and adds the unmeasured rest', () => {
    const h = hass([
      e('sensor.tv', '80', W),
      e('sensor.hp', '400', { ...W, friendly_name: 'Wärmepumpe' }),
    ]);
    const list = readDevices(h, ['sensor.tv', { entity: 'sensor.hp' }], 600, 'Nicht erfasst');
    expect(list.map((d) => d.name)).toEqual(['Wärmepumpe', 'sensor.tv', 'Nicht erfasst']);
    expect(list.map((d) => d.slot)).toEqual([2, 1, 0]);
    expect(list[2].watts).toBe(120);
  });

  it('shows no list without devices and keeps at most five', () => {
    const h = hass([]);
    expect(readDevices(h, undefined, 500, 'x')).toEqual([]);
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `sensor.${x}`);
    expect(readDevices(h, many, null, 'x')).toHaveLength(5);
  });
});

describe('energy: usual range and base load', () => {
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();
  const stats: HourStat[] = [];
  for (let d = 1; d <= 10; d++) {
    for (let hr = 0; hr < 24; hr++) {
      stats.push({ start: at(d, hr), mean: hr === 14 ? 0.3 + d * 0.05 : 0.2, min: 0.1 + d / 100 });
    }
  }

  it('takes P20–P80 of the hourly means per hour of day', () => {
    const usual = usualByHour(stats, 1000);
    expect(usual[14]!.lo).toBeCloseTo(
      quantile(
        [...Array(10)].map((_, i) => 350 + i * 50),
        0.2,
      )!,
    );
    expect(usual[14]!.hi).toBeCloseTo(710);
    expect(usual[3]).toEqual({ lo: 200, hi: 200 });
  });

  it('needs a few days before it shows a range', () => {
    expect(usualByHour(stats.slice(0, 48), 1000)[14]).toBeNull();
  });

  it('takes the base load from the lowest hourly minimums', () => {
    expect(baseLoad(stats, 1000)).toBeCloseTo(119, 0);
    expect(baseLoad(stats.slice(0, 5))).toBeNull();
  });

  it('rates the consumption against the range', () => {
    const u = { lo: 300, hi: 700 };
    expect(verdict(500, u)).toBe('normal');
    expect(verdict(900, u)).toBe('high');
    expect(verdict(100, u)).toBe('low');
    expect(verdict(500, null)).toBeNull();
  });
});

describe('energy: values and formatting', () => {
  it('converts Wh and MWh to kWh', () => {
    const h = hass([
      e('sensor.a', '6800', { unit_of_measurement: 'Wh' }),
      e('sensor.b', '6.8', { unit_of_measurement: 'kWh' }),
    ]);
    expect(energyKwh(h, 'sensor.a')).toBeCloseTo(6.8);
    expect(energyKwh(h, 'sensor.b')).toBeCloseTo(6.8);
  });

  it('reads the price from a sensor, a number or the fixed price', () => {
    const h = hass([e('sensor.price', '0.32', { unit_of_measurement: 'EUR/kWh' })]);
    expect(priceValue(h, 'sensor.price')).toBe(0.32);
    expect(currency(h, 'sensor.price')).toBe('€');
    expect(priceValue(h, priceSource({ fixed_price: 0.3 }))).toBe(0.3);
    expect(priceSource({ price: 0.28, fixed_price: 0.3 })).toBe(0.28);
  });

  it('shows 0 kW while idle and fills the ring on a sqrt scale', () => {
    const h = hass([]);
    expect(kw(h, 4)).toBe('0 kW');
    expect(kw(h, 620)).toBe('0,62 kW');
    expect(ringAngle(0, 3)).toBe(-125);
    expect(ringAngle(3000, 3)).toBe(125);
    expect(ringAngle(750, 3)).toBeCloseTo(0);
  });
});

describe('energy: tariff from the energy dashboard', () => {
  it('finds the cost sensor HA creates for a fixed price (flat grid source)', () => {
    const prefs = {
      energy_sources: [
        { type: 'solar', stat_energy_from: 'sensor.pv' },
        {
          type: 'grid',
          stat_energy_from: 'sensor.import',
          stat_cost: null,
          entity_energy_price: null,
          number_energy_price: 0.3536,
        },
      ],
    };
    const info = { cost_sensors: { 'sensor.import': 'sensor.import_cost' } };
    expect(dashboardTariff(prefs, info)).toEqual({
      costIds: ['sensor.import_cost'],
      price: 0.3536,
    });
  });

  it('uses a price sensor and an own cost statistic (older flow_from list)', () => {
    const prefs = {
      energy_sources: [
        {
          type: 'grid',
          flow_from: [
            { stat_energy_from: 'sensor.t1', entity_energy_price: 'sensor.tibber_price' },
            { stat_energy_from: 'sensor.t2', stat_cost: 'sensor.t2_cost' },
          ],
        },
      ],
    };
    const info = { cost_sensors: { 'sensor.t1': 'sensor.t1_cost' } };
    expect(dashboardTariff(prefs, info)).toEqual({
      costIds: ['sensor.t1_cost', 'sensor.t2_cost'],
      price: 'sensor.tibber_price',
    });
  });

  it('is empty without an energy dashboard and lets the config win', () => {
    expect(dashboardTariff(null, null)).toEqual({ costIds: [], price: undefined });
    expect(priceSource({}, 'sensor.tibber_price')).toBe('sensor.tibber_price');
    expect(priceSource({ fixed_price: 0.3 }, 'sensor.tibber_price')).toBe(0.3);
  });
});

describe('energy: visual editor', () => {
  type FormCard = { getConfigForm(): ReturnType<typeof configForm> };
  const form = (customElements.get('glowcard-energy') as unknown as FormCard).getConfigForm();

  it('keeps named devices in YAML', () => {
    expect(() => form.assertConfig!({ devices: ['sensor.a'] })).not.toThrow();
    expect(() => form.assertConfig!({ devices: [{ entity: 'sensor.a', name: 'A' }] })).toThrow();
  });

  it('shows a number price as the fixed price field', () => {
    expect(form.normalize!({ price: 0.3 })).toEqual({ fixed_price: 0.3 });
    expect(form.normalize!({ price: 'sensor.p' })).toEqual({ price: 'sensor.p' });
  });
});

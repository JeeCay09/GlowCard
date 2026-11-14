import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  filledBuckets,
  flowSeries,
  forecastHours,
  gridNeutrality,
  isLive,
  livePlan,
  lowCarbon,
  mixSlots,
  planMix,
  monthWeeks,
  offsetFor,
  parseSetup,
  period,
  periodPlan,
  selfConsumption,
  selfSufficiency,
  sensorForecast,
  setupIds,
  toBuckets,
  totals,
  usualBand,
} from '../src/cards/flow/flow-logic';
import { packSpans } from '../src/cards/flow/flow-card';
import { schemaDefaults, type FormSchema } from '../src/core/editor';
import '../src/glowcard';

const NOW = new Date(2026, 10, 13, 11, 30); // Fri 13 Nov 2026, 11:30

describe('parseSetup', () => {
  it('reads the flat grid source of HA 2025.x and costs from energy/info', () => {
    const s = parseSetup(
      {
        energy_sources: [
          {
            type: 'grid',
            stat_energy_from: 'sensor.in',
            stat_energy_to: 'sensor.out',
            stat_compensation: 'sensor.comp',
          },
          { type: 'gas', stat_energy_from: 'sensor.gas' },
        ],
        device_consumption: [
          { stat_consumption: 'sensor.wp', name: 'Wärmepumpe', stat_rate: 'sensor.wp_power' },
          { stat_consumption: 'sensor.wp' },
        ],
      },
      { cost_sensors: { 'sensor.in': 'sensor.in_cost', 'sensor.gas': 'sensor.gas_cost' } },
    );
    expect(s.import).toEqual(['sensor.in']);
    expect(s.importCost).toEqual(['sensor.in_cost']);
    expect(s.export).toEqual(['sensor.out']);
    expect(s.exportComp).toEqual(['sensor.comp']);
    expect(s.gasCost).toEqual(['sensor.gas_cost']);
    expect(s.devices).toEqual([{ stat: 'sensor.wp', name: 'Wärmepumpe', rate: 'sensor.wp_power' }]);
    expect(s.solar).toEqual([]);
  });

  it('reads the older flow lists, solar with forecast and the battery', () => {
    const s = parseSetup({
      energy_sources: [
        {
          type: 'grid',
          flow_from: [{ stat_energy_from: 'sensor.t1' }, { stat_energy_from: 'sensor.t2' }],
          flow_to: [{ stat_energy_to: 'sensor.out' }],
        },
        { type: 'solar', stat_energy_from: 'sensor.pv', config_entry_solar_forecast: ['fc1'] },
        { type: 'battery', stat_energy_from: 'sensor.dis', stat_energy_to: 'sensor.chg' },
      ],
    });
    expect(s.import).toEqual(['sensor.t1', 'sensor.t2']);
    expect(s.forecast).toEqual(['fc1']);
    expect(s.discharge).toEqual(['sensor.dis']);
    expect(s.charge).toEqual(['sensor.chg']);
    expect(setupIds(s)).toEqual([
      'sensor.t1',
      'sensor.t2',
      'sensor.out',
      'sensor.pv',
      'sensor.chg',
      'sensor.dis',
    ]);
  });

  it('copes with no energy dashboard', () => {
    expect(setupIds(parseSetup(null, null))).toEqual([]);
  });
});

describe('periods', () => {
  it('builds day, week, month and year', () => {
    const d = period('day', 0, NOW);
    expect([d.start.getDate(), d.buckets, d.stat]).toEqual([13, 24, 'hour']);
    expect(isLive(d)).toBe(true);
    expect(isLive(period('day', -1, NOW))).toBe(false);
    const w = period('week', 0, NOW);
    expect([w.start.getDay(), w.start.getDate(), w.buckets]).toEqual([1, 9, 7]);
    const m = period('month', -1, NOW);
    expect([m.start.getMonth(), m.buckets, m.stat]).toEqual([9, 31, 'day']);
    const y = period('year', 0, NOW);
    expect([y.start.getFullYear(), y.buckets, y.stat]).toEqual([2026, 12, 'month']);
  });

  it('maps rows to buckets and counts started buckets', () => {
    const d = period('day', 0, NOW);
    expect(bucketOf(d, new Date(2026, 10, 13, 9).getTime())).toBe(9);
    expect(filledBuckets(d, NOW)).toBe(12);
    expect(filledBuckets(period('day', -1, NOW), NOW)).toBe(24);
    const y = period('year', 0, NOW);
    expect(bucketOf(y, new Date(2026, 4, 1).getTime())).toBe(4);
    expect(filledBuckets(y, NOW)).toBe(11);
  });
});

describe('flows and key figures', () => {
  const setup = parseSetup(
    {
      energy_sources: [
        { type: 'grid', stat_energy_from: 'in', stat_energy_to: 'out', stat_cost: 'cost' },
        { type: 'solar', stat_energy_from: 'pv' },
        { type: 'battery', stat_energy_from: 'dis', stat_energy_to: 'chg' },
      ],
    },
    null,
  );
  const p = period('day', 0, NOW);
  const h = (hour: number) => new Date(2026, 10, 13, hour).getTime();
  const rows = {
    in: [
      { start: h(7), change: 2 },
      { start: h(20), change: 2 },
    ],
    out: [{ start: h(12), change: 1 }],
    pv: [{ start: h(12), change: 4 }],
    chg: [{ start: h(12), change: 1 }],
    dis: [{ start: h(20), change: 1 }],
    cost: [
      { start: h(7), change: 0.6 },
      { start: h(20), change: null },
    ],
  };
  const f = flowSeries(p, toBuckets(p, rows), setup);
  const t = totals(f);

  it('computes the house consumption like HA', () => {
    expect(f.home?.[7]).toBe(2);
    expect(f.home?.[12]).toBe(2); // 4 solar − 1 export − 1 charge
    expect(f.home?.[20]).toBe(3);
    expect(f.solarUsed?.[12]).toBe(2);
    expect(t.home).toBe(7);
    expect(t.energyCost).toBeCloseTo(0.6);
  });

  it('derives the energy dashboard key figures', () => {
    expect(selfSufficiency(t)).toBeCloseTo((1 - 4 / 7) * 100);
    expect(selfConsumption(t)).toBe(75);
    expect(gridNeutrality(t)).toBe(-3);
    expect(lowCarbon(4, 2)).toBe(50);
    expect(lowCarbon(0, 2)).toBeUndefined();
  });

  it('works with only a grid connection', () => {
    const grid = parseSetup({ energy_sources: [{ type: 'grid', stat_energy_from: 'in' }] });
    const g = totals(flowSeries(p, toBuckets(p, { in: rows.in }), grid));
    expect(g.home).toBe(4);
    expect(selfSufficiency(g)).toBe(0);
    expect(selfConsumption(g)).toBeUndefined();
    expect(gridNeutrality(g)).toBeUndefined();
    expect(periodPlan(g, false, false)).toMatchObject({
      grid: 4,
      home: 4,
      solar: undefined,
      bat: undefined,
    });
  });

  it('splits the line plan into segments', () => {
    expect(periodPlan(t, true, true)).toEqual({ grid: 3, solar: 4, bat: 0, middle: 7, home: 7 });
    expect(livePlan({ grid: -600, solar: 3200, battery: 1500, home: null })).toEqual({
      grid: -600,
      solar: 3200,
      bat: 1500,
      middle: 2600,
      home: 1100,
    });
    expect(livePlan({ grid: 620, solar: null, battery: null, home: null }).home).toBe(620);
  });
});

describe('usual band and forecast', () => {
  it('needs at least three earlier periods', () => {
    expect(usualBand([[1], [2]])).toBeUndefined();
    const band = usualBand([
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
      [5, 50],
    ])!;
    expect(band).toHaveLength(2);
    expect(band[0].lo).toBeLessThan(band[0].hi);
    expect(band[1].lo).toBeGreaterThanOrEqual(10);
  });

  it('sums the forecast of today per hour in kWh', () => {
    const p = period('day', 0, NOW);
    const at = (hour: number, day = 13) => new Date(2026, 10, day, hour).toISOString();
    const data = {
      a: { wh_hours: { [at(12)]: 1500, [at(13)]: 1000, [at(12, 14)]: 9999 } },
      b: { wh_hours: { [at(12)]: 500 } },
    };
    const fc = forecastHours(data, ['a', 'b'], p)!;
    expect(fc[12]).toBe(2);
    expect(fc[13]).toBe(1);
    expect(fc.reduce((x, y) => x + y, 0)).toBe(3);
    expect(forecastHours(data, ['a'], period('week', 0, NOW))).toBeUndefined();
    expect(forecastHours({}, ['a'], p)).toBeUndefined();
  });
});

describe('forecast sensor', () => {
  const p = period('day', 0, NOW);
  const at = (hour: number, min = 0, day = 13) => new Date(2026, 10, day, hour, min).toISOString();
  const ent = (state: string, attributes: Record<string, unknown> = {}) => ({
    entity_id: 'sensor.fc',
    state,
    attributes,
    last_changed: '',
    last_updated: '',
  });

  it('reads the total in Wh, kWh or MWh', () => {
    expect(sensorForecast(ent('12.5', { unit_of_measurement: 'kWh' }), p)).toEqual({ total: 12.5 });
    expect(sensorForecast(ent('12500', { unit_of_measurement: 'Wh' }), p)?.total).toBe(12.5);
    expect(sensorForecast(ent('unavailable'), p)).toBeUndefined();
    expect(sensorForecast(undefined, p)).toBeUndefined();
    expect(sensorForecast(ent('5'), period('week', 0, NOW))).toBeUndefined();
  });

  it('reads Solcast hourly and half-hourly values', () => {
    const hourly = sensorForecast(
      ent('3', {
        unit_of_measurement: 'kWh',
        detailedHourly: [
          { period_start: at(12), pv_estimate: 2 },
          { period_start: at(13), pv_estimate: 1 },
          { period_start: at(12, 0, 14), pv_estimate: 9 },
        ],
      }),
      p,
    )!;
    expect([hourly.hours?.[12], hourly.hours?.[13], hourly.total]).toEqual([2, 1, 3]);
    const half = sensorForecast(
      ent('x', {
        detailedForecast: [
          { period_start: at(12), pv_estimate: 2 },
          { period_start: at(12, 30), pv_estimate: 4 },
        ],
      }),
      p,
    )!;
    expect([half.hours?.[12], half.total]).toEqual([3, 3]);
  });

  it('reads Wh per hour attributes', () => {
    const f = sensorForecast(ent('4', { wh_hours: { [at(9)]: 1500, [at(10)]: 2500 } }), p)!;
    expect([f.hours?.[9], f.hours?.[10], f.total]).toEqual([1.5, 2.5, 4]);
  });
});

describe('card', () => {
  it('packs the areas into full rows of 12 columns', () => {
    expect(packSpans([8, 4, 6, 6, 3, 3])).toEqual([8, 4, 6, 6, 6, 6]);
    expect(packSpans([8, 4, 6, 3, 3])).toEqual([8, 4, 6, 3, 3]);
    expect(packSpans([8, 6, 6])).toEqual([12, 6, 6]);
    expect(packSpans([4, 3])).toEqual([6, 6]);
    expect(packSpans([8, 4, 6])).toEqual([8, 4, 12]);
  });

  it('shows its defaults in the editor', () => {
    type FormCard = { getConfigForm(): { schema: FormSchema[] } };
    const form = (
      customElements.get('glowcard-energy-flow') as unknown as FormCard
    ).getConfigForm();
    expect(schemaDefaults(form.schema)).toMatchObject({
      sections: ['usage', 'sources', 'solar', 'devices', 'gas', 'water'],
      period: 'day',
      font: 'glow',
    });
  });
});

describe('date picker', () => {
  it('finds the offset of a picked date', () => {
    expect(offsetFor('day', new Date(2026, 10, 13), NOW)).toBe(0);
    expect(offsetFor('day', new Date(2026, 9, 31, 23), NOW)).toBe(-13);
    // across the end of daylight saving time (25 Oct 2026 in Europe)
    expect(period('day', offsetFor('day', new Date(2026, 9, 20), NOW), NOW).start.getDate()).toBe(
      20,
    );
    expect(offsetFor('week', new Date(2026, 10, 9), NOW)).toBe(0);
    expect(offsetFor('week', new Date(2026, 10, 15, 22), NOW)).toBe(0);
    expect(offsetFor('week', new Date(2026, 10, 8), NOW)).toBe(-1);
    expect(offsetFor('week', new Date(2026, 9, 20), NOW)).toBe(-3);
    expect(offsetFor('month', new Date(2025, 11, 24), NOW)).toBe(-11);
    expect(offsetFor('year', new Date(2023, 5, 1), NOW)).toBe(-3);
    for (const r of ['day', 'week', 'month', 'year'] as const) {
      const d = new Date(2025, 1, 14);
      const p = period(r, offsetFor(r, d, NOW), NOW);
      expect(p.start <= d && d < p.end).toBe(true);
    }
  });

  it('lays a month out in weeks from Monday', () => {
    const nov = monthWeeks(2026, 10);
    expect(nov).toHaveLength(6);
    expect([nov[0][0].getMonth(), nov[0][0].getDate()]).toEqual([9, 26]);
    expect(nov[0][6].getDate()).toBe(1);
    expect(nov[5][0].getDate()).toBe(30);
    expect(monthWeeks(2027, 1)).toHaveLength(4); // Feb 2027 starts on a Monday
  });
});

describe('line colours by source (#198)', () => {
  const share = (grid: number, solar: number, bat: number) => ({ grid, solar, bat });

  it('colours every line by the source it carries', () => {
    // only the grid supplies the house, solar and battery idle
    const g = planMix(livePlan({ grid: 350, solar: 0, battery: 0, home: null }));
    expect(g.grid).toEqual(share(1, 0, 0));
    expect(g.middle).toEqual(share(1, 0, 0));
    expect(g.home).toEqual(share(1, 0, 0));
    // solar covers house, battery and export: everything after the junction is solar
    const s = planMix(livePlan({ grid: -600, solar: 3200, battery: 1500, home: null }));
    expect(s.grid).toEqual(share(0, 1, 0));
    expect(s.bat).toEqual(share(0, 1, 0));
    expect(s.home).toEqual(share(0, 1, 0));
    // grid only, no solar or battery set up
    expect(planMix(livePlan({ grid: 620, solar: null, battery: null, home: null })).home).toEqual(
      share(1, 0, 0),
    );
  });

  it('mixes the sources that join in proportion', () => {
    const m = planMix(livePlan({ grid: 500, solar: 1500, battery: -2000, home: null }));
    expect(m.grid).toEqual(share(1, 0, 0));
    expect(m.middle).toEqual(share(0.25, 0.75, 0));
    expect(m.bat).toEqual(share(0, 0, 1));
    expect(m.home).toEqual(share(0.125, 0.375, 0.5));
    // battery feeds the grid: the line back to the grid is battery green
    const e = planMix({ grid: -1000, solar: 0, bat: -1500, middle: -1000, home: 500 });
    expect(e.middle).toEqual(share(0, 0, 1));
    expect(e.grid).toEqual(share(0, 0, 1));
  });

  it('splits the light dots between the sources', () => {
    expect(mixSlots(share(1, 0, 0))).toEqual(['grid', 'grid', 'grid', 'grid']);
    expect(mixSlots(share(0.5, 0.5, 0)).sort()).toEqual(['grid', 'grid', 'solar', 'solar']);
    expect(mixSlots(share(0.25, 0.75, 0)).filter((k) => k === 'solar')).toHaveLength(3);
    // a small but visible share still gets one dot, a negligible one none
    expect(mixSlots(share(0.08, 0.92, 0)).filter((k) => k === 'grid')).toHaveLength(1);
    expect(mixSlots(share(0.02, 0.98, 0))).not.toContain('grid');
    const three = mixSlots(share(0.125, 0.375, 0.5));
    expect(new Set(three).size).toBe(3);
    expect(three).toHaveLength(4);
  });
});

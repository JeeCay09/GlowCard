import { describe, expect, it } from 'vitest';
import {
  findAlertParts,
  formatKw,
  formatWhen,
  lightIds,
  securityState,
  segmentView,
  validateSegment,
  type SegmentConfig,
} from '../src/cards/status/status-logic';
import { greetingFor, presenceText } from '../src/cards/status/header-card';
import { simpleSegments } from '../src/cards/status/status-card';
import { chipSegment } from '../src/cards/status/chip-card';
import type { HassEntity, HomeAssistant } from '../src/types/hass';

const e = (
  id: string,
  state: string,
  attributes: HassEntity['attributes'] = {},
  changed = '2026-11-04T08:31:00',
): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: changed,
  last_updated: changed,
});

const hass = (states: HassEntity[], extra: Partial<HomeAssistant> = {}): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    entities: {},
    devices: {},
    areas: {},
    language: 'de',
    callService: async () => undefined,
    ...extra,
  }) as HomeAssistant;

const view = (h: HomeAssistant, cfg: SegmentConfig) => segmentView(h, cfg, true);

describe('status segments', () => {
  it('shows the weather like the mockup', () => {
    const h = hass([e('weather.home', 'cloudy', { temperature: 7.8, humidity: 81 })], {
      formatEntityState: () => 'Bewölkt',
    });
    const v = view(h, { type: 'weather', entity: 'weather.home' });
    expect(v.value).toBe('7,8°');
    expect(v.label).toBe('Bewölkt · 81 %');
    expect(v.chipSub).toBe('Bewölkt');
    expect(v.popup).toBe(false);
  });

  it('counts lights that are on and skips light groups for "all"', () => {
    const h = hass([
      e('light.a', 'on', { rgb_color: [255, 165, 110] }),
      e('light.b', 'on'),
      e('light.c', 'off'),
      e('light.group', 'on', { entity_id: ['light.a', 'light.b'] }),
    ]);
    expect(lightIds(h, { type: 'lights' })).toEqual(['light.a', 'light.b', 'light.c']);
    expect(lightIds(h, { type: 'lights', exclude: ['light.b'] })).toEqual(['light.a', 'light.c']);
    expect(view(h, { type: 'lights', exclude: ['light.a'] }).value).toBe('1 an');
    const v = view(h, { type: 'lights' });
    expect(v.value).toBe('2 an');
    expect(v.chipText).toBe('2 Lichter an');
    expect(v.tone).toBe('active');
    expect(v.rgb).toEqual([255, 165, 110]);
    expect(v.badge).toBe('2');
    const off = view(hass([e('light.a', 'off')]), { type: 'lights' });
    expect([off.value, off.chipText, off.tone]).toEqual(['Aus', 'Keine Lichter an', 'neutral']);
  });

  it('shows solar power and battery state for energy and battery', () => {
    const h = hass([
      e('sensor.pv', '2.35', { unit_of_measurement: 'kW' }),
      e('sensor.soc', '60', { unit_of_measurement: '%' }),
      e('sensor.bat', '2050', { unit_of_measurement: 'W' }),
    ]);
    const cfg = { solar: 'sensor.pv', battery: 'sensor.soc', battery_power: 'sensor.bat' };
    const v = view(h, { type: 'energy', ...cfg });
    expect(v.value).toBe('2,35 kW');
    expect(v.label).toBe('Akku 60 % · lädt');
    const b = view(h, { type: 'battery', ...cfg });
    expect([b.chipText, b.chipSub, b.ring, b.popup]).toEqual(['Akku 60 %', 'lädt', 60, true]);
  });

  it('formats power in kW', () => {
    const de = hass([]);
    expect(formatKw(de, 320)).toBe('0,32 kW');
    expect(formatKw(de, 0)).toBe('0 kW');
    expect(formatKw(de, 2050, true)).toBe('+2,05 kW');
    expect(formatKw(de, -400, true)).toBe('−0,40 kW');
  });

  it('is calm while everything is closed and warns otherwise', () => {
    const states = [
      e('binary_sensor.window', 'off', { device_class: 'window' }),
      e('binary_sensor.smoke', 'off', { device_class: 'smoke' }),
    ];
    const cfg: SegmentConfig = {
      type: 'security',
      entities: ['binary_sensor.window', { entity: 'binary_sensor.smoke', name: 'Rauchmelder' }],
    };
    const ok = view(hass(states), cfg);
    expect([ok.value, ok.label, ok.tone, ok.pulse]).toEqual([
      'Alles zu',
      'Fenster, Rauch',
      'calm',
      false,
    ]);
    states[1] = e('binary_sensor.smoke', 'on', { device_class: 'smoke' });
    const bad = view(hass(states), cfg);
    expect([bad.value, bad.label, bad.tone, bad.pulse]).toEqual([
      '1 Meldung',
      'Rauchmelder',
      'warning',
      true,
    ]);
  });

  it('uses short states from the mockup', () => {
    const h = hass([]);
    expect(securityState(h, e('binary_sensor.w', 'off', { device_class: 'window' }))).toBe('Zu');
    expect(securityState(h, e('binary_sensor.s', 'off', { device_class: 'smoke' }))).toBe(
      'Kein Rauch',
    );
    expect(securityState(h, e('binary_sensor.x', 'off'))).toBe('Kein Alarm');
    expect(securityState(h, e('lock.door', 'unlocked'))).toBe('Entriegelt');
  });

  it('finds the error text and vacuum on the alert device', () => {
    const h = hass(
      [
        e('binary_sensor.vesta_problem', 'on', { device_class: 'problem' }),
        e('sensor.vesta_error', 'water_tank_dry'),
        e('vacuum.vesta', 'paused'),
      ],
      {
        entities: {
          'binary_sensor.vesta_problem': {
            entity_id: 'binary_sensor.vesta_problem',
            device_id: 'v',
          },
          'sensor.vesta_error': { entity_id: 'sensor.vesta_error', device_id: 'v' },
          'vacuum.vesta': { entity_id: 'vacuum.vesta', device_id: 'v' },
        },
        devices: { v: { id: 'v', name: 'Vesta' } },
        formatEntityState: (s: HassEntity) =>
          s.state === 'water_tank_dry' ? 'Wassertank leer' : s.state,
      },
    );
    const cfg: SegmentConfig = { type: 'alert', entity: 'binary_sensor.vesta_problem' };
    expect(findAlertParts(h, cfg)).toEqual({
      detail: 'sensor.vesta_error',
      vacuum: 'vacuum.vesta',
    });
    const v = view(h, cfg);
    expect([v.value, v.label, v.tone, v.pulse, v.hidden]).toEqual([
      'Vesta',
      'Wassertank leer',
      'warning',
      true,
      false,
    ]);
    h.states['binary_sensor.vesta_problem'] = e('binary_sensor.vesta_problem', 'off');
    expect(view(h, cfg).hidden).toBe(true);
    expect(view(h, { ...cfg, hide_when_ok: false }).hidden).toBe(false);
  });

  it('shows people at home with a ring', () => {
    const h = hass([e('person.gilbert', 'home', { friendly_name: 'Gilbert' })]);
    const v = view(h, { type: 'person', entity: 'person.gilbert' });
    expect(v.avatar).toEqual({ initial: 'G', picture: undefined, home: true });
    expect(v.chipSub).toBe('zu Hause');
  });

  it('formats "since" with today and yesterday', () => {
    const now = new Date(2026, 10, 4, 11, 32);
    const de = hass([]);
    expect(formatWhen(de, new Date(2026, 10, 4, 6, 31), now)).toBe('heute 06:31');
    expect(formatWhen(de, new Date(2026, 10, 3, 17, 2), now)).toBe('gestern 17:02');
  });

  it('rejects broken segments with a readable message', () => {
    expect(() => validateSegment({ type: 'nope' } as never, 'segments[0]')).toThrow(/unknown type/);
    expect(() => validateSegment({ type: 'weather' }, 'segments[0]')).toThrow(/needs an entity/);
    expect(() => validateSegment({ type: 'lights' }, 'x')).not.toThrow();
  });
});

describe('header', () => {
  it('greets by time of day', () => {
    const h = hass([]);
    expect(greetingFor(h, new Date(2026, 10, 4, 7))).toBe('Guten Morgen');
    expect(greetingFor(h, new Date(2026, 10, 4, 13))).toBe('Guten Tag');
    expect(greetingFor(h, new Date(2026, 10, 4, 19))).toBe('Guten Abend');
    expect(greetingFor(h, new Date(2026, 10, 4, 23))).toBe('Gute Nacht');
  });

  it('describes who is at home', () => {
    const ids = ['person.g', 'person.m'];
    const names = ['Gilbert', 'Maureen'];
    expect(presenceText(hass([e('person.g', 'home'), e('person.m', 'home')]), ids, names)).toBe(
      'Beide zu Hause',
    );
    expect(presenceText(hass([e('person.g', 'home'), e('person.m', 'work')]), ids, names)).toBe(
      'Gilbert zu Hause',
    );
    expect(presenceText(hass([e('person.g', 'x'), e('person.m', 'y')]), ids, names)).toBe(
      'Niemand zu Hause',
    );
  });
});

describe('card configs', () => {
  it('builds status segments from the editor form in mockup order', () => {
    const segs = simpleSegments({
      type: 'custom:glowcard-status',
      weather: 'weather.home',
      all_lights: true,
      solar: 'sensor.pv',
      security: ['binary_sensor.window'],
      alerts: ['binary_sensor.vesta_problem'],
    });
    expect(segs.map((s) => s.type)).toEqual(['weather', 'lights', 'energy', 'security', 'alert']);
  });

  it('passes excluded lights only when all lights are counted', () => {
    const base = { type: 'custom:glowcard-status', exclude_lights: ['light.x'] };
    expect(simpleSegments({ ...base, all_lights: true })).toEqual([
      { type: 'lights', exclude: ['light.x'] },
    ]);
    expect(simpleSegments({ ...base, lights: ['light.a'] })).toEqual([
      { type: 'lights', entities: ['light.a'] },
    ]);
  });

  it('guesses the chip kind from the entity', () => {
    expect(chipSegment({ type: 'custom:glowcard-chip', entity: 'weather.home' }).type).toBe(
      'weather',
    );
    expect(chipSegment({ type: 'custom:glowcard-chip', entity: 'person.g' }).type).toBe('person');
    expect(chipSegment({ type: 'custom:glowcard-chip', entity: 'switch.x' }).type).toBe('entity');
    expect(chipSegment({ type: 'custom:glowcard-chip', chip: 'lights' })).toEqual({
      type: 'lights',
    });
  });
});

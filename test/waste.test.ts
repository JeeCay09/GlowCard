import { describe, expect, it } from 'vitest';
import {
  binKind,
  binLook,
  dayLabel,
  daysUntil,
  nextAndLater,
  parseDay,
  pickupFromSensor,
  pickupsFromCalendarState,
  pickupsFromEvents,
  relativeDay,
  upcoming,
} from '../src/cards/waste/waste-logic';
import type { HassEntity, HomeAssistant } from '../src/types/hass';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '2026-11-10T08:00:00',
  last_updated: '2026-11-10T08:00:00',
});

const de = { language: 'de' } as HomeAssistant;
const en = { language: 'en' } as HomeAssistant;
// Tuesday, 10 Nov 2026, in the evening
const now = new Date(2026, 10, 10, 19, 30);

describe('waste bins', () => {
  it('recognises the usual bins in German and English', () => {
    expect(binKind('Biotonne')).toBe('bio');
    expect(binKind('Papiertonne')).toBe('paper');
    expect(binKind('Gelber Sack')).toBe('yellow');
    expect(binKind('Wertstofftonne')).toBe('yellow');
    expect(binKind('Restmüll')).toBe('rest');
    expect(binKind('Altglas')).toBe('glass');
    expect(binKind('Recycling')).toBe('yellow');
    expect(binKind('General waste')).toBe('rest');
    expect(binKind('Christbaum')).toBe('other');
  });

  it('takes name, icon and colour from the bins overrides', () => {
    const look = binLook('Abfuhr Bio', [{ match: 'bio', name: 'Braune Tonne', color: '#795548' }]);
    expect(look).toEqual({ name: 'Braune Tonne', icon: 'mdi:leaf', color: [121, 85, 72] });
    expect(binLook('Papier').icon).toBe('mdi:newspaper-variant-outline');
  });
});

describe('waste dates', () => {
  it('counts whole days from today', () => {
    expect(daysUntil(new Date(2026, 10, 10), now)).toBe(0);
    expect(daysUntil(new Date(2026, 10, 11, 6), now)).toBe(1);
    expect(daysUntil(new Date(2026, 10, 19), now)).toBe(9);
  });

  it('reads a plain date as local midnight', () => {
    expect(parseDay('2026-11-11')?.getTime()).toBe(new Date(2026, 10, 11).getTime());
    expect(parseDay('nope')).toBeNull();
  });

  it('writes the relative day like the mockup', () => {
    expect(relativeDay(de, 0)).toBe('Heute');
    expect(relativeDay(de, 1)).toBe('Morgen');
    expect(relativeDay(de, 3)).toBe('in 3 Tagen');
    expect(relativeDay(en, 3)).toBe('in 3 days');
    expect(dayLabel(de, new Date(2026, 10, 12))).toBe('Do, 12.');
  });
});

describe('waste sources', () => {
  it('splits calendar events into bins, also several bins in one event', () => {
    const list = pickupsFromEvents('calendar.waste', [
      { summary: 'Biotonne', start: { date: '2026-11-11' } },
      { summary: 'Papier, Gelber Sack', start: { date: '2026-11-26' } },
      { summary: '', start: { date: '2026-11-12' } },
    ]);
    expect(list.map((p) => p.name)).toEqual(['Biotonne', 'Papier', 'Gelber Sack']);
    expect(list[2].date.getTime()).toBe(new Date(2026, 10, 26).getTime());
    expect(list[0].entity).toBe('calendar.waste');
  });

  it('falls back to the calendar state when the events cannot be loaded', () => {
    const cal = e('calendar.waste', 'off', {
      message: 'Restmüll',
      start_time: '2026-11-19 00:00:00',
      all_day: true,
    });
    const [p] = pickupsFromCalendarState(cal);
    expect(p.name).toBe('Restmüll');
    expect(daysUntil(p.date, now)).toBe(9);
  });

  it('reads date, timestamp, day count and daysTo sensors', () => {
    const date = e('sensor.bio', '2026-11-11', { device_class: 'date', friendly_name: 'Biotonne' });
    const ts = e('sensor.paper', '2026-11-12T05:00:00+00:00', {
      device_class: 'timestamp',
      friendly_name: 'Papier',
    });
    const count = e('sensor.yellow', '3', { friendly_name: 'Gelber Sack' });
    const wcs = e('sensor.rest', 'in 9 Tagen', { daysTo: 9, friendly_name: 'Restmüll' });
    expect(daysUntil(pickupFromSensor(date, [], now)!.date, now)).toBe(1);
    expect(daysUntil(pickupFromSensor(ts, [], now)!.date, now)).toBe(2);
    expect(daysUntil(pickupFromSensor(count, [], now)!.date, now)).toBe(3);
    expect(daysUntil(pickupFromSensor(wcs, [], now)!.date, now)).toBe(9);
    expect(
      pickupFromSensor(e('sensor.x', 'unknown', { device_class: 'date' }), [], now),
    ).toBeNull();
    expect(pickupFromSensor(e('sensor.x', 'Montag'), [], now)).toBeNull();
  });
});

describe('waste next pickup', () => {
  const list = upcoming(
    [
      ...pickupsFromEvents('calendar.waste', [
        { summary: 'Biotonne', start: { date: '2026-11-09' } },
        { summary: 'Papier', start: { date: '2026-11-12' } },
        { summary: 'Biotonne', start: { date: '2026-11-11' } },
        { summary: 'Restmüll', start: { date: '2026-11-11' } },
        { summary: 'Biotonne', start: { date: '2026-11-25' } },
        { summary: 'Gelber Sack', start: { date: '2026-11-13' } },
      ]),
      // the same pickup from a sensor too
      pickupFromSensor(
        e('sensor.bio', '2026-11-11', { device_class: 'date', friendly_name: 'Biotonne' }),
        [],
        now,
      )!,
    ],
    now,
  );

  it('drops past pickups and duplicates and sorts by date', () => {
    expect(list.map((p) => `${p.date.getDate()} ${p.name}`)).toEqual([
      '11 Biotonne',
      '11 Restmüll',
      '12 Papier',
      '13 Gelber Sack',
      '25 Biotonne',
    ]);
  });

  it('puts all bins of the first day on top and each other bin once below', () => {
    const { next, later } = nextAndLater(list);
    expect(next.map((p) => p.name)).toEqual(['Biotonne', 'Restmüll']);
    expect(later.map((p) => p.name)).toEqual(['Papier', 'Gelber Sack']);
    expect(nextAndLater([])).toEqual({ next: [], later: [] });
  });
});

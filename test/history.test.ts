import { describe, expect, it } from 'vitest';
import {
  countSwitchOns,
  daySegments,
  lastChanges,
  meterIncrease,
  numericBuckets,
  onPeriods,
  totalHours,
  type StatePoint,
} from '../src/core/history';

const H = 3_600_000;
const t0 = new Date(2026, 10, 2, 0, 0, 0).getTime(); // Mon 2 Nov 2026, local midnight
const p = (state: string, hours: number): StatePoint => ({ state, start: t0 + hours * H });

describe('history', () => {
  const points = [p('off', 0), p('on', 6), p('off', 8), p('on', 20), p('off', 30)];

  it('finds on periods clipped to the window', () => {
    expect(onPeriods(points, t0, t0 + 24 * H)).toEqual([
      [t0 + 6 * H, t0 + 8 * H],
      [t0 + 20 * H, t0 + 24 * H],
    ]);
    expect(totalHours(onPeriods(points, t0, t0 + 48 * H))).toBe(12);
  });

  it('splits periods into local days', () => {
    const now = t0 + 36 * H; // Tue 12:00
    const days = daySegments(onPeriods(points, 0, now), now, 2);
    expect(days).toHaveLength(2);
    expect(days[0].segments).toEqual([
      [6, 8],
      [20, 24],
    ]);
    expect(days[1].segments).toEqual([[0, 6]]);
    expect(days[1].today).toBe(true);
  });

  it('counts switch-ons and lists the latest changes', () => {
    expect(countSwitchOns(points, t0)).toBe(2);
    expect(lastChanges(points, 2).map((x) => x.state)).toEqual(['off', 'on']);
  });

  it('averages numbers into buckets', () => {
    const power = [p('100', 0), p('300', 1)];
    expect(numericBuckets(power, t0, t0 + 2 * H, 2)).toEqual([100, 300]);
  });

  it('sums meter increases across a reset', () => {
    const meter = [p('10', 0), p('12', 5), p('1', 10), p('3', 20)];
    expect(meterIncrease(meter, t0, t0 + 24 * H)).toBe(2 + 1 + 2);
  });
});

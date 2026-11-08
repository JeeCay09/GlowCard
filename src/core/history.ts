import type { HomeAssistant } from '../types/hass';

/** One state with the moment it started. */
export interface StatePoint {
  state: string;
  start: number; // epoch ms
}

interface CompressedState {
  s: string;
  lu?: number;
  lc?: number;
}

/**
 * Loads the recorder history of some entities for a time window via the standard
 * `history/history_during_period` WebSocket command. Returns [] per entity on error.
 */
export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  start: Date,
  end = new Date(),
): Promise<Record<string, StatePoint[]>> {
  const empty = Object.fromEntries(entityIds.map((id) => [id, [] as StatePoint[]]));
  if (!hass.callWS || entityIds.length === 0) return empty;
  try {
    const res = await hass.callWS<Record<string, CompressedState[]>>({
      type: 'history/history_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: entityIds,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
    for (const id of entityIds) {
      empty[id] = (res[id] ?? []).map((p) => ({
        state: p.s,
        start: Math.max(start.getTime(), Math.round((p.lc ?? p.lu ?? 0) * 1000)),
      }));
    }
  } catch {
    /* history is optional: cards still work without it */
  }
  return empty;
}

/** Periods (ms) in which the entity was `on`, clipped to [from, to]. */
export function onPeriods(
  points: StatePoint[],
  from: number,
  to: number,
  onState = 'on',
): [number, number][] {
  const out: [number, number][] = [];
  const sorted = [...points].sort((a, b) => a.start - b.start);
  sorted.forEach((p, i) => {
    if (p.state !== onState) return;
    const a = Math.max(from, p.start);
    const b = Math.min(to, sorted[i + 1]?.start ?? to);
    if (b > a) {
      const last = out[out.length - 1];
      if (last && last[1] === a) last[1] = b;
      else out.push([a, b]);
    }
  });
  return out;
}

export interface DayStrip {
  /** Local midnight of the day. */
  start: number;
  /** On periods as hours of that day [0–24]. */
  segments: [number, number][];
  today: boolean;
}

/** Splits on periods into the last `days` local days (oldest first, today last). */
export function daySegments(periods: [number, number][], now: number, days = 7): DayStrip[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const result: DayStrip[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const s = dayStart.getTime();
    const e = dayEnd.getTime();
    const len = e - s; // 23/24/25 h around DST
    const segments: [number, number][] = [];
    for (const [a, b] of periods) {
      const x = Math.max(a, s);
      const y = Math.min(b, e, now);
      if (y > x) segments.push([((x - s) / len) * 24, ((y - s) / len) * 24]);
    }
    result.push({ start: s, segments, today: i === 0 });
  }
  return result;
}

export function totalHours(periods: [number, number][]): number {
  return periods.reduce((sum, [a, b]) => sum + (b - a), 0) / 3_600_000;
}

/** How often the state switched to `on` inside the window (the first point is not a switch). */
export function countSwitchOns(points: StatePoint[], from: number, onState = 'on'): number {
  const sorted = [...points].sort((a, b) => a.start - b.start);
  let n = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start >= from && sorted[i].state === onState && sorted[i - 1].state !== onState)
      n++;
  }
  return n;
}

/** The latest real on/off changes, newest first. */
export function lastChanges(points: StatePoint[], limit = 3): StatePoint[] {
  const sorted = [...points].sort((a, b) => a.start - b.start);
  const changes = sorted.filter(
    (p, i) => i > 0 && (p.state === 'on' || p.state === 'off') && p.state !== sorted[i - 1].state,
  );
  return changes.reverse().slice(0, limit);
}

/** Numeric series averaged into `buckets` equal slots over [from, to] (step-wise). */
export function numericBuckets(
  points: StatePoint[],
  from: number,
  to: number,
  buckets: number,
): number[] {
  const sorted = [...points].sort((a, b) => a.start - b.start);
  const size = (to - from) / buckets;
  const out: number[] = [];
  for (let k = 0; k < buckets; k++) {
    const bs = from + k * size;
    const be = bs + size;
    let weighted = 0;
    let covered = 0;
    sorted.forEach((p, i) => {
      const v = Number(p.state);
      if (!Number.isFinite(v)) return;
      const a = Math.max(bs, p.start);
      const b = Math.min(be, sorted[i + 1]?.start ?? to);
      if (b > a) {
        weighted += v * (b - a);
        covered += b - a;
      }
    });
    out.push(covered > 0 ? weighted / covered : (out[out.length - 1] ?? 0));
  }
  return out;
}

/** Sum of increases of a cumulative meter between two times (handles resets). */
export function meterIncrease(points: StatePoint[], from: number, to: number): number | undefined {
  const sorted = [...points]
    .sort((a, b) => a.start - b.start)
    .filter((p) => Number.isFinite(Number(p.state)));
  let prev: number | undefined;
  let sum = 0;
  let seen = false;
  for (const p of sorted) {
    const v = Number(p.state);
    if (p.start > to) break;
    if (p.start <= from) {
      prev = v;
      continue;
    }
    seen = true;
    if (prev !== undefined) sum += v >= prev ? v - prev : v;
    prev = v;
  }
  return seen || prev !== undefined ? sum : undefined;
}

/**
 * Sum of the statistics `change` per id between start and end (e.g. today's cost from
 * HA's energy cost sensor, which already applies the price of each moment). Missing ids
 * are left out; returns {} on error.
 */
export async function fetchStatChange(
  hass: HomeAssistant,
  ids: string[],
  start: Date,
  end = new Date(),
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!hass.callWS || ids.length === 0) return out;
  try {
    const res = await hass.callWS<Record<string, { change?: number | null }[]>>({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period: 'hour',
      types: ['change'],
    });
    for (const id of ids) {
      const rows = res?.[id];
      if (rows?.length) out[id] = rows.reduce((s, r) => s + (r.change ?? 0), 0);
    }
  } catch {
    /* statistics are optional */
  }
  return out;
}

/** One long-term statistics row (`recorder/statistics_during_period`). */
export interface StatRow {
  start: number; // epoch ms
  mean: number | null;
  min: number | null;
  max: number | null;
  state: number | null;
}

interface RawStat {
  start: number | string;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  state?: number | null;
}

/**
 * Hourly (or daily) long-term statistics via the standard recorder WebSocket command.
 * Works for every sensor with a state_class. Returns [] per id on error.
 */
export async function fetchStatistics(
  hass: HomeAssistant,
  ids: string[],
  start: Date,
  end = new Date(),
  period: 'hour' | 'day' = 'hour',
): Promise<Record<string, StatRow[]>> {
  const empty = Object.fromEntries(ids.map((id) => [id, [] as StatRow[]]));
  if (!hass.callWS || ids.length === 0) return empty;
  try {
    const res = await hass.callWS<Record<string, RawStat[]>>({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period,
      types: ['mean', 'min', 'max', 'state'],
    });
    for (const id of ids) {
      empty[id] = (res?.[id] ?? []).map((r) => ({
        start: typeof r.start === 'number' ? r.start : new Date(r.start).getTime(),
        mean: r.mean ?? null,
        min: r.min ?? null,
        max: r.max ?? null,
        state: r.state ?? null,
      }));
    }
  } catch {
    /* statistics are optional */
  }
  return empty;
}

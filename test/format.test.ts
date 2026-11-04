import { describe, expect, it } from 'vitest';
import { formatDuration, formatHours, formatLogDate } from '../src/core/format';
import type { HomeAssistant } from '../src/types/hass';

const de = { language: 'de', states: {} } as unknown as HomeAssistant;
const en = { language: 'en', states: {} } as unknown as HomeAssistant;
const MIN = 60_000;

describe('format', () => {
  it('formats durations like the mockup', () => {
    expect(formatDuration(de, (45 * 60 + 0) * MIN)).toBe('1 T. 21 Std');
    expect(formatDuration(de, 190 * MIN)).toBe('3 Std 10 Min');
    expect(formatDuration(de, 12 * MIN)).toBe('12 Min');
    expect(formatDuration(de, 10_000)).toBe('gerade eben');
    expect(formatDuration(en, 12 * MIN)).toBe('12 min');
  });

  it('formats hours with a German decimal comma', () => {
    expect(formatHours(de, 84)).toBe('84 Std');
    expect(formatHours(de, 2.5)).toBe('2,5 Std');
  });

  it('labels today in the change log', () => {
    const now = new Date(2026, 10, 4, 12, 0);
    expect(formatLogDate(de, new Date(2026, 10, 4, 11, 21), now)).toBe('Heute · 11:21');
    expect(formatLogDate(de, new Date(2026, 10, 2, 14, 12), now)).toBe('Mo. 02.11 · 14:12');
  });
});

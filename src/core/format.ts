import type { HomeAssistant } from '../types/hass';
import { language, localize } from './localize';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Short weekday; German gets the mockup's "Mo." form, `bare` drops the dot ("Mo"). */
export function weekdayShort(hass: HomeAssistant | undefined, date: Date, bare = false): string {
  const lang = language(hass);
  const wd = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date).replace(/\.$/, '');
  return !bare && lang.startsWith('de') ? `${wd}.` : wd;
}

/** "So. 20:22" – weekday and time, as on the switch cards. */
export function formatWeekdayTime(hass: HomeAssistant | undefined, date: Date): string {
  const lang = language(hass);
  const wd = weekdayShort(hass, date);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${wd} ${time}`;
}

/** "Mo. 02.11 · 14:12" for the change log. */
export function formatLogDate(
  hass: HomeAssistant | undefined,
  date: Date,
  now = new Date(),
): string {
  const lang = language(hass);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (sameDay(date, now)) return `${localize(hass, 'today')} · ${time}`;
  const wd = weekdayShort(hass, date);
  const day = new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit' }).format(date);
  return `${wd} ${day.replace(/\.$/, '')} · ${time}`;
}

/** "1 T. 21 Std", "3 Std 10 Min", "12 Min", or "gerade eben" under a minute. */
export function formatDuration(hass: HomeAssistant | undefined, ms: number): string {
  if (ms < MIN) return localize(hass, 'just_now');
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const D = localize(hass, 'days_short');
  const H = localize(hass, 'hours_short');
  const M = localize(hass, 'minutes_short');
  if (d > 0) return `${d} ${D} ${h} ${H}`;
  if (h > 0) return m > 0 ? `${h} ${H} ${m} ${M}` : `${h} ${H}`;
  return `${m} ${M}`;
}

/** Hours with at most one decimal, e.g. "84 Std" / "2,5 Std". */
export function formatHours(hass: HomeAssistant | undefined, hours: number): string {
  const n = new Intl.NumberFormat(language(hass), { maximumFractionDigits: hours < 10 ? 1 : 0 });
  return `${n.format(hours)} ${localize(hass, 'hours_short')}`;
}

export function formatNumber(hass: HomeAssistant | undefined, value: number, digits = 0): string {
  return new Intl.NumberFormat(language(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

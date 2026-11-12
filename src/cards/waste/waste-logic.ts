import type { HassEntity, HomeAssistant } from '../../types/hass';
import { hexToRgb, type Rgb } from '../../core/color';
import { language } from '../../core/localize';

/**
 * Waste collection card logic (issue #151). Pickups come only from standard entities:
 * `calendar.*` events (e.g. Waste Collection Schedule or an ICS calendar) or sensors
 * holding the next date (device class date / timestamp), the days until it (number) or
 * a `daysTo` attribute. Bins are recognised by name; `bins` in the config overrides
 * name, icon and colour per bin.
 */

export type BinKind = 'bio' | 'paper' | 'yellow' | 'rest' | 'glass' | 'other';

export interface BinOverride {
  /** Part of the event title or entity name, case-insensitive. */
  match: string;
  name?: string;
  icon?: string;
  color?: string;
}

export interface Pickup {
  /** Bin key: the name in lower case, used to group pickups of the same bin. */
  key: string;
  /** Recognised bin type (for the editor's colour per bin). */
  kind: BinKind;
  /** True when `bins` in YAML set the colour; it then wins over the editor colour. */
  ownColor?: boolean;
  name: string;
  icon: string;
  color: Rgb;
  /** Local midnight of the pickup day. */
  date: Date;
  /** The entity the pickup came from (for more-info). */
  entity: string;
}

/** Glow tones per bin; Restmüll slate, Bio brown, Papier blue, Gelber Sack yellow. */
const KINDS: Record<BinKind, { icon: string; color: Rgb; words: RegExp }> = {
  bio: {
    icon: 'mdi:leaf',
    color: [161, 98, 7],
    words: /bio|organic|kompost|compost|grün|garden|garten|food/i,
  },
  paper: {
    icon: 'mdi:newspaper-variant-outline',
    color: [59, 130, 246],
    words: /papier|paper|pappe|karton|cardboard|blau/i,
  },
  yellow: {
    icon: 'mdi:recycle',
    color: [234, 179, 8],
    words: /gelb|yellow|wertstoff|verpack|plast|recycl|leichtverp|lvp/i,
  },
  glass: { icon: 'mdi:bottle-wine-outline', color: [16, 185, 129], words: /glas/i },
  rest: {
    icon: 'mdi:trash-can-outline',
    color: [100, 116, 139],
    words: /rest|residual|general|haus|landfill|black|schwarz|grau|grey|gray|müll|waste|trash/i,
  },
  other: { icon: 'mdi:delete-variant', color: [139, 92, 246], words: /$^/ },
};

const ORDER: BinKind[] = ['bio', 'paper', 'yellow', 'glass', 'rest'];

/** Recognises the bin from its name; the more specific kinds win over "Müll". */
export function binKind(name: string): BinKind {
  return ORDER.find((k) => KINDS[k].words.test(name)) ?? 'other';
}

/** Name, icon and colour of a bin, from the config overrides or the recognised kind. */
export function binLook(
  name: string,
  overrides: BinOverride[] = [],
): { name: string; icon: string; color: Rgb; kind: BinKind; ownColor: boolean } {
  const o = overrides.find((b) => b.match && name.toLowerCase().includes(b.match.toLowerCase()));
  const found = binKind(name);
  const kind = found === 'other' && o?.name ? binKind(o.name) : found;
  const own = o?.color ? hexToRgb(o.color) : null;
  return {
    name: o?.name ?? name,
    icon: o?.icon ?? KINDS[kind].icon,
    color: own ?? KINDS[kind].color,
    kind,
    ownColor: !!own,
  };
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from today to the pickup (0 = today). */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** "2026-11-11" as local midnight; anything else through Date. */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : startOfDay(new Date(t));
}

/** Calendar event as HA's REST API returns it (`/api/calendars/<entity>`). */
export interface CalendarEvent {
  summary?: string;
  start: { date?: string; dateTime?: string } | string;
}

function eventDay(ev: CalendarEvent): Date | null {
  const s = typeof ev.start === 'string' ? ev.start : (ev.start.date ?? ev.start.dateTime);
  return s ? parseDay(s) : null;
}

/** Pickups from calendar events; one event may name several bins ("Bio, Papier"). */
export function pickupsFromEvents(
  entity: string,
  events: CalendarEvent[],
  overrides: BinOverride[] = [],
): Pickup[] {
  const out: Pickup[] = [];
  for (const ev of events) {
    const date = eventDay(ev);
    const title = ev.summary?.trim();
    if (!date || !title) continue;
    for (const part of title.split(/\s*(?:,|\+|&|\/|;| und | and )\s*/i).filter(Boolean)) {
      const look = binLook(part, overrides);
      out.push({ key: look.name.toLowerCase(), ...look, date, entity });
    }
  }
  return out;
}

/**
 * The calendar's current or next event from its state (`message`, `start_time`); used
 * when the event list cannot be loaded.
 */
export function pickupsFromCalendarState(
  entity: HassEntity,
  overrides: BinOverride[] = [],
): Pickup[] {
  const { message, start_time: start } = entity.attributes;
  if (typeof message !== 'string' || typeof start !== 'string') return [];
  return pickupsFromEvents(
    entity.entity_id,
    [{ summary: message, start: start.slice(0, 10) }],
    overrides,
  );
}

/** The next pickup a sensor reports, or null when its state is no date or day count. */
export function pickupFromSensor(
  entity: HassEntity,
  overrides: BinOverride[] = [],
  now = new Date(),
): Pickup | null {
  const { state, attributes: a } = entity;
  let date: Date | null = null;
  const days = typeof a.daysTo === 'number' ? a.daysTo : Number(state);
  if (a.device_class !== 'date' && a.device_class !== 'timestamp' && Number.isFinite(days)) {
    if (state !== '' && days >= 0) {
      date = startOfDay(now);
      date.setDate(date.getDate() + Math.round(days));
    }
  } else if (state && state !== 'unknown' && state !== 'unavailable') {
    date = parseDay(state);
  }
  if (!date) return null;
  const look = binLook(a.friendly_name ?? entity.entity_id, overrides);
  return { key: look.name.toLowerCase(), ...look, date, entity: entity.entity_id };
}

/** Pickups from today on, sorted by date, without duplicates of the same bin and day. */
export function upcoming(pickups: Pickup[], now = new Date()): Pickup[] {
  const seen = new Set<string>();
  return pickups
    .filter((p) => daysUntil(p.date, now) >= 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name))
    .filter((p) => {
      const id = `${p.key}|${p.date.getTime()}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/** The first pickup day (all bins on it) and each other bin's next pickup after it. */
export function nextAndLater(list: Pickup[]): { next: Pickup[]; later: Pickup[] } {
  if (!list.length) return { next: [], later: [] };
  const day = list[0].date.getTime();
  const next = list.filter((p) => p.date.getTime() === day);
  const shown = new Set(next.map((p) => p.key));
  const later: Pickup[] = [];
  for (const p of list) {
    if (shown.has(p.key)) continue;
    shown.add(p.key);
    later.push(p);
  }
  return { next, later };
}

// ---------- texts ----------

const T = {
  de: {
    today: 'Heute',
    tomorrow: 'Morgen',
    in_days: 'in {n} Tagen',
    put_out_today: 'heute rausstellen',
    no_pickups: 'Keine Termine',
    no_pickups_sub: 'Kalender oder Sensor wählen',
    title: 'Müllabfuhr',
    and: '&',
    loading: 'Lade Termine …',
  },
  en: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    in_days: 'in {n} days',
    put_out_today: 'put out today',
    no_pickups: 'No pickups',
    no_pickups_sub: 'Choose a calendar or sensor',
    title: 'Waste collection',
    and: '&',
    loading: 'Loading pickups …',
  },
};

export type WasteText = keyof (typeof T)['de'];

export function wt(hass: HomeAssistant | undefined, key: WasteText): string {
  return (language(hass).startsWith('de') ? T.de : T.en)[key];
}

/** "Heute", "Morgen", "in 3 Tagen". */
export function relativeDay(hass: HomeAssistant | undefined, days: number): string {
  if (days <= 0) return wt(hass, 'today');
  if (days === 1) return wt(hass, 'tomorrow');
  return wt(hass, 'in_days').replace('{n}', String(days));
}

/** "Mi, 11. Nov" (de) / "Wed, Nov 11" (en). */
export function shortDate(hass: HomeAssistant | undefined, date: Date): string {
  const lang = language(hass);
  const wd = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date).replace(/\.$/, '');
  const dm = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
    .format(date)
    .replace(/\.$/, '');
  return `${wd}, ${dm}`;
}

/** "Do, 12." (de) / "Thu 12" (en): weekday and day for the small boxes. */
export function dayLabel(hass: HomeAssistant | undefined, date: Date): string {
  const lang = language(hass);
  const wd = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date).replace(/\.$/, '');
  return lang.startsWith('de') ? `${wd}, ${date.getDate()}.` : `${wd} ${date.getDate()}`;
}

/** "Mittwoch, 11. November" for the popup list. */
export function longDate(hass: HomeAssistant | undefined, date: Date): string {
  return new Intl.DateTimeFormat(language(hass), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** Bin names of one day: "Biotonne & Papier". */
export function joinNames(hass: HomeAssistant | undefined, list: Pickup[]): string {
  return list.map((p) => p.name).join(` ${wt(hass, 'and')} `);
}

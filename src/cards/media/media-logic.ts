import type { Rgb } from '../../core/color';
import type { HassEntity, HomeAssistant } from '../../types/hass';
import { language } from '../../core/localize';

/** `supported_features` bits of media_player (MediaPlayerEntityFeature). */
export const F = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  SELECT_SOURCE: 2048,
  STOP: 4096,
  PLAY: 16384,
  SHUFFLE_SET: 32768,
  REPEAT_SET: 262144,
  GROUPING: 524288,
} as const;

export function supports(st: HassEntity | undefined, feature: number): boolean {
  const f = Number(st?.attributes.supported_features ?? 0);
  return (f & feature) !== 0;
}

const OFF = new Set(['off', 'standby', 'unavailable', 'unknown']);

/** Off, standby or unavailable: nothing to show but the name. */
export function isOff(st: HassEntity | undefined): boolean {
  return !st || OFF.has(st.state);
}

export function isPlaying(st: HassEntity | undefined): boolean {
  return st?.state === 'playing' || st?.state === 'buffering';
}

/** Glows: something plays, or a TV/app is on. Paused and idle stay calm. */
export function isLit(st: HassEntity | undefined): boolean {
  return isPlaying(st) || st?.state === 'on';
}

export function isTv(st: HassEntity | undefined): boolean {
  const dc = st?.attributes.device_class;
  return dc === 'tv' || st?.attributes.media_content_type === 'tvshow' || dc === 'receiver';
}

export function playerIcon(st: HassEntity | undefined): string {
  const own = st?.attributes.icon;
  if (typeof own === 'string') return own;
  const dc = st?.attributes.device_class;
  if (dc === 'tv') return 'mdi:television';
  if (dc === 'receiver') return 'mdi:audio-video';
  return 'mdi:speaker';
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** What plays now: title and the line below it (artist, series, app or source). */
export function nowPlaying(st: HassEntity | undefined): { title: string; artist: string } {
  if (!st) return { title: '', artist: '' };
  const a = st.attributes;
  const title = str(a.media_title);
  const series = str(a.media_series_title);
  const episode =
    typeof a.media_season === 'number' || typeof a.media_episode === 'number'
      ? [a.media_season && `S${a.media_season}`, a.media_episode && `E${a.media_episode}`]
          .filter(Boolean)
          .join(' ')
      : '';
  const artist =
    str(a.media_artist) ||
    str(a.media_album_artist) ||
    [series, episode].filter(Boolean).join(' · ') ||
    str(a.media_channel);
  const app = str(a.app_name) || str(a.source);
  if (title) return { title, artist: artist || (app !== title ? app : '') };
  return { title: app, artist: '' };
}

export function album(st: HassEntity | undefined): string {
  return str(st?.attributes.media_album_name);
}

/** Cover URL, or '' when the player has none. */
export function coverUrl(st: HassEntity | undefined): string {
  if (isOff(st)) return '';
  return str(st?.attributes.entity_picture_local) || str(st?.attributes.entity_picture);
}

/** Current position in seconds, counted on from the last update while playing. */
export function position(st: HassEntity | undefined, now = Date.now()): number | undefined {
  const a = st?.attributes;
  const pos = Number(a?.media_position);
  if (!a || !Number.isFinite(pos)) return undefined;
  let p = pos;
  if (st?.state === 'playing' && typeof a.media_position_updated_at === 'string') {
    const at = Date.parse(a.media_position_updated_at);
    if (Number.isFinite(at)) p += Math.max(0, (now - at) / 1000);
  }
  const dur = duration(st);
  return dur ? Math.min(p, dur) : p;
}

export function duration(st: HassEntity | undefined): number | undefined {
  const d = Number(st?.attributes.media_duration);
  return Number.isFinite(d) && d > 0 ? d : undefined;
}

/** 0–100 for the progress bar, undefined for live streams and TVs without a position. */
export function progress(st: HassEntity | undefined, now = Date.now()): number | undefined {
  const d = duration(st);
  const p = position(st, now);
  if (!d || p === undefined) return undefined;
  return Math.max(0, Math.min(100, (p / d) * 100));
}

/** 83 → "1:23", 3723 → "1:02:03". */
export function clock(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Volume 0–100, or undefined when the player reports none. */
export function volumePct(st: HassEntity | undefined): number | undefined {
  const v = Number(st?.attributes.volume_level);
  return Number.isFinite(v) && st?.attributes.volume_level !== undefined
    ? Math.round(v * 100)
    : undefined;
}

export function groupMembers(st: HassEntity | undefined): string[] {
  const g = st?.attributes.group_members;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string') : [];
}

/** Other players of the same integration that can join this one's group. */
export function groupCandidates(hass: HomeAssistant | undefined, id: string): string[] {
  if (!hass) return [];
  const platform = (e: string) => hass.entities?.[e]?.platform;
  const own = platform(id);
  return Object.keys(hass.states)
    .filter((e) => e.startsWith('media_player.') && e !== id)
    .filter((e) => {
      const st = hass.states[e];
      if (!st || st.state === 'unavailable' || !supports(st, F.GROUPING)) return false;
      return !own || !platform(e) || platform(e) === own;
    })
    .sort();
}

const T = {
  de: {
    playing: 'Spielt',
    paused: 'Pausiert',
    idle: 'Bereit',
    on: 'An',
    off: 'Aus',
    standby: 'Standby',
    buffering: 'Lädt',
    unavailable: 'Nicht verfügbar',
    nothing: 'Nichts läuft',
    with: 'mit',
    group: 'Gruppe',
    volume: 'Lautstärke',
    source: 'Quelle',
    speakers: 'Lautsprecher',
    play: 'Abspielen',
    pause: 'Pause',
    previous: 'Zurück',
    next: 'Weiter',
    shuffle: 'Zufall',
    repeat: 'Wiederholen',
    mute: 'Stumm',
    media: 'Medien',
    active: 'aktiv',
  },
  en: {
    playing: 'Playing',
    paused: 'Paused',
    idle: 'Idle',
    on: 'On',
    off: 'Off',
    standby: 'Standby',
    buffering: 'Buffering',
    unavailable: 'Unavailable',
    nothing: 'Nothing playing',
    with: 'with',
    group: 'Group',
    volume: 'Volume',
    source: 'Source',
    speakers: 'Speakers',
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous',
    next: 'Next',
    shuffle: 'Shuffle',
    repeat: 'Repeat',
    mute: 'Mute',
    media: 'Media',
    active: 'active',
  },
};

export type MediaKey = keyof (typeof T)['de'];

export function mt(hass: HomeAssistant | undefined, key: MediaKey): string {
  return (language(hass).startsWith('de') ? T.de : T.en)[key];
}

/** "Spielt", "Pausiert", "Aus" … */
export function stateWord(hass: HomeAssistant | undefined, st: HassEntity | undefined): string {
  const s = st?.state ?? 'unavailable';
  return s in T.de ? mt(hass, s as MediaKey) : (hass?.formatEntityState?.(st!) ?? s);
}

// ---------- accent from the cover ----------

/**
 * The cover's most vivid colour from raw RGBA pixels: vivid, mid-bright pixels count most,
 * near grey/black/white ones hardly. Returns undefined for a grey cover. The result is
 * lifted a little if it is very dark, so the glow stays visible.
 */
export function pickAccent(data: ArrayLike<number>): Rgb | undefined {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    if (data[i + 3] < 128) continue;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 510;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    const weight = sat * sat * (1 - Math.abs(l - 0.5) * 1.6);
    if (weight <= 0.02) continue;
    r += R * weight;
    g += G * weight;
    b += B * weight;
    w += weight;
  }
  if (w < 0.5) return undefined;
  let c: Rgb = [r / w, g / w, b / w];
  const max = Math.max(...c);
  if (max < 150) c = c.map((v) => (v * 150) / max) as Rgb;
  return c.map((v) => Math.round(Math.min(255, v))) as Rgb;
}

const cache = new Map<string, Promise<Rgb | undefined>>();

/** Loads the cover (same origin through HA's proxy) and picks its accent; cached per URL. */
export function coverAccent(url: string): Promise<Rgb | undefined> {
  if (!url) return Promise.resolve(undefined);
  let p = cache.get(url);
  if (!p) {
    p = new Promise<Rgb | undefined>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(undefined);
          ctx.drawImage(img, 0, 0, 24, 24);
          resolve(pickAccent(ctx.getImageData(0, 0, 24, 24).data));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = url;
    });
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
    cache.set(url, p);
  }
  return p;
}

/** Joined names of a group, e.g. "Küche + Bad". */
export function groupLabel(hass: HomeAssistant | undefined, ids: string[]): string {
  return ids.map((id) => shortName(hass, id)).join(' + ');
}

export function shortName(hass: HomeAssistant | undefined, id: string): string {
  return str(hass?.states[id]?.attributes.friendly_name) || id.split('.')[1];
}

/** Service helper used by all media controls. */
export function call(
  hass: HomeAssistant | undefined,
  service: string,
  entity: string,
  data: Record<string, unknown> = {},
): void {
  void hass?.callService('media_player', service, { entity_id: entity, ...data });
}

/** Tap on a card or row: switch on when off, else play/pause (or off for plain TVs). */
export function tapAction(hass: HomeAssistant | undefined, st: HassEntity | undefined): void {
  if (!st || st.state === 'unavailable') return;
  const id = st.entity_id;
  if (isOff(st)) {
    if (supports(st, F.TURN_ON)) call(hass, 'turn_on', id);
    return;
  }
  if (supports(st, F.PAUSE) || supports(st, F.PLAY)) call(hass, 'media_play_pause', id);
  else if (supports(st, F.TURN_OFF)) call(hass, 'turn_off', id);
}

/** Popup orb: on/off. */
export function powerAction(hass: HomeAssistant | undefined, st: HassEntity | undefined): void {
  if (!st || st.state === 'unavailable') return;
  const id = st.entity_id;
  if (isOff(st)) {
    if (supports(st, F.TURN_ON)) call(hass, 'turn_on', id);
  } else if (supports(st, F.TURN_OFF)) call(hass, 'turn_off', id);
  else if (supports(st, F.PAUSE)) call(hass, 'media_pause', id);
}

/** Remembers each cover's accent and re-renders the card once a new cover was read. */
export class CoverAccents {
  private known = new Map<string, Rgb | null>();

  constructor(private readonly onLoad: () => void) {}

  /** Accent of the player's cover; undefined until it is read or when it has none. */
  get(st: HassEntity | undefined): Rgb | undefined {
    const url = coverUrl(st);
    if (!url) return undefined;
    if (!this.known.has(url)) {
      this.known.set(url, null);
      void coverAccent(url).then((rgb) => {
        this.known.set(url, rgb ?? null);
        if (rgb) this.onLoad();
      });
    }
    return this.known.get(url) ?? undefined;
  }
}

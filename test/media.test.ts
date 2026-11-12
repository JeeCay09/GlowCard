import { describe, expect, it, vi } from 'vitest';
import {
  F,
  clock,
  groupCandidates,
  isLit,
  isOff,
  nowPlaying,
  pickAccent,
  position,
  powerAction,
  progress,
  stateWord,
  tapAction,
  volumePct,
} from '../src/cards/media/media-logic';
import { GlowMediaCard } from '../src/cards/media/media-card';
import { GlowMediaRoomsCard } from '../src/cards/media/media-rooms-card';
import type { HassEntity, HomeAssistant } from '../src/types/hass';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '2026-11-12T20:00:00Z',
  last_updated: '2026-11-12T20:00:00Z',
});

const ALL = F.PAUSE | F.PLAY | F.TURN_ON | F.TURN_OFF | F.VOLUME_SET | F.GROUPING;
const de = { language: 'de' } as HomeAssistant;

const hassWith = (states: HassEntity[], extra: Partial<HomeAssistant> = {}) => {
  const callService = vi.fn(async () => undefined);
  const hass = {
    language: 'de',
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    callService,
    ...extra,
  } as unknown as HomeAssistant;
  return { hass, callService };
};

describe('what plays', () => {
  it('shows title and artist, else series, else app', () => {
    expect(
      nowPlaying(e('media_player.a', 'playing', { media_title: 'Song', media_artist: 'Band' })),
    ).toEqual({ title: 'Song', artist: 'Band' });
    expect(
      nowPlaying(
        e('media_player.a', 'playing', {
          media_title: 'Pilot',
          media_series_title: 'Show',
          media_season: 1,
          media_episode: 2,
        }),
      ),
    ).toEqual({ title: 'Pilot', artist: 'Show · S1 E2' });
    expect(nowPlaying(e('media_player.tv', 'on', { app_name: 'Netflix' }))).toEqual({
      title: 'Netflix',
      artist: '',
    });
  });

  it('glows while playing or on, not when paused or off', () => {
    expect(isLit(e('media_player.a', 'playing'))).toBe(true);
    expect(isLit(e('media_player.tv', 'on'))).toBe(true);
    expect(isLit(e('media_player.a', 'paused'))).toBe(false);
    expect(isOff(e('media_player.a', 'standby'))).toBe(true);
    expect(isOff(undefined)).toBe(true);
  });

  it('translates the state', () => {
    expect(stateWord(de, e('media_player.a', 'paused'))).toBe('Pausiert');
    expect(stateWord({ language: 'en' } as HomeAssistant, e('media_player.a', 'off'))).toBe('Off');
  });
});

describe('progress', () => {
  const st = e('media_player.a', 'playing', {
    media_position: 60,
    media_duration: 240,
    media_position_updated_at: '2026-11-12T20:00:00Z',
  });
  const at = Date.parse('2026-11-12T20:00:30Z');

  it('counts on from the last update while playing', () => {
    expect(position(st, at)).toBe(90);
    expect(progress(st, at)).toBe(37.5);
    expect(position({ ...st, state: 'paused' }, at)).toBe(60);
  });

  it('never runs past the end and has no bar without a duration', () => {
    expect(position(st, at + 3_600_000)).toBe(240);
    expect(progress(e('media_player.tv', 'on', { media_position: 5 }))).toBeUndefined();
  });

  it('formats times', () => {
    expect(clock(83)).toBe('1:23');
    expect(clock(3723)).toBe('1:02:03');
    expect(clock(undefined)).toBe('');
  });

  it('reads the volume', () => {
    expect(volumePct(e('media_player.a', 'playing', { volume_level: 0.424 }))).toBe(42);
    expect(volumePct(e('media_player.a', 'playing'))).toBeUndefined();
  });
});

describe('tap and power', () => {
  it('tap switches on when off, else play/pause', () => {
    const off = e('media_player.a', 'off', { supported_features: ALL });
    const play = e('media_player.b', 'playing', { supported_features: ALL });
    const { hass, callService } = hassWith([off, play]);
    tapAction(hass, off);
    tapAction(hass, play);
    expect(callService).toHaveBeenNthCalledWith(1, 'media_player', 'turn_on', {
      entity_id: 'media_player.a',
    });
    expect(callService).toHaveBeenNthCalledWith(2, 'media_player', 'media_play_pause', {
      entity_id: 'media_player.b',
    });
  });

  it('tap on a TV without play/pause switches it off; the popup orb switches power', () => {
    const tv = e('media_player.tv', 'on', { supported_features: F.TURN_ON | F.TURN_OFF });
    const { hass, callService } = hassWith([tv]);
    tapAction(hass, tv);
    powerAction(hass, { ...tv, state: 'off' });
    expect(callService.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['turn_off', 'turn_on']);
  });

  it('does nothing for unavailable players', () => {
    const na = e('media_player.a', 'unavailable', { supported_features: ALL });
    const { hass, callService } = hassWith([na]);
    tapAction(hass, na);
    powerAction(hass, na);
    expect(callService).not.toHaveBeenCalled();
  });
});

describe('grouping', () => {
  it('offers players of the same integration that support grouping', () => {
    const g = { supported_features: F.GROUPING };
    const { hass } = hassWith(
      [
        e('media_player.kitchen', 'playing', g),
        e('media_player.bath', 'idle', g),
        e('media_player.other', 'idle', g),
        e('media_player.tv', 'on', { supported_features: F.TURN_ON }),
        e('media_player.gone', 'unavailable', g),
      ],
      {
        entities: {
          'media_player.kitchen': { entity_id: 'media_player.kitchen', platform: 'sonos' },
          'media_player.bath': { entity_id: 'media_player.bath', platform: 'sonos' },
          'media_player.other': { entity_id: 'media_player.other', platform: 'cast' },
        },
      },
    );
    expect(groupCandidates(hass, 'media_player.kitchen')).toEqual(['media_player.bath']);
  });
});

describe('cover colour', () => {
  const px = (rgb: number[], n: number) => Array.from({ length: n }, () => [...rgb, 255]).flat();

  it('picks the vivid colour, not the grey or black around it', () => {
    const data = [...px([20, 20, 20], 60), ...px([128, 128, 128], 30), ...px([230, 80, 60], 10)];
    const c = pickAccent(data)!;
    expect(c[0]).toBeGreaterThan(200);
    expect(c[1]).toBeLessThan(110);
  });

  it('gives up on grey covers and lifts dark ones', () => {
    expect(pickAccent(px([120, 120, 120], 50))).toBeUndefined();
    const dark = pickAccent(px([60, 10, 90], 50))!;
    expect(Math.max(...dark)).toBeGreaterThanOrEqual(149);
  });
});

describe('grid sizes', () => {
  it('media card: half width, 3 rows (2 compact), wider = wide layout', () => {
    const card = new GlowMediaCard();
    card.setConfig({ type: 'custom:glowcard-media', entity: 'media_player.a', size: 'normal' });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      rows: 3,
      min_columns: 6,
      min_rows: 3,
      max_rows: 3,
    });
    card.setConfig({ type: 'custom:glowcard-media', entity: 'media_player.a', size: 'compact' });
    expect(card.getGridOptions().rows).toBe(2);
  });

  it('rooms card: a heading row plus one row per player', () => {
    const card = new GlowMediaRoomsCard();
    card.setConfig({
      type: 'custom:glowcard-media-rooms',
      entities: ['media_player.a', { entity: 'media_player.b', name: 'Bad' }, 'nonsense'],
    });
    expect(card.getGridOptions()).toMatchObject({ columns: 12, rows: 3, min_columns: 6 });
    expect(() =>
      card.setConfig({ type: 'custom:glowcard-media-rooms', entities: 'x' } as never),
    ).toThrow();
  });
});

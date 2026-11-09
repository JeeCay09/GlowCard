import { describe, expect, it } from 'vitest';
import {
  buttonColor,
  configColor,
  currentIndex,
  dotActive,
  dotColor,
  tapActionOf,
  targetOf,
} from '../src/cards/nav/nav-logic';
import type { HassEntity } from '../src/types/hass';

const e = (id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_changed: '2026-11-09T08:00:00',
  last_updated: '2026-11-09T08:00:00',
});

const buttons = [
  { icon: 'mdi:home-outline', navigation_path: '/zuhause-handy/start' },
  { icon: 'mdi:floor-plan', navigation_path: '/zuhause-handy/raeume-eg/' },
  { icon: 'mdi:sofa-outline', navigation_path: '#wohnzimmer' },
  { icon: 'mdi:robot-vacuum', tap_action: { action: 'more-info' as const } },
  { icon: 'mdi:lightning-bolt-outline', navigation_path: 'energie' },
];

describe('nav actions', () => {
  it('turns navigation_path into a navigate action; tap_action wins', () => {
    expect(tapActionOf(buttons[0])).toEqual({
      action: 'navigate',
      navigation_path: '/zuhause-handy/start',
    });
    expect(tapActionOf(buttons[3])).toEqual({ action: 'more-info' });
    expect(tapActionOf({ icon: 'mdi:x' })).toEqual({ action: 'none' });
    expect(
      tapActionOf({
        navigation_path: '/a',
        tap_action: { action: 'navigate', navigation_path: '/b' },
      }),
    ).toEqual({ action: 'navigate', navigation_path: '/b' });
  });

  it('knows the target of navigate buttons only', () => {
    expect(targetOf(buttons[2])).toBe('#wohnzimmer');
    expect(targetOf(buttons[3])).toBeUndefined();
  });
});

describe('current button', () => {
  it('matches the view path, ignoring a trailing slash', () => {
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/start', hash: '' })).toBe(0);
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/raeume-eg', hash: '' })).toBe(1);
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/start/', hash: '' })).toBe(0);
  });

  it('prefers an open popup hash', () => {
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/start', hash: '#wohnzimmer' })).toBe(
      2,
    );
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/start', hash: '#other' })).toBe(0);
  });

  it('matches relative paths against the last part of the path', () => {
    expect(currentIndex(buttons, { pathname: '/zuhause-handy/energie', hash: '' })).toBe(4);
  });

  it('returns -1 when nothing matches', () => {
    expect(currentIndex(buttons, { pathname: '/lovelace/0', hash: '' })).toBe(-1);
    expect(currentIndex([], { pathname: '/', hash: '' })).toBe(-1);
  });
});

describe('status dot', () => {
  it('shows for on, cleaning, playing …', () => {
    expect(dotActive(e('vacuum.vesta', 'cleaning'))).toBe(true);
    expect(dotActive(e('light.kueche', 'on'))).toBe(true);
    expect(dotActive(e('light.kueche', 'off'))).toBe(false);
    expect(dotActive(e('light.kueche', 'unavailable'))).toBe(false);
    expect(dotActive(undefined)).toBe(false);
  });

  it('uses the light colour for lights, else the button colour', () => {
    const fallback: [number, number, number] = [1, 2, 3];
    expect(dotColor(e('light.a', 'on', { rgb_color: [255, 100, 50] }), fallback, false)).toEqual([
      255, 100, 50,
    ]);
    expect(dotColor(e('light.a', 'on'), fallback, false)).toEqual([255, 200, 114]);
    expect(dotColor(e('vacuum.vesta', 'cleaning'), fallback, false)).toBe(fallback);
  });
});

describe('colours', () => {
  it('reads accent names, hex and rgb lists', () => {
    expect(configColor('green', false)).toEqual([16, 185, 129]);
    expect(configColor('#ff0000', false)).toEqual([255, 0, 0]);
    expect(configColor([1, 2, 3], false)).toEqual([1, 2, 3]);
    expect(configColor('nonsense', false)).toBeNull();
    expect(configColor(undefined, false)).toBeNull();
  });

  it('button colour beats card colour beats indigo', () => {
    expect(buttonColor({ color: 'green' }, 'blue', false)).toEqual([16, 185, 129]);
    expect(buttonColor({}, 'blue', false)).toEqual([59, 130, 246]);
    expect(buttonColor({}, undefined, false)).toEqual([99, 102, 241]);
  });
});

describe('glowcard-nav card', () => {
  it('renders one button per entry and marks the current one', async () => {
    await import('../src/cards/nav/nav-card');
    history.replaceState(null, '', '/dash/start#kitchen');
    const el = document.createElement('glowcard-nav');
    el.setConfig({
      type: 'custom:glowcard-nav',
      buttons: [
        { icon: 'mdi:home-outline', name: 'Start', navigation_path: '/dash/start' },
        { icon: 'mdi:countertop-outline', name: 'Küche', navigation_path: '#kitchen' },
      ],
    });
    el.hass = {
      states: {},
      language: 'de',
      callService: async () => undefined,
    } as unknown as typeof el.hass;
    document.body.appendChild(el);
    await el.updateComplete;
    const buttons = el.shadowRoot!.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1].getAttribute('aria-current')).toBe('page');
    expect(buttons[0].getAttribute('aria-current')).toBe('false');
    el.remove();
  });

  it('rejects a bad position', async () => {
    await import('../src/cards/nav/nav-card');
    const el = document.createElement('glowcard-nav');
    expect(() =>
      el.setConfig({ type: 'custom:glowcard-nav', position: 'top' as 'card' }),
    ).toThrow();
  });
});

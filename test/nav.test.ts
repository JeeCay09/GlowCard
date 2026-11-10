import { describe, expect, it } from 'vitest';
import {
  buttonColor,
  configColor,
  currentIndex,
  dotActive,
  dotColor,
  glideStart,
  navSignature,
  nextHandoff,
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

  it('marks the dashboard button on its first view (/dash/0)', () => {
    const nav = [
      { navigation_path: '/glowcard-test' },
      { navigation_path: '/glowcard-test/wohnzimmerglowcard' },
      { navigation_path: '/energy' },
    ];
    expect(currentIndex(nav, { pathname: '/glowcard-test/0', hash: '' })).toBe(0);
    expect(currentIndex(nav, { pathname: '/glowcard-test', hash: '' })).toBe(0);
    expect(currentIndex(nav, { pathname: '/glowcard-test/wohnzimmerglowcard', hash: '' })).toBe(1);
    expect(currentIndex(nav, { pathname: '/energy', hash: '' })).toBe(2);
    expect(currentIndex(nav, { pathname: '/glowcard-testx/0', hash: '' })).toBe(-1);
    const zero = [{ navigation_path: '/glowcard-test/0' }, { navigation_path: '/glowcard-test/x' }];
    expect(currentIndex(zero, { pathname: '/glowcard-test', hash: '' })).toBe(0);
    expect(currentIndex(zero, { pathname: '/glowcard-test/0', hash: '' })).toBe(0);
    expect(currentIndex(zero, { pathname: '/glowcard-test/x', hash: '' })).toBe(1);
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

  it('uses the light colour for lights, else the button colour, else green', () => {
    const fallback: [number, number, number] = [1, 2, 3];
    expect(dotColor(e('light.a', 'on', { rgb_color: [255, 100, 50] }), fallback, false)).toEqual([
      255, 100, 50,
    ]);
    expect(dotColor(e('light.a', 'on'), fallback, false)).toEqual([255, 200, 114]);
    expect(dotColor(e('vacuum.vesta', 'cleaning'), fallback, false)).toBe(fallback);
    expect(dotColor(e('vacuum.vesta', 'cleaning'), undefined, false)).toEqual([16, 185, 129]);
  });
});

describe('colours', () => {
  it('reads accent names, hex and rgb lists', () => {
    expect(configColor('green', false)).toEqual([16, 185, 129]);
    expect(configColor('#ff0000', false)).toEqual([255, 0, 0]);
    expect(configColor([1, 2, 3], false)).toEqual([1, 2, 3]);
    expect(configColor('Red', false)).toEqual([239, 68, 68]);
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

describe('marker across views', () => {
  const sig = navSignature(buttons);

  it('continues from the old button right after a tap', () => {
    let h = nextHandoff(undefined, sig, 0, 1000);
    expect(h).toEqual({ sig, prev: -1, index: 0, at: 1000 });
    h = nextHandoff(h, sig, 1, 5000);
    expect(h).toEqual({ sig, prev: 0, index: 1, at: 5000 });
    expect(nextHandoff(h, sig, 1, 6000)).toBe(h);
    expect(glideStart(h, sig, 1, 5300)).toBe(0);
    expect(glideStart(h, sig, 1, 9000)).toBe(-1);
  });

  it('starts where the old bar was if it missed the change', () => {
    const h = nextHandoff(undefined, sig, 0, 1000);
    expect(glideStart(h, sig, 4, 99999)).toBe(0);
  });

  it('treats copies with other targets or colours as the same bar', () => {
    const a = [
      { icon: 'm3o:house', navigation_path: '/glowcard-test/0', color: 'Red' },
      { icon: 'mdi:sofa-outline', navigation_path: '/glowcard-test/wohnzimmer' },
    ];
    const b = [
      { icon: 'm3o:house', navigation_path: '/glowcard-test' },
      { icon: 'mdi:sofa-outline', navigation_path: '/glowcard-test/wohnzimmer' },
    ];
    expect(navSignature(a)).toBe(navSignature(b));
    expect(navSignature(a)).not.toBe(navSignature([b[1], b[0]]));
  });

  it('only glides between the same bar', () => {
    const h = nextHandoff(nextHandoff(undefined, sig, 0, 0), sig, 1, 10);
    const other = navSignature(buttons.slice(0, 3));
    expect(glideStart(h, other, 1, 20)).toBe(-1);
    expect(nextHandoff(h, other, 2, 30).prev).toBe(-1);
    expect(glideStart(undefined, sig, 1, 20)).toBe(-1);
    expect(glideStart(h, sig, -1, 20)).toBe(-1);
  });
});

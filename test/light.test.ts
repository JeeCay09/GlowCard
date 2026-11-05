import { describe, expect, it, vi } from 'vitest';
import {
  SWATCHES,
  brightnessPct,
  kelvinRange,
  lightCaps,
  matchSwatch,
  swatchServiceData,
  swatchesFor,
} from '../src/cards/light/light-logic';
import type { HassEntity } from '../src/types/hass';

const light = (state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
  entity_id: 'light.x',
  state,
  attributes,
  last_changed: '',
  last_updated: '',
});

describe('light logic', () => {
  it('reads what the light can do', () => {
    expect(lightCaps(light('on', { supported_color_modes: ['onoff'] }))).toEqual({
      brightness: false,
      colorTemp: false,
      color: false,
    });
    expect(lightCaps(light('on', { supported_color_modes: ['color_temp', 'hs'] }))).toEqual({
      brightness: true,
      colorTemp: true,
      color: true,
    });
    expect(lightCaps(light('on', { supported_color_modes: ['brightness'] })).brightness).toBe(true);
  });

  it('gives brightness in percent and 0 when off', () => {
    expect(brightnessPct(light('on', { brightness: 184 }))).toBe(72);
    expect(brightnessPct(light('on', { brightness: 1 }))).toBe(1);
    expect(brightnessPct(light('off', { brightness: 184 }))).toBe(0);
    expect(brightnessPct(light('on'))).toBe(100);
  });

  it('uses the light kelvin range with a fallback', () => {
    expect(
      kelvinRange(light('on', { min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6000 })),
    ).toEqual([2700, 6000]);
    expect(kelvinRange(light('on'))).toEqual([2000, 6500]);
  });

  it('shows only the swatches the light can do', () => {
    expect(swatchesFor({ brightness: true, colorTemp: true, color: true })).toHaveLength(7);
    expect(
      swatchesFor({ brightness: true, colorTemp: true, color: false }).map((s) => s.key),
    ).toEqual(['warm_white', 'neutral_white', 'cool_white']);
    expect(swatchesFor({ brightness: true, colorTemp: false, color: false })).toHaveLength(0);
  });

  it('finds the current swatch by colour or colour temperature', () => {
    expect(matchSwatch(light('on', { rgb_color: [255, 200, 114] }))?.key).toBe('warm_white');
    expect(matchSwatch(light('on', { rgb_color: [140, 92, 245] }))?.key).toBe('violet');
    expect(matchSwatch(light('on', { rgb_color: [10, 200, 10] }))).toBeUndefined();
    expect(
      matchSwatch(light('on', { color_mode: 'color_temp', color_temp_kelvin: 4100 }))?.key,
    ).toBe('neutral_white');
    expect(matchSwatch(light('off', { rgb_color: [255, 200, 114] }))).toBeUndefined();
  });

  it('sets whites as colour temperature where possible', () => {
    const warm = SWATCHES[0];
    expect(swatchServiceData(warm, { brightness: true, colorTemp: true, color: true })).toEqual({
      color_temp_kelvin: 2700,
    });
    expect(swatchServiceData(warm, { brightness: true, colorTemp: false, color: true })).toEqual({
      rgb_color: [255, 200, 114],
    });
    expect(
      swatchServiceData(SWATCHES[6], { brightness: true, colorTemp: true, color: true }),
    ).toEqual({
      rgb_color: [59, 130, 246],
    });
  });
});

describe('light card bar', () => {
  it('shows the dragged value live and keeps it until the light reports back', async () => {
    await import('../src/glowcard');
    const states = {
      'light.x': light('on', { brightness: 184, supported_color_modes: ['brightness'] }),
    };
    const calls: unknown[] = [];
    const hass = {
      states,
      language: 'de',
      locale: { language: 'de' },
      themes: { darkMode: true },
      callService: async (...args: unknown[]) => void calls.push(args),
    };
    const el = document.createElement('glowcard-light') as HTMLElement & {
      setConfig(c: unknown): void;
      hass: unknown;
      updateComplete: Promise<boolean>;
    };
    el.setConfig({ type: 'custom:glowcard-light', entity: 'light.x' });
    el.hass = hass;
    document.body.appendChild(el);
    await el.updateComplete;
    const value = () => el.shadowRoot!.querySelector('.value')!.textContent;
    const slider = el.shadowRoot!.querySelector('glowcard-slider')!;
    expect(value()).toBe('72%');

    slider.dispatchEvent(new CustomEvent('value-changing', { detail: { value: 40 } }));
    await el.updateComplete;
    expect(value()).toBe('40%');

    slider.dispatchEvent(new CustomEvent('value-changed', { detail: { value: 40 } }));
    await el.updateComplete;
    expect(value()).toBe('40%');
    expect(calls).toHaveLength(1);

    el.hass = {
      ...hass,
      states: {
        'light.x': light('on', { brightness: 102, supported_color_modes: ['brightness'] }),
      },
    };
    await el.updateComplete;
    expect(value()).toBe('40%');
    el.remove();
  });

  it('shows only the brightness top right, never on/off', async () => {
    await import('../src/glowcard');
    const make = async (state: HassEntity) => {
      const el = document.createElement('glowcard-light') as HTMLElement & {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<boolean>;
      };
      el.setConfig({ type: 'custom:glowcard-light', entity: 'light.x' });
      el.hass = {
        states: { 'light.x': state },
        language: 'de',
        locale: { language: 'de' },
        themes: { darkMode: true },
        callService: async () => undefined,
      };
      document.body.appendChild(el);
      await el.updateComplete;
      return { el, value: el.shadowRoot!.querySelector('.value')!.textContent };
    };

    const off = await make(light('off', { supported_color_modes: ['brightness'] }));
    expect(off.value).toBe('');
    expect(off.el.shadowRoot!.querySelector('.sub')!.textContent).toBe('Aus');
    off.el.remove();

    const onoff = await make(light('on', { supported_color_modes: ['onoff'] }));
    expect(onoff.value).toBe('');
    expect(onoff.el.shadowRoot!.querySelector('glowcard-slider')).toBeNull();
    onoff.el.remove();
  });

  it('switches on tap anywhere on the card, orb included, and opens the popup on hold', async () => {
    vi.useFakeTimers();
    await import('../src/glowcard');
    const calls: unknown[] = [];
    const el = document.createElement('glowcard-light') as HTMLElement & {
      setConfig(c: unknown): void;
      hass: unknown;
      updateComplete: Promise<boolean>;
    };
    el.setConfig({ type: 'custom:glowcard-light', entity: 'light.x' });
    el.hass = {
      states: {
        'light.x': light('on', { brightness: 100, supported_color_modes: ['brightness'] }),
      },
      language: 'de',
      locale: { language: 'de' },
      themes: { darkMode: true },
      callService: async (...args: unknown[]) => void calls.push(args),
    };
    document.body.appendChild(el);
    await el.updateComplete;
    const press = async (target: Element, ms: number) => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, bubbles: true, composed: true }),
      );
      vi.advanceTimersByTime(ms);
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      await Promise.resolve();
    };
    const toggle = ['homeassistant', 'toggle', { entity_id: 'light.x' }];
    await press(el.shadowRoot!.querySelector('.name')!, 50);
    expect(calls).toEqual([toggle]);
    await press(el.shadowRoot!.querySelector('glowcard-orb')!, 50);
    expect(calls).toEqual([toggle, toggle]);
    await press(el.shadowRoot!.querySelector('.name')!, 600);
    expect(calls).toHaveLength(2);
    expect(document.body.querySelector('glowcard-popup')).not.toBeNull();
    document.body.querySelector('glowcard-popup')!.remove();
    el.remove();
    vi.useRealTimers();
  });

  it('shows "choose an entity" on a new card without entity', async () => {
    await import('../src/glowcard');
    const cases = ['glowcard-light', 'glowcard-switch', 'glowcard-plug'].flatMap((type) => [
      [type, {}],
      [type, { entity: '' }],
    ]) as [string, Record<string, unknown>][];
    for (const [type, extra] of cases) {
      const el = document.createElement(type) as HTMLElement & {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<boolean>;
      };
      el.setConfig({ type: `custom:${type}`, ...extra });
      el.hass = { states: {}, language: 'de', locale: { language: 'de' }, themes: {} };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).toContain('Entität wählen');
      el.remove();
    }
  });
});

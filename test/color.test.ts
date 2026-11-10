import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  isBright,
  mix,
  hsToRgb,
  kelvinToRgb,
  lightColor,
  resolveAccent,
  rgbTriplet,
} from '../src/core/color';
import type { HassEntity } from '../src/types/hass';

const light = (state: string, attributes: HassEntity['attributes']): HassEntity => ({
  entity_id: 'light.x',
  state,
  attributes,
  last_changed: '',
  last_updated: '',
});

describe('color helpers', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#FBBF24')).toEqual([251, 191, 36]);
    expect(hexToRgb('fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('nope')).toBeNull();
  });

  it('formats an rgb triplet for CSS', () => {
    expect(rgbTriplet([1.4, 2.6, 3])).toBe('1,3,3');
  });

  it('converts hs_color to rgb', () => {
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0]);
    expect(hsToRgb(120, 0)).toEqual([255, 255, 255]);
  });

  it('gives warm white a warm tint', () => {
    const [r, , b] = kelvinToRgb(2700);
    expect(r).toBe(255);
    expect(b).toBeLessThan(200);
  });

  it('picks the accent for the theme and falls back', () => {
    expect(resolveAccent('teal', true, 'amber')).toEqual([45, 212, 191]);
    expect(resolveAccent('teal', false, 'amber')).toEqual([20, 184, 166]);
    expect(resolveAccent('#102030', true, 'amber')).toEqual([16, 32, 48]);
    expect(resolveAccent('unknown', true, 'amber')).toEqual([245, 165, 36]);
  });

  it('mixes colours and spots light ones like the mockup', () => {
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
    expect(isBright([255, 206, 166])).toBe(true); // neutral white (4000 K)
    expect(isBright([255, 254, 250])).toBe(true); // cool white
    expect(isBright([139, 92, 246])).toBe(false);
    // Saturated warm colours keep the white icon like the other cards (#139).
    expect(isBright([255, 200, 114])).toBe(false); // warm
    expect(isBright([255, 167, 87])).toBe(false); // 2700 K
    expect(isBright([245, 165, 36])).toBe(false); // amber
    expect(isBright([234, 179, 8])).toBe(false); // yellow
  });

  it('uses the current light colour only while the light is on', () => {
    expect(lightColor(light('on', { rgb_color: [255, 165, 110] }))).toEqual([255, 165, 110]);
    expect(lightColor(light('on', { hs_color: [0, 100] }))).toEqual([255, 0, 0]);
    expect(lightColor(light('off', { rgb_color: [255, 165, 110] }))).toBeNull();
    expect(lightColor(light('on', {}))).toBeNull();
  });
});

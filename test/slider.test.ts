import { describe, expect, it } from 'vitest';
import { fillPercent, valueFromPosition } from '../src/core/slider-math';

describe('slider math', () => {
  it('maps the pointer position to a stepped value', () => {
    expect(valueFromPosition(150, 100, 200, 0, 100, 1)).toBe(25);
    expect(valueFromPosition(99, 100, 200, 0, 100, 1)).toBe(0);
    expect(valueFromPosition(400, 100, 200, 0, 100, 1)).toBe(100);
    expect(valueFromPosition(163, 100, 200, 0, 100, 5)).toBe(30);
  });

  it('computes the fill width', () => {
    expect(fillPercent(62, 0, 100)).toBe(62);
    expect(fillPercent(150, 0, 100)).toBe(100);
    expect(fillPercent(5, 5, 5)).toBe(0);
  });
});

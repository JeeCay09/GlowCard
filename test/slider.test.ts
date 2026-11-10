import { describe, expect, it, vi } from 'vitest';
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

describe('slider gestures', () => {
  async function make(live = false) {
    await import('../src/components/slider');
    const el = document.createElement('glowcard-slider') as HTMLElement & {
      value: number;
      live: boolean;
      updateComplete: Promise<boolean>;
    };
    el.value = 40;
    el.live = live;
    document.body.appendChild(el);
    await el.updateComplete;
    const hit = el.shadowRoot!.querySelector<HTMLElement>('.hit')!;
    hit.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 36, right: 200, bottom: 36 }) as DOMRect;
    const events: string[] = [];
    for (const t of ['value-changing', 'value-changed', 'value-live']) {
      el.addEventListener(t, (e) => events.push(`${t}:${(e as CustomEvent).detail.value}`));
    }
    const fire = (type: string, x: number, y: number) =>
      hit.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
          composed: true,
        }),
      );
    return { el, fire, events };
  }

  it('lets a vertical swipe scroll the page without changing the value', async () => {
    const { el, fire, events } = await make();
    fire('pointerdown', 100, 10);
    fire('pointermove', 102, 40);
    fire('pointercancel', 102, 80);
    expect(events).toEqual([]);
    expect(el.value).toBe(40);
    el.remove();
  });

  it('starts a drag once the finger moves sideways', async () => {
    const { el, fire, events } = await make();
    fire('pointerdown', 100, 10);
    expect(events).toEqual([]);
    fire('pointermove', 120, 12);
    fire('pointermove', 160, 12);
    fire('pointerup', 160, 12);
    expect(events).toEqual(['value-changing:60', 'value-changing:80', 'value-changed:80']);
    el.remove();
  });

  it('sets the value on a plain tap', async () => {
    const { el, fire, events } = await make();
    fire('pointerdown', 50, 10);
    fire('pointerup', 50, 10);
    expect(events).toEqual(['value-changed:25']);
    el.remove();
  });

  it('sends live values while dragging, throttled', async () => {
    vi.useFakeTimers();
    const { el, fire, events } = await make(true);
    fire('pointerdown', 100, 10);
    fire('pointermove', 120, 10);
    fire('pointermove', 140, 10);
    fire('pointermove', 160, 10);
    expect(events.filter((e) => e.startsWith('value-live'))).toEqual(['value-live:60']);
    vi.advanceTimersByTime(300);
    expect(events.filter((e) => e.startsWith('value-live'))).toEqual([
      'value-live:60',
      'value-live:80',
    ]);
    fire('pointerup', 160, 10);
    vi.advanceTimersByTime(300);
    expect(events[events.length - 1]).toBe('value-changed:80');
    expect(events.filter((e) => e.startsWith('value-live'))).toHaveLength(2);
    vi.useRealTimers();
    el.remove();
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GESTURES,
  cleanConfig,
  configForm,
  editorLabel,
  fromFormData,
  gestureSchema,
  toFormData,
  type FormSchema,
  type GestureSpec,
} from '../src/core/editor';
import '../src/glowcard';

type FormCard = { getConfigForm(): ReturnType<typeof configForm> };
const card = (type: string) => customElements.get(type) as unknown as FormCard;

const names = (schema: FormSchema[]): string[] =>
  schema.flatMap((s) => (s.schema ? names(s.schema) : [s.name]));

describe('visual editor', () => {
  it('offers a form for every card', () => {
    expect(names(card('glowcard-light').getConfigForm().schema)).toEqual([
      'entity',
      'name',
      'icon',
      'color',
      'font',
      'size',
      'tap_action',
      'hold_action',
    ]);
    expect(names(card('glowcard-switch').getConfigForm().schema)).toContain('entities');
    expect(names(card('glowcard-plug').getConfigForm().schema)).toEqual(
      expect.arrayContaining(['threshold', 'power_entity', 'indicator_entity']),
    );
  });

  it('labels fields in German and English', () => {
    expect(editorLabel('variant', 'de')).toBe('Variante');
    expect(editorLabel('variant', 'en-GB')).toBe('Variant');
    const form = card('glowcard-plug').getConfigForm();
    expect(form.computeLabel({ name: 'threshold' })).toBeTruthy();
    expect(form.computeLabel({ name: 'unknown' })).toBeUndefined();
    expect(form.computeHelper({ name: 'power_entity' })).toBeTruthy();
  });

  it('keeps named group members in YAML', () => {
    const assert = card('glowcard-switch').getConfigForm().assertConfig!;
    expect(() => assert({ entities: ['switch.a', 'switch.b'] })).not.toThrow();
    expect(() => assert({ entities: [{ entity: 'switch.a', name: 'A' }] })).toThrow();
  });

  it('offers the card size on switch, plug, light and status bar', () => {
    for (const type of ['glowcard-switch', 'glowcard-plug', 'glowcard-light', 'glowcard-status']) {
      expect(names(card(type).getConfigForm().schema)).toContain('size');
    }
    expect(editorLabel('compact', 'de')).toBe('Kompakt');
  });

  it('offers tap and hold actions on switch, plug and light', () => {
    for (const type of ['glowcard-switch', 'glowcard-plug', 'glowcard-light']) {
      const form = card(type).getConfigForm();
      expect(names(form.schema)).toEqual(expect.arrayContaining(['tap_action', 'hold_action']));
    }
    expect(editorLabel('tap_mode', 'de')).toBe('Antippen');
  });

  it('shows translated section titles with icons', () => {
    const sections = (schema: FormSchema[]): FormSchema[] =>
      schema.flatMap((s) => (s.type === 'expandable' ? [s, ...sections(s.schema!)] : []));
    for (const type of [
      'glowcard-switch',
      'glowcard-plug',
      'glowcard-light',
      'glowcard-status',
      'glowcard-chip',
      'glowcard-heading',
    ]) {
      const form = card(type).getConfigForm();
      for (const s of sections(form.schema)) {
        expect(s.title).toBeTruthy();
        expect(s.title).not.toMatch(/_section$/);
        expect(s.icon).toMatch(/^mdi:/);
        expect(form.computeLabel(s)).toBe(s.title);
      }
    }
  });

  it('maps the gesture choices to tap_action and hold_action', () => {
    const spec = DEFAULT_GESTURES;
    // Defaults: tap = toggle, hold = GlowCard popup.
    expect(toFormData({ entity: 'light.a' }, spec)).toMatchObject({
      tap_mode: 'toggle',
      hold_mode: 'popup',
    });
    expect(
      toFormData(
        {
          tap_action: { action: 'popup' },
          hold_action: { action: 'navigate', navigation_path: '/x' },
        },
        spec,
      ),
    ).toMatchObject({ tap_mode: 'popup', hold_mode: 'other' });

    // Choosing the default removes the key, other simple choices are stored.
    expect(
      fromFormData({ entity: 'light.a', tap_mode: 'toggle', hold_mode: 'popup' }, spec),
    ).toEqual({ entity: 'light.a' });
    expect(
      fromFormData(
        { tap_mode: 'more-info', hold_mode: 'none', tap_action: { action: 'popup' } },
        spec,
      ),
    ).toEqual({ tap_action: { action: 'more-info' }, hold_action: { action: 'none' } });

    // "Other action" starts with navigation and keeps what HA's picker sets afterwards.
    expect(fromFormData({ tap_mode: 'other' }, spec)).toEqual({
      tap_action: { action: 'navigate', navigation_path: '' },
    });
    const url = { action: 'url', url_path: 'https://example.com' };
    expect(fromFormData({ tap_mode: 'other', tap_action: url }, spec)).toEqual({ tap_action: url });
  });

  it('shows the action picker only for "other action" and marks the default', () => {
    const form = card('glowcard-light').getConfigForm();
    const plain = gestureSchema(form.schema, DEFAULT_GESTURES, { tap_mode: 'toggle' }, 'de');
    expect(names(plain)).toEqual(expect.arrayContaining(['tap_mode', 'hold_mode']));
    expect(names(plain)).not.toContain('tap_action');
    const choice = JSON.stringify(plain);
    expect(choice).toContain('Ein/Aus (Standard)');
    expect(choice).toContain('GlowCard-Popup (Standard)');
    const other = gestureSchema(form.schema, DEFAULT_GESTURES, { tap_mode: 'other' }, 'de');
    expect(names(other)).toContain('tap_action');
    expect(names(other)).not.toContain('hold_action');
  });

  it('switch groups have no popup choice and do nothing on hold by default', () => {
    const spec = (
      customElements.get('glowcard-switch') as unknown as {
        gestureSpec(c: Record<string, unknown>): GestureSpec;
      }
    ).gestureSpec({ entities: ['switch.a', 'switch.b'] });
    expect(spec.modes.tap).not.toContain('popup');
    expect(spec.defaults).toEqual({ tap: 'toggle', hold: 'none' });
  });

  it('picks no entity for new cards, only the one chosen "by entity"', () => {
    type Stub = { getStubConfig(hass: unknown, entities?: string[]): Record<string, unknown> };
    const stub = (type: string, entities?: string[]) =>
      (customElements.get(type) as unknown as Stub).getStubConfig(
        { states: { 'light.led': {}, 'switch.plug': {}, 'person.a': {}, 'weather.home': {} } },
        entities,
      );
    expect(stub('glowcard-light')).toEqual({});
    expect(stub('glowcard-light', ['light.tv'])).toEqual({ entity: 'light.tv' });
    expect(stub('glowcard-light', ['switch.x'])).toEqual({});
    expect(stub('glowcard-switch')).toEqual({});
    expect(stub('glowcard-switch', ['input_boolean.x'])).toEqual({ entity: 'input_boolean.x' });
    expect(stub('glowcard-plug')).toEqual({});
    expect(stub('glowcard-header')).toEqual({});
    expect(stub('glowcard-status')).toEqual({ all_lights: true });
    expect(stub('glowcard-chip')).toEqual({ chip: 'lights' });
  });

  it('drops cleared fields so defaults apply again', () => {
    expect(cleanConfig({ type: 'x', entity: 'light.a', name: '', icon: undefined })).toEqual({
      type: 'x',
      entity: 'light.a',
    });
  });

  it('sizes cards by variant in the sections grid', () => {
    const grid = (type: string, config: Record<string, unknown>) => {
      const el = document.createElement(type) as HTMLElement & {
        setConfig(c: unknown): void;
        getGridOptions(): { columns: number };
      };
      el.setConfig({ type: `custom:${type}`, ...config });
      return el.getGridOptions().columns;
    };
    expect(grid('glowcard-switch', { entity: 'switch.a' })).toBe(3);
    expect(grid('glowcard-switch', { entity: 'switch.a', variant: 'wide' })).toBe(6);
    expect(grid('glowcard-plug', { entity: 'switch.a' })).toBe(3);
    expect(grid('glowcard-plug', { entity: 'switch.a', variant: 'wide' })).toBe(12);
    expect(grid('glowcard-light', { entity: 'light.a' })).toBe(6);
    // The former small light variant is shown as wide.
    expect(grid('glowcard-light', { entity: 'light.a', variant: 'small' })).toBe(6);
    expect(grid('glowcard-header', {})).toBe(12);
    expect(grid('glowcard-status', { weather: 'weather.home' })).toBe(12);
    expect(grid('glowcard-chip', { chip: 'lights' })).toBe(6);
    expect(grid('glowcard-chip', { chip: 'lights', icon_only: true })).toBe(3);
    expect(grid('glowcard-chip', { chips: [{ type: 'lights' }] })).toBe(12);
  });

  it('offers forms for header, status bar and chips', () => {
    expect(names(card('glowcard-header').getConfigForm().schema)).toEqual([
      'persons',
      'greeting_name',
      'font',
    ]);
    const status = card('glowcard-status').getConfigForm();
    expect(names(status.schema)).toEqual(
      expect.arrayContaining(['weather', 'all_lights', 'solar', 'security', 'alerts']),
    );
    for (const s of status.schema.flatMap((x) => (x.schema ? x.schema : [x]))) {
      if (s.name) expect(status.computeLabel(s)).toBeTruthy();
    }
    expect(() => status.assertConfig!({ segments: [] })).toThrow();
    const chip = card('glowcard-chip').getConfigForm();
    expect(names(chip.schema)).toEqual(expect.arrayContaining(['chip', 'entity', 'icon_only']));
    expect(() => chip.assertConfig!({ chips: [] })).toThrow();
  });
});

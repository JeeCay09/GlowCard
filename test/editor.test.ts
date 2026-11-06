import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GESTURES,
  cleanConfig,
  configForm,
  editorLabel,
  fromFormData,
  gestureSchema,
  schemaDefaults,
  toFormData,
  withDefaults,
  withoutDefaults,
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
    expect(names(card('glowcard-switch').getConfigForm().schema)).toEqual(
      expect.arrayContaining(['show_power', 'threshold', 'power_entity', 'indicator_entity']),
    );
  });

  it('labels fields in German and English', () => {
    expect(editorLabel('variant', 'de')).toBe('Layout');
    expect(editorLabel('variant', 'en-GB')).toBe('Layout');
    const form = card('glowcard-switch').getConfigForm();
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
    for (const type of ['glowcard-switch', 'glowcard-light', 'glowcard-status']) {
      expect(names(card(type).getConfigForm().schema)).toContain('size');
    }
    expect(editorLabel('compact', 'de')).toBe('Kompakt');
  });

  it('offers tap and hold actions on switch, plug and light', () => {
    for (const type of ['glowcard-switch', 'glowcard-light']) {
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
    ).toMatchObject({ tap_mode: 'popup', hold_mode: 'navigate', hold_path: '/x' });

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

    // Navigate and URL: the choice plus their own field.
    expect(fromFormData({ tap_mode: 'navigate', tap_path: '/lovelace/2' }, spec)).toEqual({
      tap_action: { action: 'navigate', navigation_path: '/lovelace/2' },
    });
    expect(fromFormData({ hold_mode: 'url', hold_url: 'https://example.com' }, spec)).toEqual({
      hold_action: { action: 'url', url_path: 'https://example.com' },
    });
    // Perform action: HA's picker edits the action; it is kept while the choice stays.
    const service = { action: 'perform-action', perform_action: 'light.turn_on', data: { x: 1 } };
    expect(fromFormData({ tap_mode: 'perform-action', tap_action: service }, spec)).toEqual({
      tap_action: service,
    });
    expect(fromFormData({ tap_mode: 'perform-action' }, spec)).toEqual({
      tap_action: { action: 'perform-action' },
    });
    // Extra keys of an existing action survive, e.g. toggle of another entity.
    const other = { action: 'toggle', entity: 'light.b' };
    expect(fromFormData({ tap_mode: 'toggle', tap_action: other }, spec)).toEqual({
      tap_action: other,
    });
    // Clearing the choice brings the default back.
    expect(fromFormData({ tap_action: { action: 'none' } }, spec)).toEqual({});
  });

  it('shows all actions in one list and only the fields they need', () => {
    const form = card('glowcard-light').getConfigForm();
    const plain = gestureSchema(form.schema, DEFAULT_GESTURES, { tap_mode: 'toggle' }, 'de');
    expect(names(plain)).toEqual(expect.arrayContaining(['tap_mode', 'hold_mode']));
    expect(names(plain)).not.toContain('tap_action');
    const choice = JSON.stringify(plain);
    expect(choice).toContain('Ein/Aus (Standard)');
    expect(choice).toContain('GlowCard-Popup (Standard)');
    expect(choice).toContain('Navigieren');
    expect(choice).toContain('Aktion ausführen');
    expect(choice).not.toContain('Andere Aktion');
    expect(names(gestureSchema(form.schema, DEFAULT_GESTURES, { tap_mode: 'navigate' }))).toContain(
      'tap_path',
    );
    expect(names(gestureSchema(form.schema, DEFAULT_GESTURES, { hold_mode: 'url' }))).toContain(
      'hold_url',
    );
    expect(
      names(gestureSchema(form.schema, DEFAULT_GESTURES, { tap_mode: 'perform-action' })),
    ).toContain('tap_action');
    expect(form.computeLabel({ name: 'tap_path' })).toBeTruthy();
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

  it('picks no entity for new cards but leaves an empty entity for "by entity"', () => {
    type Stub = { getStubConfig(hass: unknown, entities?: string[]): Record<string, unknown> };
    const unused = ['light.led', 'switch.plug', 'input_boolean.x', 'person.a'];
    const stub = (type: string) =>
      (customElements.get(type) as unknown as Stub).getStubConfig({ states: {} }, unused);
    // HA's create-card dialog: it fills in the chosen entity only if `entity` is in the stub.
    const byEntity = (type: string, chosen: string) => {
      const config: Record<string, unknown> = { type, ...stub(type) };
      if ('entity' in config) config.entity = chosen;
      return config;
    };
    expect(stub('glowcard-light')).toEqual({ entity: '' });
    expect(stub('glowcard-switch')).toEqual({ entity: '' });
    expect(byEntity('glowcard-light', 'light.tv').entity).toBe('light.tv');
    expect(byEntity('glowcard-switch', 'switch.pump').entity).toBe('switch.pump');
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
    // The former wide switch variant is shown as a small tile.
    expect(grid('glowcard-switch', { entity: 'switch.a', variant: 'wide' })).toBe(3);
    expect(grid('glowcard-switch', { entity: 'switch.a', variant: 'row' })).toBe(6);
    // Smart plugs: power card (full width) only with show_power; not for rows or groups.
    expect(grid('glowcard-switch', { entity: 'switch.a', show_power: true })).toBe(12);
    expect(grid('glowcard-switch', { entity: 'switch.a', show_power: true, variant: 'row' })).toBe(
      6,
    );
    expect(customElements.get('glowcard-plug')).toBeUndefined();
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

  it('shows defaults instead of empty fields and keeps them out of the YAML', () => {
    const defaults = (type: string) => schemaDefaults(card(type).getConfigForm().schema);
    expect(defaults('glowcard-light')).toEqual({ color: 'auto', font: 'glow', size: 'auto' });
    expect(defaults('glowcard-switch')).toMatchObject({ variant: 'small', font: 'glow' });
    expect(defaults('glowcard-switch')).toMatchObject({ show_power: false, threshold: 1 });
    expect(defaults('glowcard-heading')).toMatchObject({ heading_style: 'title', size: 'auto' });
    expect(defaults('glowcard-header')).toEqual({ font: 'glow' });
    expect(defaults('glowcard-status')).toEqual({ font: 'glow', size: 'auto' });
    expect(defaults('glowcard-chip')).toEqual({ color: 'auto', font: 'glow' });

    const d = defaults('glowcard-light');
    expect(withDefaults({ entity: 'light.a', font: 'theme' }, d)).toEqual({
      entity: 'light.a',
      font: 'theme',
      color: 'auto',
      size: 'auto',
    });
    expect(withoutDefaults({ type: 'x', font: 'glow', color: 'auto', size: 'compact' }, d)).toEqual(
      { type: 'x', size: 'compact' },
    );
  });
});

import { describe, expect, it } from 'vitest';
import { cleanConfig, configForm, editorLabel, type FormSchema } from '../src/core/editor';
import '../src/glowcard';

type FormCard = { getConfigForm(): ReturnType<typeof configForm> };
const card = (type: string) => customElements.get(type) as unknown as FormCard;

const names = (schema: FormSchema[]): string[] =>
  schema.flatMap((s) => (s.schema ? names(s.schema) : [s.name]));

describe('visual editor', () => {
  it('offers a form for every card', () => {
    expect(names(card('glowcard-light').getConfigForm().schema)).toEqual([
      'entity',
      'variant',
      'name',
      'icon',
      'color',
      'font',
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
    expect(grid('glowcard-light', { entity: 'light.a', variant: 'small' })).toBe(3);
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

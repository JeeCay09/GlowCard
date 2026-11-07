import { describe, expect, it } from 'vitest';
import { registerCard } from '../src/core/register';

class TestCard extends HTMLElement {}

describe('registerCard', () => {
  it('defines the element and adds it to the card picker once', () => {
    const info = { type: 'glowcard-test', name: 'Test', description: 'Test card' };
    registerCard(info, TestCard);
    registerCard(info, TestCard);

    expect(customElements.get('glowcard-test')).toBe(TestCard);
    expect(window.customCards?.filter((c) => c.type === 'glowcard-test')).toHaveLength(1);
  });

  it('rejects types without the glowcard- prefix', () => {
    expect(() => registerCard({ type: 'my-card', name: 'X', description: '' }, TestCard)).toThrow();
  });
});

describe('entity suggestions ("by entity" tab)', () => {
  it('suggests the card for its domains with the picked entity filled in', () => {
    registerCard(
      {
        type: 'glowcard-test-domains',
        name: 'T',
        description: '',
        domains: ['switch', 'input_boolean'],
      },
      class extends HTMLElement {},
    );
    const entry = window.customCards?.find((c) => c.type === 'glowcard-test-domains');
    expect(entry).not.toHaveProperty('domains');
    expect(entry?.getEntitySuggestion?.({}, 'switch.kaffee')).toEqual({
      config: { type: 'custom:glowcard-test-domains', entity: 'switch.kaffee' },
    });
    expect(entry?.getEntitySuggestion?.({}, 'input_boolean.urlaub')?.config.entity).toBe(
      'input_boolean.urlaub',
    );
    expect(entry?.getEntitySuggestion?.({}, 'light.flur')).toBeNull();
  });

  it('offers no suggestion for cards without domains', () => {
    expect(
      window.customCards?.find((c) => c.type === 'glowcard-test')?.getEntitySuggestion,
    ).toBeUndefined();
  });

  it('suggests GlowCard Switch and Light for their entities', async () => {
    await import('../src/cards/switch/switch-card');
    await import('../src/cards/light/light-card');
    const suggest = (type: string, id: string) =>
      window.customCards?.find((c) => c.type === type)?.getEntitySuggestion?.({}, id) ?? null;
    expect(suggest('glowcard-switch', 'switch.steckdose')?.config).toEqual({
      type: 'custom:glowcard-switch',
      entity: 'switch.steckdose',
    });
    expect(suggest('glowcard-switch', 'light.flur')).toBeNull();
    expect(suggest('glowcard-light', 'light.flur')?.config.entity).toBe('light.flur');
    expect(suggest('glowcard-light', 'switch.steckdose')).toBeNull();
  });
});

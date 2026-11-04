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

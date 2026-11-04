import { describe, expect, it, vi } from 'vitest';
import { handleAction } from '../src/core/action';
import type { HomeAssistant } from '../src/types/hass';

const setup = () => {
  const callService = vi.fn().mockResolvedValue(undefined);
  const hass = { states: {}, language: 'de', callService } as unknown as HomeAssistant;
  const element = document.createElement('div');
  return { hass, element, callService };
};

describe('handleAction', () => {
  it('toggles the card entity', async () => {
    const { hass, element, callService } = setup();
    await handleAction({ hass, element, entity: 'switch.a' }, { action: 'toggle' });
    expect(callService).toHaveBeenCalledWith('homeassistant', 'toggle', { entity_id: 'switch.a' });
  });

  it('fires hass-more-info', async () => {
    const { hass, element } = setup();
    const seen = vi.fn();
    element.addEventListener('hass-more-info', (e) => seen((e as CustomEvent).detail));
    await handleAction({ hass, element, entity: 'light.b' }, { action: 'more-info' });
    expect(seen).toHaveBeenCalledWith({ entityId: 'light.b' });
  });

  it('performs an action with data and target', async () => {
    const { hass, element, callService } = setup();
    await handleAction(
      { hass, element },
      {
        action: 'perform-action',
        perform_action: 'light.turn_on',
        data: { brightness_pct: 50 },
        target: { entity_id: 'light.c' },
      },
    );
    expect(callService).toHaveBeenCalledWith(
      'light',
      'turn_on',
      { brightness_pct: 50 },
      { entity_id: 'light.c' },
    );
  });

  it('opens the popup and ignores none', async () => {
    const { hass, element } = setup();
    const openPopup = vi.fn();
    expect(await handleAction({ hass, element, openPopup }, { action: 'popup' })).toBe(true);
    expect(openPopup).toHaveBeenCalled();
    expect(await handleAction({ hass, element }, { action: 'none' })).toBe(false);
  });
});

import type { HomeAssistant } from '../types/hass';
import { fireEvent } from './fire-event';

export type ActionConfig =
  | { action: 'none' }
  | { action: 'toggle'; entity?: string }
  | { action: 'more-info'; entity?: string }
  | { action: 'popup' }
  | { action: 'navigate'; navigation_path: string }
  | { action: 'url'; url_path: string }
  | {
      action: 'perform-action' | 'call-service';
      perform_action?: string;
      service?: string;
      data?: Record<string, unknown>;
      target?: Record<string, unknown>;
    };

export interface ActionContext {
  element: HTMLElement;
  hass: HomeAssistant;
  entity?: string;
  openPopup?: () => void;
}

/** Runs a Home Assistant style action. Returns false when nothing could be done. */
export async function handleAction(
  ctx: ActionContext,
  config: ActionConfig | undefined,
): Promise<boolean> {
  if (!config || config.action === 'none') return false;
  switch (config.action) {
    case 'toggle': {
      const entity = config.entity ?? ctx.entity;
      if (!entity) return false;
      await ctx.hass.callService('homeassistant', 'toggle', { entity_id: entity });
      return true;
    }
    case 'more-info': {
      const entityId = config.entity ?? ctx.entity;
      if (!entityId) return false;
      fireEvent(ctx.element, 'hass-more-info', { entityId });
      return true;
    }
    case 'popup':
      if (!ctx.openPopup) return false;
      ctx.openPopup();
      return true;
    case 'navigate':
      history.pushState(null, '', config.navigation_path);
      fireEvent(window, 'location-changed', { replace: false });
      return true;
    case 'url':
      window.open(config.url_path, '_blank', 'noopener');
      return true;
    case 'perform-action':
    case 'call-service': {
      const name = config.perform_action ?? config.service;
      const [domain, service] = name?.split('.', 2) ?? [];
      if (!domain || !service) return false;
      await ctx.hass.callService(domain, service, config.data, config.target);
      return true;
    }
  }
}

/** Minimal Home Assistant frontend types used by GlowCard. */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    icon?: string;
    unit_of_measurement?: string;
    brightness?: number;
    rgb_color?: [number, number, number];
    hs_color?: [number, number];
    color_temp_kelvin?: number;
  };
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  language: string;
  themes?: { darkMode?: boolean };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
}

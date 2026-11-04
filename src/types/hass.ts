/** Minimal Home Assistant frontend types used by GlowCard. */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    icon?: string;
    unit_of_measurement?: string;
    device_class?: string;
    brightness?: number;
    rgb_color?: [number, number, number];
    hs_color?: [number, number];
    color_temp_kelvin?: number;
    min_color_temp_kelvin?: number;
    max_color_temp_kelvin?: number;
    color_mode?: string;
    supported_color_modes?: string[];
    options?: string[];
    min?: number;
    max?: number;
    entity_picture?: string;
    temperature?: number;
    humidity?: number;
    /** Members of a group entity. */
    entity_id?: string[];
  };
  last_changed: string;
  last_updated: string;
}

/** Entity registry entry as the frontend exposes it in hass.entities. */
export interface HassEntityEntry {
  entity_id: string;
  name?: string | null;
  device_id?: string | null;
  area_id?: string | null;
  translation_key?: string;
  entity_category?: string | null;
  hidden?: boolean;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  entities?: Record<string, HassEntityEntry | undefined>;
  devices?: Record<
    string,
    { id: string; area_id?: string | null; name?: string | null } | undefined
  >;
  areas?: Record<string, { area_id: string; name: string } | undefined>;
  language: string;
  locale?: { language: string };
  themes?: { darkMode?: boolean };
  user?: { name?: string };
  /** Translated state text, e.g. "Geschlossen" (HA 2023.9+). */
  formatEntityState?(stateObj: HassEntity, state?: string): string;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
}

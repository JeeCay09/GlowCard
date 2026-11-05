import type { ActionConfig } from './action';
import { ACCENTS } from './color';

/**
 * Visual editor support. Each card describes its form in `static getConfigForm()`; the
 * editor element (editor-element.ts) shows it with Home Assistant's own `ha-form` and
 * selectors, and adds the GlowCard gesture choices (tap / hold) that HA's action picker
 * cannot offer (e.g. "GlowCard popup").
 */

export interface FormSchema {
  name: string;
  type?: 'grid' | 'expandable';
  title?: string;
  /** Expandable sections: icon in front of the title. */
  icon?: string;
  /** Expandable sections: open when the editor opens. */
  expanded?: boolean;
  required?: boolean;
  selector?: Record<string, unknown>;
  context?: Record<string, string>;
  schema?: FormSchema[];
  /** What the card uses when the key is not set; the editor shows it instead of an empty field. */
  default?: unknown;
}

export interface ConfigForm {
  schema: FormSchema[];
  computeLabel: (schema: FormSchema) => string | undefined;
  computeHelper: (schema: FormSchema) => string | undefined;
  assertConfig?: (config: Record<string, unknown>) => void;
}

const LABELS = {
  de: {
    entity: 'Entität',
    entities: 'Weitere Schalter (Gruppe)',
    variant: 'Variante',
    name: 'Name',
    icon: 'Icon',
    color: 'Farbe',
    font: 'Schrift',
    size: 'Größe',
    auto: 'Automatisch (kompakt am Handy)',
    color_auto: 'Automatisch',
    compact: 'Kompakt',
    normal: 'Normal',
    look_section: 'Darstellung',
    actions_section: 'Tippverhalten',
    tap_mode: 'Antippen',
    hold_mode: 'Gedrückt halten',
    tap_action: 'Aktion beim Antippen',
    hold_action: 'Aktion beim Gedrückthalten',
    mode_toggle: 'Ein/Aus',
    mode_popup: 'GlowCard-Popup',
    mode_more_info: 'Detailansicht',
    mode_none: 'Nichts',
    mode_navigate: 'Navigieren',
    mode_url: 'URL öffnen',
    mode_perform_action: 'Aktion ausführen',
    tap_path: 'Ziel beim Antippen',
    hold_path: 'Ziel beim Gedrückthalten',
    tap_url: 'Adresse beim Antippen',
    hold_url: 'Adresse beim Gedrückthalten',
    mode_default: 'Standard',
    area: 'Text unter dem Namen',
    threshold: 'Glüht ab (W)',
    entities_section: 'Entitäten der Steckdose',
    power_entity: 'Leistung',
    energy_entity: 'Energie',
    countdown_entity: 'Countdown',
    child_lock_entity: 'Kindersicherung',
    power_on_entity: 'Verhalten nach Stromausfall',
    indicator_entity: 'Anzeige-LED',
    small: 'Klein',
    wide: 'Breit',
    row: 'Zeile',
    glow: 'Plus Jakarta Sans (GlowCard)',
    theme: 'Schrift des Themes',
    color_helper: 'Name oder Hex-Farbe, z. B. #F5A524',
    area_helper: 'Leer = Bereich der Entität',
    entities_helper: 'Mit mehreren Schaltern wird die Karte zur Gruppe',
    auto_helper: 'Leer = automatisch vom Gerät',
    color_light_helper: 'Gilt, solange das Licht aus ist oder keine Farbe meldet',
    yaml_only: 'Gruppen-Einträge mit eigenem Namen lassen sich nur im YAML-Modus bearbeiten',
    persons: 'Personen',
    greeting_name: 'Name in der Begrüßung',
    greeting_name_helper: 'Leer = Name des angemeldeten Benutzers',
    weather: 'Wetter',
    all_lights: 'Alle Lichter zählen',
    lights: 'Lichter',
    lights_helper: 'Leer lassen und „Alle Lichter zählen“ einschalten, um alle Lichter zu zählen',
    energy_section: 'Energie',
    solar: 'Solarleistung',
    battery: 'Akku-Ladestand',
    battery_power: 'Akku-Leistung (+ = lädt)',
    grid: 'Netzleistung (+ = Bezug)',
    home: 'Hausverbrauch',
    navigation_path: 'Ziel von „Energiefluss öffnen“',
    navigation_path_helper: 'Leer = /energy',
    security: 'Sicherheit',
    security_helper: 'Fenster, Türen, Rauchmelder, Schlösser, Alarmanlage',
    alerts: 'Warnungen',
    alerts_helper: 'Problem-Sensoren oder Saugroboter; nur sichtbar, wenn etwas vorliegt',
    chip: 'Art',
    icon_only: 'Nur Symbol',
    segments_yaml_only: 'Eigene Abschnitte (segments) lassen sich nur im YAML-Modus bearbeiten',
    chips_yaml_only: 'Mehrere Chips (chips) lassen sich nur im YAML-Modus bearbeiten',
    weather_t: 'Wetter',
    lights_t: 'Lichter',
    energy_t: 'Energie',
    battery_t: 'Akku',
    security_t: 'Sicherheit',
    alert_t: 'Warnung',
    person_t: 'Person',
    entity_t: 'Beliebige Entität',
    entities_chip: 'Entitäten (Lichter, Sicherheit)',
    heading: 'Überschrift',
    heading_style: 'Stil',
    style_title: 'Titel',
    style_subtitle: 'Untertitel',
    subtitle: 'Zusatztext',
    heading_subtitle_helper: 'Titel: Zeile unter der Überschrift. Untertitel: Text rechts',
    badges: 'Badges',
    badges_helper: 'Entitäten als kleine Badges neben der Überschrift',
    badges_yaml_only: 'Badges mit eigenen Einstellungen lassen sich nur im YAML-Modus bearbeiten',
    glow_section: 'Leuchten',
    glow_entity: 'Symbol leuchtet bei',
    glow_entity_helper: 'Leer = Symbol bleibt neutral. Z. B. eine Lichtgruppe',
    glow_color: 'Leuchtfarbe',
    glow_color_helper: 'Leer = Farbe des Lichts, sonst Glow-Warmton',
    heading_tap_helper: 'Standardaktion = keine. Mit Aktion erscheint ein Pfeil',
  },
  en: {
    entity: 'Entity',
    entities: 'More switches (group)',
    variant: 'Variant',
    name: 'Name',
    icon: 'Icon',
    color: 'Colour',
    font: 'Font',
    size: 'Size',
    auto: 'Automatic (compact on phones)',
    color_auto: 'Automatic',
    compact: 'Compact',
    normal: 'Normal',
    look_section: 'Appearance',
    actions_section: 'Tap behaviour',
    tap_mode: 'Tap',
    hold_mode: 'Hold',
    tap_action: 'Tap action',
    hold_action: 'Hold action',
    mode_toggle: 'Toggle',
    mode_popup: 'GlowCard popup',
    mode_more_info: 'More info',
    mode_none: 'Nothing',
    mode_navigate: 'Navigate',
    mode_url: 'Open URL',
    mode_perform_action: 'Perform action',
    tap_path: 'Tap target',
    hold_path: 'Hold target',
    tap_url: 'Tap URL',
    hold_url: 'Hold URL',
    mode_default: 'default',
    area: 'Text under the name',
    threshold: 'Glows from (W)',
    entities_section: 'Plug entities',
    power_entity: 'Power',
    energy_entity: 'Energy',
    countdown_entity: 'Countdown',
    child_lock_entity: 'Child lock',
    power_on_entity: 'Power-on behaviour',
    indicator_entity: 'Indicator LED',
    small: 'Small',
    wide: 'Wide',
    row: 'Row',
    glow: 'Plus Jakarta Sans (GlowCard)',
    theme: 'Theme font',
    color_helper: 'Name or hex colour, e.g. #F5A524',
    area_helper: 'Empty = the entity’s area',
    entities_helper: 'With several switches the card becomes a group',
    auto_helper: 'Empty = found on the device automatically',
    color_light_helper: 'Used while the light is off or reports no colour',
    yaml_only: 'Group entries with their own name can only be edited in YAML mode',
    persons: 'People',
    greeting_name: 'Name in the greeting',
    greeting_name_helper: 'Empty = name of the signed-in user',
    weather: 'Weather',
    all_lights: 'Count all lights',
    lights: 'Lights',
    lights_helper: 'Leave empty and turn on “Count all lights” to count every light',
    energy_section: 'Energy',
    solar: 'Solar power',
    battery: 'Battery level',
    battery_power: 'Battery power (+ = charging)',
    grid: 'Grid power (+ = import)',
    home: 'House consumption',
    navigation_path: 'Target of “Open energy flow”',
    navigation_path_helper: 'Empty = /energy',
    security: 'Security',
    security_helper: 'Windows, doors, smoke detectors, locks, alarm panel',
    alerts: 'Alerts',
    alerts_helper: 'Problem sensors or robot vacuums; only shown while something is wrong',
    chip: 'Kind',
    icon_only: 'Icon only',
    segments_yaml_only: 'Custom segments can only be edited in YAML mode',
    chips_yaml_only: 'Several chips can only be edited in YAML mode',
    weather_t: 'Weather',
    lights_t: 'Lights',
    energy_t: 'Energy',
    battery_t: 'Battery',
    security_t: 'Security',
    alert_t: 'Alert',
    person_t: 'Person',
    entity_t: 'Any entity',
    entities_chip: 'Entities (lights, security)',
    heading: 'Heading',
    heading_style: 'Style',
    style_title: 'Title',
    style_subtitle: 'Subtitle',
    subtitle: 'Extra text',
    heading_subtitle_helper: 'Title: line under the heading. Subtitle: text on the right',
    badges: 'Badges',
    badges_helper: 'Entities shown as small badges next to the heading',
    badges_yaml_only: 'Badges with their own settings can only be edited in YAML mode',
    glow_section: 'Glow',
    glow_entity: 'Icon glows while',
    glow_entity_helper: 'Empty = the icon stays neutral. E.g. a light group',
    glow_color: 'Glow colour',
    glow_color_helper: 'Empty = the light’s colour, else the warm Glow tone',
    heading_tap_helper: 'Default action = none. With an action an arrow is shown',
  },
};

export type EditorLabel = keyof (typeof LABELS)['de'];

/** The language of the HA frontend (the editor gets no hass in the label callbacks). */
function editorLanguage(): string {
  const ha = document.querySelector('home-assistant') as { hass?: { language?: string } } | null;
  return ha?.hass?.language ?? document.documentElement.lang ?? 'en';
}

export function editorLabel(key: EditorLabel, lang = editorLanguage()): string {
  return (lang.startsWith('de') ? LABELS.de : LABELS.en)[key];
}

const isLabel = (k: string): k is EditorLabel => k in LABELS.de;

// ---------- schema building blocks ----------

export const entityField = (domain: string[]): FormSchema => ({
  name: 'entity',
  required: true,
  selector: { entity: { domain } },
});

export const variantField = (variants: string[]): FormSchema => ({
  name: 'variant',
  default: variants[0],
  selector: {
    select: {
      mode: 'dropdown',
      options: variants.map((v) => ({ value: v, label: editorLabel(v as EditorLabel) })),
    },
  },
});

/** Name + icon side by side. */
export const nameIconFields: FormSchema = {
  name: '',
  type: 'grid',
  schema: [
    { name: 'name', selector: { text: {} } },
    { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
  ],
};

/** Colour + font side by side. */
export const lookFields: FormSchema = {
  name: '',
  type: 'grid',
  schema: [
    {
      name: 'color',
      default: 'auto',
      selector: {
        select: {
          mode: 'dropdown',
          custom_value: true,
          options: [
            { value: 'auto', label: editorLabel('color_auto') },
            ...Object.keys(ACCENTS)
              .filter((k) => k !== 'heat')
              .map((k) => ({ value: k, label: k })),
          ],
        },
      },
    },
    {
      name: 'font',
      default: 'glow',
      selector: {
        select: {
          mode: 'dropdown',
          options: ['glow', 'theme'].map((v) => ({
            value: v,
            label: editorLabel(v as EditorLabel),
          })),
        },
      },
    },
  ],
};

/** Font only (cards without an accent colour). */
export const fontField: FormSchema = {
  name: 'font',
  default: 'glow',
  selector: {
    select: {
      mode: 'dropdown',
      options: ['glow', 'theme'].map((v) => ({ value: v, label: editorLabel(v as EditorLabel) })),
    },
  },
};

/** Card size: auto (compact on phones), compact or normal. */
export const sizeField: FormSchema = {
  name: 'size',
  default: 'auto',
  selector: {
    select: {
      mode: 'dropdown',
      options: ['auto', 'compact', 'normal'].map((v) => ({
        value: v,
        label: editorLabel(v as EditorLabel),
      })),
    },
  },
};

/**
 * Tap and hold behaviour. The editor element replaces each `*_action` field with one
 * choice of all actions and shows only the fields the chosen action needs.
 */
export const actionsField: FormSchema = {
  name: '',
  type: 'expandable',
  title: 'actions_section',
  icon: 'mdi:gesture-tap',
  schema: [
    { name: 'tap_action', selector: { ui_action: {} } },
    { name: 'hold_action', selector: { ui_action: {} } },
  ],
};

/** Section with name, icon, colour, font and size (plus card specific fields). */
export const lookSection = (...fields: FormSchema[]): FormSchema => ({
  name: '',
  type: 'expandable',
  title: 'look_section',
  icon: 'mdi:palette-outline',
  expanded: true,
  schema: fields,
});

// ---------- gestures (tap / hold) ----------

export type GestureMode =
  'popup' | 'toggle' | 'more-info' | 'navigate' | 'url' | 'perform-action' | 'none';
export type Gesture = 'tap' | 'hold';

export interface GestureSpec {
  /** Choices per gesture, in this order. */
  modes: Record<Gesture, GestureMode[]>;
  /** What happens when the key is not set. */
  defaults: Record<Gesture, GestureMode>;
}

const HA_MODES: GestureMode[] = ['navigate', 'url', 'perform-action', 'none'];

export const DEFAULT_GESTURES: GestureSpec = {
  modes: {
    tap: ['toggle', 'popup', 'more-info', ...HA_MODES],
    hold: ['popup', 'toggle', 'more-info', ...HA_MODES],
  },
  defaults: { tap: 'toggle', hold: 'popup' },
};

/** Switch groups: no popup and no single entity for more info. */
export const GROUP_GESTURES: GestureSpec = {
  modes: {
    tap: ['toggle', ...HA_MODES],
    hold: ['none', 'toggle', 'navigate', 'url', 'perform-action'],
  },
  defaults: { tap: 'toggle', hold: 'none' },
};

const GESTURES: Gesture[] = ['tap', 'hold'];

/** The editor choice that shows an action (unset = the card's default). */
export function gestureMode(action: ActionConfig | undefined, fallback: GestureMode): GestureMode {
  if (!action) return fallback;
  return (action.action === 'call-service' ? 'perform-action' : action.action) as GestureMode;
}

/** Card config → form data: adds `*_mode` plus `*_path` / `*_url` for navigate and url. */
export function toFormData(
  config: Record<string, unknown>,
  spec: GestureSpec,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...config };
  for (const g of GESTURES) {
    const action = config[`${g}_action`] as Record<string, unknown> | undefined;
    const mode = gestureMode(action as ActionConfig | undefined, spec.defaults[g]);
    data[`${g}_mode`] = mode;
    if (mode === 'navigate') data[`${g}_path`] = action?.navigation_path ?? '';
    if (mode === 'url') data[`${g}_url`] = action?.url_path ?? '';
  }
  return data;
}

/** Form data → card config: turns the choices back into `tap_action` / `hold_action`. */
export function fromFormData(
  data: Record<string, unknown>,
  spec: GestureSpec,
): Record<string, unknown> {
  const config: Record<string, unknown> = { ...data };
  for (const g of GESTURES) {
    const key = `${g}_action`;
    const mode = config[`${g}_mode`] as GestureMode | undefined;
    const path = config[`${g}_path`] as string | undefined;
    const url = config[`${g}_url`] as string | undefined;
    delete config[`${g}_mode`];
    delete config[`${g}_path`];
    delete config[`${g}_url`];
    const existing = config[key] as Record<string, unknown> | undefined;
    if (mode === undefined || (mode === spec.defaults[g] && !existing)) {
      delete config[key];
      continue;
    }
    const same = existing && gestureMode(existing as ActionConfig, spec.defaults[g]) === mode;
    // Keep what the action already had (e.g. `entity`, service data) while the choice stays.
    const base: Record<string, unknown> = same ? { ...existing } : { action: mode };
    if (!same && mode === spec.defaults[g]) {
      delete config[key];
      continue;
    }
    if (mode === 'navigate') base.navigation_path = path ?? '';
    if (mode === 'url') base.url_path = url ?? '';
    config[key] = base;
  }
  return config;
}

const modeLabel = (m: GestureMode, lang?: string): string =>
  editorLabel(`mode_${m.replace('-', '_')}` as EditorLabel, lang);

/** Fields the chosen action needs, below the choice. */
function modeFields(g: Gesture, mode: unknown, action: FormSchema): FormSchema[] {
  if (mode === 'navigate') return [{ name: `${g}_path`, selector: { navigation: {} } }];
  if (mode === 'url') return [{ name: `${g}_url`, selector: { text: { type: 'url' } } }];
  // HA's picker limited to "perform action" brings the service, target and data fields.
  if (mode === 'perform-action')
    return [{ ...action, selector: { ui_action: { actions: ['perform-action'] } } }];
  return [];
}

/** Replaces the `tap_action` / `hold_action` fields with one choice of all actions. */
export function gestureSchema(
  schema: FormSchema[],
  spec: GestureSpec,
  data: Record<string, unknown>,
  lang?: string,
): FormSchema[] {
  return schema.flatMap((s): FormSchema[] => {
    if (s.schema) return [{ ...s, schema: gestureSchema(s.schema, spec, data, lang) }];
    const g = GESTURES.find((x) => s.name === `${x}_action`);
    if (!g) return [s];
    const choice: FormSchema = {
      name: `${g}_mode`,
      selector: {
        select: {
          mode: 'dropdown',
          options: spec.modes[g].map((m) => ({
            value: m,
            label:
              m === spec.defaults[g]
                ? `${modeLabel(m, lang)} (${editorLabel('mode_default', lang)})`
                : modeLabel(m, lang),
          })),
        },
      },
    };
    return [choice, ...modeFields(g, data[`${g}_mode`], s)];
  });
}

export const areaField: FormSchema = { name: 'area', selector: { text: {} } };

/** Builds the `getConfigForm()` result with DE/EN labels and helpers. */
export function configForm(
  schema: FormSchema[],
  helpers: Partial<Record<string, EditorLabel>> = {},
  assertConfig?: (config: Record<string, unknown>) => void,
): ConfigForm {
  return {
    schema: translateTitles(schema),
    computeLabel: (s) => {
      if (s.type === 'expandable') return s.title;
      return isLabel(s.name) ? editorLabel(s.name) : undefined;
    },
    computeHelper: (s) => {
      const key = helpers[s.name];
      return key ? editorLabel(key) : undefined;
    },
    assertConfig,
  };
}

/** HA shows an expandable's `title` as it is, so section titles are translated up front. */
function translateTitles(schema: FormSchema[]): FormSchema[] {
  return schema.map((s) => ({
    ...s,
    ...(s.title && isLabel(s.title) ? { title: editorLabel(s.title) } : {}),
    ...(s.schema ? { schema: translateTitles(s.schema) } : {}),
  }));
}

/** Drops keys the editor clears to an empty value, so defaults apply again. */
export function cleanConfig<C extends object>(config: C): C {
  return Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as C;
}

/** Defaults of all fields in a schema (sections and grids included). */
export function schemaDefaults(schema: FormSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of schema) {
    if (s.schema) Object.assign(out, schemaDefaults(s.schema));
    else if (s.name && s.default !== undefined) out[s.name] = s.default;
  }
  return out;
}

/** Fills unset fields with the card's defaults, so the editor never shows them empty. */
export function withDefaults(
  data: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...data };
  for (const [k, v] of Object.entries(defaults)) if (out[k] === undefined) out[k] = v;
  return out;
}

/** Drops values that equal the default, so the YAML stays short and defaults can change. */
export function withoutDefaults<C extends object>(config: C, defaults: Record<string, unknown>): C {
  return Object.fromEntries(
    Object.entries(config).filter(([k, v]) => !(k in defaults) || v !== defaults[k]),
  ) as C;
}

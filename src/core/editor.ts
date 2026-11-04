import { ACCENTS } from './color';

/**
 * Visual editor support. Home Assistant (2024.11+) builds the editor from the schema that
 * `static getConfigForm()` returns, using its own `ha-form` and selectors.
 */

export interface FormSchema {
  name: string;
  type?: 'grid' | 'expandable';
  title?: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  context?: Record<string, string>;
  schema?: FormSchema[];
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
  },
  en: {
    entity: 'Entity',
    entities: 'More switches (group)',
    variant: 'Variant',
    name: 'Name',
    icon: 'Icon',
    color: 'Colour',
    font: 'Font',
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
      selector: {
        select: {
          mode: 'dropdown',
          custom_value: true,
          options: Object.keys(ACCENTS).filter((k) => k !== 'heat'),
        },
      },
    },
    {
      name: 'font',
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
  selector: {
    select: {
      mode: 'dropdown',
      options: ['glow', 'theme'].map((v) => ({ value: v, label: editorLabel(v as EditorLabel) })),
    },
  },
};

export const areaField: FormSchema = { name: 'area', selector: { text: {} } };

/** Builds the `getConfigForm()` result with DE/EN labels and helpers. */
export function configForm(
  schema: FormSchema[],
  helpers: Partial<Record<string, EditorLabel>> = {},
  assertConfig?: (config: Record<string, unknown>) => void,
): ConfigForm {
  return {
    schema,
    computeLabel: (s) => {
      if (s.type === 'expandable' && s.title && isLabel(s.title)) return editorLabel(s.title);
      return isLabel(s.name) ? editorLabel(s.name) : undefined;
    },
    computeHelper: (s) => {
      const key = helpers[s.name];
      return key ? editorLabel(key) : undefined;
    },
    assertConfig,
  };
}

/** Drops keys the editor clears to an empty value, so defaults apply again. */
export function cleanConfig<C extends object>(config: C): C {
  return Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as C;
}

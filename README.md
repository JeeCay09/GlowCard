# GlowCard

**English** · [Deutsch](README.de.md)

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
![Status](https://img.shields.io/badge/status-in%20development-orange)

**GlowCard** is a set of custom dashboard cards for [Home Assistant](https://www.home-assistant.io/) with one consistent look: frosted glass, soft coloured glow, light and dark mode, and its own popups.

- Frosted glass cards; an active device tints its card and casts a soft glow in its own colour.
- Round "orb" icons: tap the orb to switch on/off. No extra toggle rows.
- Values like brightness are set by dragging the bar itself.
- Lights use their **current** colour for orb, bar and tint.
- Built-in popups (no Bubble Card or browser_mod needed).
- Works with **standard Home Assistant entities only**. No helpers, template sensors or automations required.

> [!NOTE]
> GlowCard is in beta. v0.1.0 contains the switch and plug cards; more cards follow (see the roadmap). Options may still change before v1.0.

## Cards

| Card           | Type                     | Entities                                        | Status           |
| -------------- | ------------------------ | ----------------------------------------------- | ---------------- |
| Switch         | `custom:glowcard-switch` | `switch.*`, `input_boolean.*`                   | beta (v0.1)      |
| Plug           | `custom:glowcard-plug`   | `switch.*` + optional power/energy `sensor.*`   | beta (v0.1)      |
| Light          | `custom:glowcard-light`  | `light.*`                                       | planned for v0.2 |
| Header         | `custom:glowcard-header` | `person.*`, greeting, date/time                 | planned for v0.3 |
| Status bar     | `custom:glowcard-status` | any entities, grouped into segments             | planned for v0.3 |
| Chip           | `custom:glowcard-chip`   | any entity                                      | planned for v0.3 |
| Energy "House" | `custom:glowcard-energy` | power `sensor.*` for solar, battery, grid, home | planned for v0.4 |

Visual editors for all cards are planned for v1.0. See the [roadmap](#roadmap).

## Installation

### HACS (recommended)

GlowCard is not in the HACS default list yet. Add it as a custom repository:

1. Open **HACS** in Home Assistant.
2. Open the menu (⋮, top right) and choose **Custom repositories**.
3. Repository: `https://github.com/JeeCay09/GlowCard`, type: **Dashboard**. Click **Add**.
4. Search for **GlowCard** in HACS, open it and click **Download**.
5. Reload your browser (clear the cache if the cards do not show up).

HACS adds the dashboard resource automatically. If your dashboards are in YAML mode, add it yourself:

```yaml
lovelace:
  resources:
    - url: /hacsfiles/GlowCard/glowcard.js
      type: module
```

### Manual

1. Download `glowcard.js` from the [latest release](https://github.com/JeeCay09/GlowCard/releases/latest).
2. Copy it to `<config>/www/glowcard/glowcard.js`.
3. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**:
   - URL: `/local/glowcard/glowcard.js`
   - Type: **JavaScript module**
4. Reload your browser.

After an update, change the URL to e.g. `/local/glowcard/glowcard.js?v=0.1.0` so browsers load the new file.

## Configuration

All cards share these options:

| Option        | Type   | Default       | Description                                                |
| ------------- | ------ | ------------- | ---------------------------------------------------------- |
| `entity`      | string | required      | Main entity of the card                                    |
| `name`        | string | friendly name | Title shown on the card                                    |
| `icon`        | string | entity icon   | Any `mdi:` icon                                            |
| `color`       | string | per card type | Accent colour (`amber`, `teal`, `sky`, `violet`, … or hex) |
| `variant`     | string | `small`       | Card layout, depends on the card                           |
| `tap_action`  | action | open popup    | Standard Home Assistant action                             |
| `hold_action` | action | `more-info`   | Standard Home Assistant action                             |

The examples below show the planned options. Details may still change before v1.0.

### Switch

```yaml
type: custom:glowcard-switch
entity: switch.garden_sprinkler
name: Sprinkler
color: sky
variant: wide # small | wide (7-day on/off strip) | row
```

Group of switches (the orb toggles all of them):

```yaml
type: custom:glowcard-switch
name: Smoke detector LEDs
color: green
entities:
  - switch.smoke_detector_kitchen_led
  - switch.smoke_detector_hallway_led
  - switch.smoke_detector_bedroom_led
```

### Plug

```yaml
type: custom:glowcard-plug
entity: switch.office_plug
power: sensor.office_plug_power
energy: sensor.office_plug_energy
name: Home office
variant: wide # small | wide (live power curve)
```

### Light

```yaml
type: custom:glowcard-light
entity: light.living_room_strip
name: TV wall
```

### Header and status bar

```yaml
type: custom:glowcard-header
persons:
  - person.alex
  - person.sam
---
type: custom:glowcard-status
segments:
  - type: weather
    entity: weather.home
  - type: lights # counts lights that are on, popup lists them
    entities: all
  - type: energy
    solar: sensor.pv_power
    battery: sensor.battery_state_of_charge
  - type: security
    entities:
      - binary_sensor.bathroom_window
      - binary_sensor.smoke_detectors
```

### Energy "House"

```yaml
type: custom:glowcard-energy
solar: sensor.pv_power
battery: sensor.battery_power # positive = charging
battery_soc: sensor.battery_state_of_charge
grid: sensor.grid_power # negative = export
home: sensor.home_load_power
```

## Roadmap

1. Core: glass, orb, drag bar, popups, light/dark mode
2. Switch and plug cards → **v0.1.0 (beta)**
3. Light card and popup → v0.2.0
4. Header, status bar and chips → v0.3.0
5. Energy "House" card and popup → v0.4.0
6. Visual editors, full docs, submission to the HACS default list → v1.0.0

Later: room card, binary sensor, irrigation/plant, media, cover and vacuum popups.

## Development

```bash
npm install
npm run watch   # rebuild on every change
npm run dev     # rebuild incl. the preview page, then: npm run serve → http://localhost:5050/dev/
npm test        # unit tests
npm run build   # creates dist/glowcard.js
```

Releases are built by GitHub Actions; `glowcard.js` is attached to each GitHub release. The HACS validation action runs on every push.

## License

MIT. The embedded font [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) is licensed under the SIL Open Font License 1.1 (see `src/assets/OFL-PlusJakartaSans.txt`).

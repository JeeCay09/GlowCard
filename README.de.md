# GlowCard

[English](README.md) · **Deutsch**

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
![Status](https://img.shields.io/badge/status-Beta-orange)

**GlowCard** ist ein Set eigener Dashboard-Karten für [Home Assistant](https://www.home-assistant.io/) mit einem einheitlichen Look: Milchglas, weiches farbiges Leuchten, heller und dunkler Modus und eigene Popups.

![GlowCard Schalter- und Steckdosen-Karten im dunklen Modus](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/cards-dark.jpg)

![Popups von Schalter und Steckdose](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/popups-dark.jpg)

![GlowCard Schalter- und Steckdosen-Karten im hellen Modus](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/cards-light.jpg)

- Karten aus Milchglas; ein aktives Gerät färbt seine Karte ein und leuchtet in seiner eigenen Farbe.
- Runde „Orb“-Symbole: Tippen auf den Orb schaltet ein/aus. Keine extra Schalterzeilen.
- Werte wie Helligkeit stellt man ein, indem man den Balken selbst zieht.
- Lichter nutzen ihre **aktuelle** Farbe für Orb, Balken und Kartentönung.
- Eingebaute Popups (kein Bubble Card oder browser_mod nötig).
- Funktioniert **nur mit Standard-Entitäten von Home Assistant**. Keine Helfer, Template-Sensoren oder Automationen nötig.

> [!NOTE]
> GlowCard ist in der Beta. v0.3.0 enthält Schalter, Steckdose, Licht, Kopfzeile, Status-Leiste und Chips, alle mit visuellem Editor; weitere Karten folgen (siehe Roadmap). Optionen können sich bis v1.0 noch ändern.

## Karten

| Karte          | Typ                       | Entitäten                                           | Status           |
| -------------- | ------------------------- | --------------------------------------------------- | ---------------- |
| Schalter       | `custom:glowcard-switch`  | `switch.*`, `input_boolean.*`                       | Beta (v0.1)      |
| Steckdose      | `custom:glowcard-plug`    | `switch.*` + optional Leistungs-/Energie-`sensor.*` | Beta (v0.1)      |
| Licht          | `custom:glowcard-light`   | `light.*`                                           | Beta (v0.2)      |
| Kopfzeile      | `custom:glowcard-header`  | `person.*`, Begrüßung, Datum/Uhrzeit                | Beta (v0.3)      |
| Status-Leiste  | `custom:glowcard-status`  | Wetter, Lichter, Energie, Sicherheit, Warnungen     | Beta (v0.3)      |
| Chip           | `custom:glowcard-chip`    | wie die Status-Leiste, plus Personen und Akku       | Beta (v0.3)      |
| Überschrift    | `custom:glowcard-heading` | beliebige Entitäten als Badges                      | Beta (v0.4)      |
| Energie „Haus“ | `custom:glowcard-energy`  | Leistungs-`sensor.*` für Solar, Akku, Netz, Haus    | geplant für v0.4 |

Alle Karten haben einen visuellen Editor (ab Home Assistant 2025.1). In einem Sections-Dashboard richtet sich die Breite nach der Variante: klein = 1/4, breit = 1/2, breite Steckdose, Kopfzeile, Status-Leiste, Überschrift und Chip-Reihen = ganze Breite, einzelner Chip = 1/2, Symbol-Chip = 1/4. Im Dashboard-Editor kannst du die Größe weiterhin selbst ändern.

## Installation

### HACS (empfohlen)

GlowCard ist noch nicht in der HACS-Standardliste. Füge es als benutzerdefiniertes Repository hinzu:

1. **HACS** in Home Assistant öffnen.
2. Menü (⋮, oben rechts) öffnen und **Benutzerdefinierte Repositories** wählen.
3. Repository: `https://github.com/JeeCay09/GlowCard`, Typ: **Dashboard**. Auf **Hinzufügen** klicken.
4. In HACS nach **GlowCard** suchen, öffnen und **Herunterladen** klicken.
5. Browser neu laden (Cache leeren, falls die Karten nicht erscheinen).

HACS trägt die Dashboard-Ressource automatisch ein. Wenn deine Dashboards im YAML-Modus laufen, trage sie selbst ein:

```yaml
lovelace:
  resources:
    - url: /hacsfiles/GlowCard/glowcard.js
      type: module
```

### Manuell

1. `glowcard.js` aus dem [neuesten Release](https://github.com/JeeCay09/GlowCard/releases/latest) herunterladen.
2. Nach `<config>/www/glowcard/glowcard.js` kopieren.
3. **Einstellungen → Dashboards → ⋮ → Ressourcen → Ressource hinzufügen**:
   - URL: `/local/glowcard/glowcard.js`
   - Typ: **JavaScript-Modul**
4. Browser neu laden.

Nach einem Update die URL z. B. auf `/local/glowcard/glowcard.js?v=0.3.1` ändern, damit Browser die neue Datei laden.

## Konfiguration

Alle Karten teilen diese Optionen:

| Option        | Typ    | Standard           | Beschreibung                                                                                               |
| ------------- | ------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `entity`      | String | Pflicht            | Haupt-Entität der Karte                                                                                    |
| `name`        | String | Anzeigename        | Titel auf der Karte                                                                                        |
| `icon`        | String | Symbol der Entität | Beliebiges `mdi:`-Symbol                                                                                   |
| `color`       | String | je Kartentyp       | Akzentfarbe (`amber`, `teal`, `sky`, `violet`, … oder Hex)                                                 |
| `variant`     | String | `small`            | Layout der Karte, abhängig vom Kartentyp                                                                   |
| `size`        | String | `auto`             | Schalter, Steckdose, Licht, Status-Leiste: `auto` (kompakt am Handy unter 600 px), `compact` oder `normal` |
| `tap_action`  | Aktion | Popup öffnen       | Standard-Aktion von Home Assistant                                                                         |
| `hold_action` | Aktion | `more-info`        | Standard-Aktion von Home Assistant                                                                         |

Die Beispiele zeigen die geplanten Optionen. Details können sich bis v1.0 noch ändern.

### Schalter

```yaml
type: custom:glowcard-switch
entity: switch.garden_sprinkler
name: Rasensprenger
color: sky
variant: wide # small | wide (7-Tage-Streifen) | row
```

Gruppe von Schaltern (der Orb schaltet alle):

```yaml
type: custom:glowcard-switch
name: Rauchmelder-LEDs
color: green
entities:
  - switch.smoke_detector_kitchen_led
  - switch.smoke_detector_hallway_led
  - switch.smoke_detector_bedroom_led
```

### Steckdose

```yaml
type: custom:glowcard-plug
entity: switch.office_plug
name: Home Office
variant: wide # small | wide (Live-Leistungskurve)
threshold: 1 # leuchtet ab so vielen Watt (Standard 1)
```

Die Karte findet Leistungs- und Energie-Sensor, Countdown, Kindersicherung sowie die Selects für „Nach Stromausfall“ und die LED selbst über das Gerät der Steckdose. Zeilen im Popup erscheinen nur, wenn die Steckdose die passende Entität hat. Falls die Erkennung danebenliegt, lassen sie sich festlegen: `power_entity`, `energy_entity`, `countdown_entity`, `child_lock_entity`, `power_on_entity`, `indicator_entity`.

### Licht

```yaml
type: custom:glowcard-light
entity: light.living_room
variant: wide # wide (2 Spalten, Ziehbalken) | small (1 Spalte)
```

Orb, Balken und Kartentönung nutzen die aktuelle Farbe der Lampe. Den Balken ziehen stellt die Helligkeit ein, ganz nach links schaltet aus. Das Popup hat einen hohen Helligkeitsbalken, Reiter für Farbtemperatur und Farbe (nur was die Lampe laut `supported_color_modes` kann) und Farbkreise von Warmweiß bis Blau.

### Kopfzeile

```yaml
type: custom:glowcard-header
persons:
  - person.alex
  - person.sam
name: Alex # optional, sonst der Vorname des angemeldeten Benutzers
```

Begrüßung je nach Tageszeit („Guten Morgen, Alex“), Datum und Uhrzeit, rechts die Personen. Wer zu Hause ist, bekommt einen grünen Ring. Tippen auf eine Person öffnet ihre Details. Mit `greeting:` kannst du einen eigenen Text setzen.

### Status-Leiste

Eine Glas-Kapsel mit Abschnitten. Abschnitte mit Pfeil öffnen ein Popup, der angetippte Abschnitt bekommt einen farbigen Ring.

Einfach (so speichert es auch der visuelle Editor, Reihenfolge wie im Bild):

```yaml
type: custom:glowcard-status
weather: weather.home
all_lights: true # oder lights: [light.a, light.b]
solar: sensor.pv_power
battery: sensor.battery_level # Ladestand in %
battery_power: sensor.battery_power # + = lädt
grid: sensor.grid_power # + = Bezug, − = Einspeisung
home: sensor.home_power
security:
  - binary_sensor.bathroom_window
  - binary_sensor.smoke_detectors
alerts:
  - binary_sensor.vacuum_problem # nur sichtbar, wenn ein Problem vorliegt
```

Frei (nur YAML), mit eigener Reihenfolge, Namen und Aktionen:

```yaml
type: custom:glowcard-status
segments:
  - type: weather
    entity: weather.home
    tap_action:
      action: none # ohne Pfeil, nicht antippbar
  - type: lights # ohne entities: alle Lichter (ohne Lichtgruppen)
  - type: energy
    solar: sensor.pv_power
    battery: sensor.battery_level
    battery_power: sensor.battery_power
    navigation_path: /energy # Ziel von „Energiefluss öffnen“
  - type: security
    entities:
      - entity: binary_sensor.bathroom_window
        name: Fenster Bad
      - binary_sensor.smoke_detectors
  - type: alert
    entity: binary_sensor.vacuum_problem
```

| Abschnitt  | Zeigt                                   | Popup                                                          |
| ---------- | --------------------------------------- | -------------------------------------------------------------- |
| `weather`  | Temperatur, Zustand, Luftfeuchte        | – (Standard: Details der Wetter-Entität)                       |
| `lights`   | Anzahl eingeschalteter Lichter          | „Lichter an“: Orb schaltet, Balken ziehen, „Alle ausschalten“  |
| `energy`   | Solarleistung, Akku-Stand und -Richtung | „Energie jetzt“: Solar, Haus, Akku, Netz                       |
| `battery`  | Akku mit Ring (vor allem als Chip)      | wie `energy`                                                   |
| `security` | „Alles zu“ oder Anzahl der Meldungen    | Liste mit Zustand und „seit …“; Tippen öffnet Details          |
| `alert`    | Gerät und Fehlertext, rot mit Puls      | Fehler, seit wann; bei Saugrobotern „Fortsetzen“/„Zur Station“ |
| `person`   | Avatar und Ort                          | – (Details der Person)                                         |
| `entity`   | beliebige Entität mit ihrem Zustand     | – (Details der Entität)                                        |

Sicherheit zählt `binary_sensor` mit `on` (offen, Rauch, …), nicht verriegelte `lock`, ausgelöste `alarm_control_panel` und offene `cover` als Meldung. Bei `alert` sucht die Karte Fehlertext (`sensor.*_error`) und Saugroboter (`vacuum.*`) auf demselben Gerät selbst; sonst `detail_entity` und `vacuum` angeben. Jeder Abschnitt kennt `name`, `icon`, `color`, `tap_action` und `hold_action`.

Auf schmalen Bildschirmen lässt sich die Leiste seitlich wischen; kompakter sind dort die Symbol-Chips.

### Chips

Ein Chip pro Karte (visueller Editor) oder eine Reihe mit `chips:` (YAML). Die Einträge sind dieselben wie bei der Status-Leiste und öffnen dieselben Popups.

```yaml
type: custom:glowcard-chip
chip: lights
---
type: custom:glowcard-chip
chips:
  - type: weather
    entity: weather.home
  - type: lights
  - type: person
    entity: person.alex
  - type: battery
    battery: sensor.battery_level
    battery_power: sensor.battery_power
  - type: security
    entities: [binary_sensor.bathroom_window]
  - type: alert
    entity: binary_sensor.vacuum_problem
---
type: custom:glowcard-chip
icon_only: true # runde Symbole mit Zähler, z. B. fürs Handy
chips:
  - type: lights
  - type: alert
    entity: binary_sensor.vacuum_problem
```

Nicht erreichbare Entitäten erscheinen gestrichelt und blass. Ein Warn-Chip ohne Meldung verschwindet (`hide_when_ok: false` zeigt ihn grün).

### Überschrift

Ein Abschnittstitel mit rundem Symbol, einer Zeile darunter und kleinen Glas-Badges, oder ein Untertitel in Großbuchstaben zum Gliedern. Das Symbol bleibt standardmäßig neutral; mit `glow_entity` leuchtet es, solange diese Entität an ist, in `glow_color` (Farbwähler im Editor) oder sonst in der Farbe des Lichts.

```yaml
type: custom:glowcard-heading
heading: Wohnzimmer
subtitle: Erdgeschoss
icon: mdi:sofa-outline
badges:
  - sensor.wohnzimmer_temperatur
  - sensor.wohnzimmer_luftfeuchtigkeit
  - sensor.wohnzimmer_sensor_batterie # ab 15 % und weniger rot und pulsierend
  - type: lights # YAML: dieselben Einträge wie bei der Status-Leiste, öffnet das Licht-Popup
    entities: [light.tv_wand]
glow_entity: light.wohnzimmer # optional
glow_color: [255, 165, 110] # optional
tap_action: # optional, zeigt einen Pfeil neben dem Titel
  action: navigate
  navigation_path: /dashboard-home/wohnzimmer
---
type: custom:glowcard-heading
heading_style: subtitle
heading: Erdgeschoss
subtitle: 6 Räume
```

### Energie „Haus“

```yaml
type: custom:glowcard-energy
solar: sensor.pv_power
battery: sensor.battery_power # positiv = Laden
battery_soc: sensor.battery_state_of_charge
grid: sensor.grid_power # negativ = Einspeisung
home: sensor.home_load_power
```

## Roadmap

1. Kern: Glas, Orb, Ziehbalken, Popups, heller/dunkler Modus
2. Schalter- und Steckdosen-Karte → v0.1.0 (Beta)
3. Licht-Karte und Popup → v0.2.0 (Beta)
4. Kopfzeile, Status-Leiste und Chips, visueller Editor und Standard-Breiten → **v0.3.0 (Beta)**
5. Überschrift-Karte (Abschnittstitel mit Badges, zusätzlich zum Plan) und Energie-Karte „Haus“ mit Popup → v0.4.0
6. Visuelle Editoren für alle Karten, vollständige Doku, Antrag auf HACS-Standardliste → v1.0.0

Später: Raum-Karte, Binärsensor, Bewässerung/Pflanze, Popups für Medien, Rollos und Saugroboter.

## Entwicklung

```bash
npm install
npm run watch   # baut bei jeder Änderung neu
npm run dev     # baut inkl. Vorschauseite, dann: npm run serve → http://localhost:5050/dev/
npm test        # Unit-Tests
npm run build   # erzeugt dist/glowcard.js
```

Releases werden per GitHub Actions gebaut; `glowcard.js` wird an jedes GitHub-Release angehängt. Die HACS-Validierung läuft bei jedem Push.

## Lizenz

MIT. Die eingebettete Schrift [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) steht unter der SIL Open Font License 1.1 (siehe `src/assets/OFL-PlusJakartaSans.txt`).

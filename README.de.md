# GlowCard

[English](README.md) · **Deutsch**

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
![Status](https://img.shields.io/badge/status-Beta-orange)

**GlowCard** ist ein Set eigener Dashboard-Karten für [Home Assistant](https://www.home-assistant.io/) mit einem einheitlichen Look: Milchglas, weiches farbiges Leuchten, heller und dunkler Modus und eigene Popups.

![GlowCard Schalter- und Steckdosen-Karten im dunklen Modus](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/cards-dark.jpg)

![Popups von Schalter und Steckdose](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/popups-dark.jpg)

![GlowCard Schalter- und Steckdosen-Karten im hellen Modus](https://raw.githubusercontent.com/JeeCay09/GlowCard/main/docs/images/cards-light.jpg)

- Karten aus Milchglas; ein aktives Gerät färbt seine Karte ein und leuchtet in seiner eigenen Farbe.
- Tippen auf die Karte (auch auf den Orb) schaltet ein/aus, Gedrückthalten öffnet das GlowCard-Popup. Keine extra Schalterzeilen.
- Werte wie Helligkeit stellt man ein, indem man den Balken selbst zieht.
- Lichter nutzen ihre **aktuelle** Farbe für Orb, Balken und Kartentönung.
- Eingebaute Popups (kein Bubble Card oder browser_mod nötig).
- Funktioniert **nur mit Standard-Entitäten von Home Assistant**. Keine Helfer, Template-Sensoren oder Automationen nötig.

> [!NOTE]
> GlowCard ist in der Beta. v0.9.4 enthält Schalter, Licht, Kopfzeile, Status-Leiste, Chips, Überschrift, Energie und Navigation, alle mit visuellem Editor; weitere Karten folgen (siehe Roadmap). Optionen können sich bis v1.0 noch ändern.

## Karten

| Karte         | Typ                       | Entitäten                                               | Status      |
| ------------- | ------------------------- | ------------------------------------------------------- | ----------- |
| Schalter      | `custom:glowcard-switch`  | `switch.*` (auch Steckdosen), `input_boolean.*`         | Beta (v0.1) |
| Licht         | `custom:glowcard-light`   | `light.*`                                               | Beta (v0.2) |
| Kopfzeile     | `custom:glowcard-header`  | `person.*`, Begrüßung, Datum/Uhrzeit                    | Beta (v0.3) |
| Status-Leiste | `custom:glowcard-status`  | Wetter, Lichter, Energie, Sicherheit, Warnungen         | Beta (v0.3) |
| Chip          | `custom:glowcard-chip`    | wie die Status-Leiste, plus Personen und Akku           | Beta (v0.3) |
| Überschrift   | `custom:glowcard-heading` | beliebige Entitäten als Badges                          | Beta (v0.4) |
| Energie       | `custom:glowcard-energy`  | Leistungs-`sensor.*` für Haus oder Netz; Solar optional | Beta (v0.7) |
| Navigation    | `custom:glowcard-nav`     | Ansichten, Popups (`#hash`); Status-Punkte optional     | Beta (v0.9) |

Alle Karten haben einen visuellen Editor (ab Home Assistant 2025.1). In einem Sections-Dashboard passen die Karten genau ins Raster von Home Assistant (Zeilen zu 56 px): Kachel 2 Zeilen am Handy bzw. 3 am PC, Schalter-Gruppe und Leistungs-Karte 3, Mini, Status-Leiste und Chip 1 Zeile. Breite: Kachel, Licht, Mini und Schalter-Gruppe = 1/2 (Kachel und Mini lassen sich auf 1/4 verkleinern), Schalter mit Leistung/Verbrauch, Kopfzeile, Status-Leiste, Überschrift, Energie und Chip-Reihen = ganze Breite (die Energie-Karte lässt sich nicht schmaler machen), einzelner Chip = 1/2, Symbol-Chip = 1/4. Die Breite kannst du im Dashboard-Editor weiterhin ändern. Neue Karten starten ohne Entität; fügst du eine Karte „nach Entität“ hinzu, nimmt sie die gewählte Entität.

Im Editor bietet „Tippverhalten“ für Antippen und Gedrückthalten: Ein/Aus, GlowCard-Popup, Detailansicht, Navigieren, URL öffnen, Aktion ausführen oder Nichts, alles in einer Liste.

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

Nach einem Update die URL z. B. auf `/local/glowcard/glowcard.js?v=0.9.4` ändern, damit Browser die neue Datei laden.

## Konfiguration

Alle Karten teilen diese Optionen:

| Option        | Typ    | Standard           | Beschreibung                                                                                                                            |
| ------------- | ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`      | String | Pflicht            | Haupt-Entität der Karte                                                                                                                 |
| `name`        | String | Anzeigename        | Titel auf der Karte                                                                                                                     |
| `icon`        | String | Symbol der Entität | Beliebiges `mdi:`-Symbol                                                                                                                |
| `color`       | String | je Kartentyp       | Akzentfarbe (`amber`, `teal`, `sky`, `violet`, … oder Hex)                                                                              |
| `size`        | String | `auto`             | Schalter, Licht, Status-Leiste: `auto` (kompakt am Handy unter 600 px), `compact`, `normal`; Schalter und Licht auch `mini` (einzeilig) |
| `tap_action`  | Aktion | `toggle`           | Aktion von Home Assistant oder `action: popup` für das GlowCard-Popup                                                                   |
| `hold_action` | Aktion | `popup`            | Aktion von Home Assistant oder `action: popup` für das GlowCard-Popup                                                                   |

Die Beispiele zeigen die geplanten Optionen. Details können sich bis v1.0 noch ändern.

### Schalter

```yaml
type: custom:glowcard-switch
entity: switch.garden_sprinkler
name: Rasensprenger
color: sky
size: mini # auto | compact | normal | mini (eine Zeile, z. B. für Listen)
```

Den 7-Tage-Verlauf zeigt das Popup (Gedrückthalten). Das frühere `variant: wide` wird als Kachel angezeigt, `variant: row` als `size: mini`.

Gruppe von Schaltern (Tippen auf die Karte schaltet alle, Gedrückthalten macht standardmäßig nichts):

```yaml
type: custom:glowcard-switch
name: Rauchmelder-LEDs
color: green
entities:
  - switch.smoke_detector_kitchen_led
  - switch.smoke_detector_hallway_led
  - switch.smoke_detector_bedroom_led
```

#### Steckdosen

Steckdosen nutzen dieselbe Karte. Sie findet Leistungs- und Energie-Sensor, Countdown, Kindersicherung sowie die Selects für „Nach Stromausfall“ und die LED selbst über das Gerät. Diese Dinge erscheinen im Popup, sobald das Gerät die passende Entität hat. Auf der Karte stehen Watt, Kurve und Verbrauch nur mit `show_power: true`.

```yaml
type: custom:glowcard-switch
entity: switch.office_plug
name: Home Office
show_power: true # Watt, Live-Kurve und Verbrauch heute auf der Karte, ganze Breite (Standard false)
threshold: 1 # mit show_power: leuchtet ab so vielen Watt (Standard 1)
```

Mit `size: mini` zeigt die Zeile bei `show_power` die Watt statt An/Aus. Falls die Erkennung danebenliegt, lassen sich die Entitäten festlegen: `power_entity`, `energy_entity`, `countdown_entity`, `child_lock_entity`, `power_on_entity`, `indicator_entity`.

Die frühere Karte `custom:glowcard-plug` gibt es nicht mehr. Ändere bei bestehenden Karten den Typ auf `custom:glowcard-switch` und ersetze `variant: wide` durch `show_power: true`.

### Licht

```yaml
type: custom:glowcard-light
entity: light.living_room
```

Orb, Balken und Kartentönung nutzen die aktuelle Farbe der Lampe. Den Balken ziehen stellt die Helligkeit ein, ganz nach links schaltet aus. Die Karte ist immer 2 Spalten breit (das frühere `variant: small` wird breit angezeigt). Oben rechts steht die Helligkeit, solange das Licht an ist; Lampen ohne Dimmung zeigen dort nichts. Das Popup hat einen hohen Helligkeitsbalken (Lampen ohne Dimmung bekommen stattdessen einen großen An/Aus-Schalter), Reiter für Farbtemperatur und Farbe (nur was die Lampe laut `supported_color_modes` kann) und Farbkreise von Warmweiß bis Blau.

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
exclude_lights: # optional, nur mit all_lights
  - light.nachtlicht
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
    exclude: [light.nachtlicht] # optional
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

Ein Abschnittstitel mit rundem Symbol, einer Zeile darunter und kleinen Glas-Badges, oder ein Untertitel in Großbuchstaben zum Gliedern. Das Symbol bleibt standardmäßig neutral. Mit `glow_color` (Farbwähler „Farbe“ im Editor) wird es in dieser Farbe gezeigt, auch ohne Leuchten. Mit `glow_entity` leuchtet es, solange diese Entität an ist, in `glow_color` oder sonst in der Farbe des Lichts.

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

### Energie

Für jedes Zuhause, mit oder ohne Solaranlage: wie viel das Haus gerade verbraucht und ob das für diese Uhrzeit üblich ist. Die Karte zeigt den aktuellen Verbrauch als große Zahl und darunter den üblichen Bereich für diese Stunde (die mittleren 60 % der letzten 14 Tage zu dieser Stunde). Liegt der Verbrauch darüber, wird die Zahl orange. Üblicher Bereich und Grundlast kommen aus den Langzeitstatistiken von Home Assistant, der Sensor braucht also eine `state_class` (bei Leistungssensoren gängiger Integrationen vorhanden). Status: „normal“, „erhöht“ oder „niedrig“.

Ein Sensor genügt: der Hausverbrauch (`home`) oder die Netzleistung (`grid`, positiv = Bezug). Alles andere ist optional und erweitert dieselbe Karte:

- `devices`: bis zu 5 Leistungssensoren. Die Karte listet sie nach Leistung; der Rest des Hauses erscheint als „Nicht erfasst“.
- `solar`, `battery` (Ladestand) und `battery_power` (positiv = Laden): Die Karte wird eine Reihe höher und zeigt Kacheln für Solar, Akku und Netz. Ohne Haussensor wird der Verbrauch aus Netz, Solar und Akku berechnet.
- `invert_grid` / `invert_battery`: für Sensoren mit umgekehrtem Vorzeichen (Einspeisung bzw. Entladen positiv).

**Energie-Dashboard:** kWh heute (Verbrauch, Solar, Bezug, Einspeisung), der Vergleich mit dem Vortag und die Kosten kommen ohne Einstellung aus dem Energie-Dashboard von Home Assistant. Die Kosten stammen aus den Kosten-Statistiken von HA, dynamische Preise (z. B. Tibber oder Nordpool) werden also stundengenau abgerechnet. Unter „Erweitert“ lässt sich das mit Tageszählern (`energy_today`, `solar_energy`, `grid_import_energy`, `grid_export_energy`), einem `price` (Sensor oder Zahl), einem `fixed_price` oder einem `cost_today`-Sensor übersteuern.

Antippen öffnet das Popup (Verbrauch jetzt, üblicher Bereich, Herkunft, Grundlast mit Kosten pro Tag, Geräte mit Anteil, Verlauf heute gegen Vortag und üblichen Bereich, Vergleichskacheln). Gedrückt halten öffnet die Detailansicht des Haussensors.

```yaml
type: custom:glowcard-energy
home: sensor.house_power # oder grid: sensor.grid_power
devices: # optional
  - sensor.heat_pump_power
  - entity: sensor.tv_plug_power
    name: Fernseher
# optional, mit Solar / Akku:
solar: sensor.pv_power
battery: sensor.battery_state_of_charge
battery_power: sensor.battery_power # positiv = Laden
# invert_battery: true # falls der Sensor Entladen positiv meldet
# optionale Übersteuerung (sonst aus dem Energie-Dashboard):
# energy_today: sensor.house_energy_today
# price: 0.32
```

### Navigation

Eine Leiste aus runden Symbol-Buttons, um Ansichten zu wechseln oder Popups zu öffnen (z. B. Bubble-Card-Popups per `#hash`), als eine gemeinsame Glas-Kapsel. Der Button der aktuellen Ansicht ist ein leuchtender Orb in einer sanften Markierung. Beim Wechsel bleiben alle Buttons an ihrem Platz: Die Markierung gleitet zum neuen Button und erst dann leuchtet sein Orb auf.

- `position: float` (Standard): Die Leiste schwebt unten am Bildschirm, die Karten laufen darunter durch. Beim Bearbeiten des Dashboards (und in der Vorschau des Editors) sitzt sie als Karte, damit du sie anklicken kannst. Setze sie ans Ende einer Ansicht.
- `position: card`: eine normale Karte über die ganze Breite, die mitscrollt, z. B. fürs Tablet.
- Der aktuelle Button ergibt sich aus der Adresse: Pfad einer Ansicht (`/dashboard/ansicht` oder nur `ansicht`) oder ein offenes Popup `#hash`. Ein Button für das Dashboard selbst (`/dashboard`) ist auf dessen erster Ansicht (`/dashboard/0`) markiert.
- Setze dieselbe Leiste (gleiche Symbole in gleicher Reihenfolge) in jede Ansicht: Nach einem Ansichtswechsel gleitet die Markierung vom alten Button weiter, als wäre es eine Leiste.
- `entity` (optional, je Button): Ein kleiner Punkt erscheint, solange sie an ist (Licht an, Saugroboter saugt, Medien laufen …); Lichter nehmen ihre eigene Farbe.
- `color`: Leuchtfarbe des aktuellen Buttons (Farbname wie `indigo`, `blue`, `green`, `red`, `pink`, `purple` oder Hex; Standard Indigo); die `color` eines Buttons gewinnt, so kann jeder Button eine eigene Farbe haben.
- Je Button führen `tap_action` / `hold_action` (YAML) statt der Navigation eine beliebige Home-Assistant-Aktion aus.

```yaml
type: custom:glowcard-nav
position: float # oder card
buttons:
  - icon: mdi:home-outline
    name: Start
    navigation_path: /dashboard-home/start
  - icon: mdi:sofa-outline
    name: Wohnzimmer
    navigation_path: '#wohnzimmer' # öffnet ein Popup
    entity: light.wohnzimmer # optionaler Status-Punkt
  - icon: mdi:robot-vacuum
    name: Vesta
    navigation_path: '#vesta'
    entity: vacuum.vesta
    color: green # optional, je Button
  - icon: mdi:heart-pulse
    name: System
    tap_action:
      action: more-info
      entity: sensor.system_health
```

## Roadmap

1. Kern: Glas, Orb, Ziehbalken, Popups, heller/dunkler Modus
2. Schalter- und Steckdosen-Karte → v0.1.0 (Beta)
3. Licht-Karte und Popup → v0.2.0 (Beta)
4. Kopfzeile, Status-Leiste und Chips, visueller Editor und Standard-Breiten → **v0.3.0 (Beta)**
5. Überschrift-Karte (Abschnittstitel mit Badges, zusätzlich zum Plan) → v0.4.0; Energie-Karte „Lastring“ mit Popup → v0.7.0; Energie-Karte ohne Ring (große Zahl), Editor und Handy-Layout → v0.8.0; Navigationsleiste (schwebend oder als Karte) → v0.9.0
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

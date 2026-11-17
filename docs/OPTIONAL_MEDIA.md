# Optionale Medien nach Veröffentlichung

Aus urheberrechtlicher Vorsicht sind alle bisher eingecheckten Sound- und Bilddateien aus dem aktuellen Stand entfernt. Spielregeln, Schiffsdefinitionen und Hardpoints bleiben erhalten. Ohne Medien spielt Sojourn mit stummem Audio, Platzhalterporträts, CSS-Hintergrundfarbe und den bereits vorhandenen geometrischen Schiffsdarstellungen.

## Neue, rechtlich freigegebene Audiodateien einbauen

Lege die folgenden Dateien unter `public/audio/` ab. Beide sind optional:

- `public/audio/deep-space.ogg`: Hintergrundschleife
- `public/audio/spacecraft-rcs-thruster-burst.ogg`: Manöverdüsenimpulse

Alternativ `npm run audio:import-originals -- "<ambience.ogg|->" "<rcs.ogg|->"` verwenden. Der Import überprüft, dass die Datei einen Ogg-Header besitzt; `-` überspringt den jeweiligen Kanal. Die importierten Dateien dürfen nur verwendet werden, wenn ihre Veröffentlichung erlaubt ist.

Bei fehlenden Dateien sind die jeweiligen Kanäle stumm. Lautstärkeeinstellungen und die Auslöse-Logik bleiben erhalten.

## Porträts, Hintergrund und Schiffe

- Porträts: `public/portraits/portrait-1.webp`, `portrait-4.webp`, `portrait-5.webp`; die Steckplätze 2 und 3 sind schon als Platzhalter vorgesehen
- Menü-Hintergrund: `public/startscreen-background.webp`; ohne Datei bleibt die definierte dunkle Hintergrundfarbe
- Schiffsgrafiken: `resources/ships/{freighter,mining,patrol,salvage}/` unter den unveränderten Dateinamen `*-variant-01.png` bis `*-variant-07.png`

Neue Schiffssprites müssen die vorhandenen Dimensionen und den Asset-Standard (Bug rechts, transparenter Rand, 4 px/m, kompatible Hardpoints) erfüllen; der Test `tests/assets/ship-asset-standard.test.cjs` validiert künftig wieder jede hinzugefügte Datei. Das Rendering benutzt ohne Sprite die geometrischen Fallbacks.

## Git-Historie und Rechte

**Achtung:** Diese Löschungen entfernen Medien nur aus dem aktuellen Branch. Frühere Commits des bereits öffentlichen Repositories enthalten weiterhin die ursprünglichen Dateien und bleiben normalerweise abrufbar. Für eine vollständige Entfernung aus allen Git-Refs ist ein gesonderter, sorgfältig geplanter History-Rewrite samt Prüfung sämtlicher Klone, Forks, Tags, Actions-Artefakte und Caches erforderlich. Auch dadurch lassen sich bereits kopierte Dateien nicht zurückholen.

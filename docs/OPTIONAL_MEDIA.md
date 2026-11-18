# Optionale Medien nach Veröffentlichung

Die ehemals enthaltenen Audio- und Bilddateien wurden aus urheberrechtlicher Vorsicht zunächst entfernt. Die drei für Sojourn eigens generierten und vom Projektinhaber freigegebenen Charakterporträts (1, 4 und 5) sind aus der Git-Historie unverändert wiederhergestellt. Auch die 28 für Sojourn erstellten Schiffssprites (je sieben Frachter-, Miner-, Patrouillen- und Bergungsvarianten) wurden aus der Git-Historie bytegleich wiederhergestellt. Auch das für Sojourn erstellte Menü-Hintergrundbild `public/startscreen-background.webp` wurde unverändert aus der Git-Historie wiederhergestellt. Die übrigen entfernten Medien, insbesondere die früheren Audioaufnahmen, bleiben bis zur Rechteprüfung entfernt. Ohne solche optionalen Medien spielt Sojourn mit stummem Audio, Platzhalterporträts für nicht belegte Slots, dunklem CSS-Hintergrund und geometrischen Schiffsdarstellungen, wo kein Sprite verfügbar ist. Spielregeln, Schiffsdefinitionen und Hardpoints bleiben erhalten.

## Neue, rechtlich freigegebene Audiodateien einbauen

Lege die folgenden Dateien unter `public/audio/` ab. Beide sind optional:

- `public/audio/deep-space.ogg`: Hintergrundschleife
- `public/audio/spacecraft-rcs-thruster-burst.ogg`: Manöverdüsenimpulse

Alternativ `npm run audio:import-originals -- "<ambience.ogg|->" "<rcs.ogg|->"` verwenden. Der Import überprüft, dass die Datei einen Ogg-Header besitzt; `-` überspringt den jeweiligen Kanal. Die importierten Dateien dürfen nur verwendet werden, wenn ihre Veröffentlichung erlaubt ist.

Bei fehlenden Dateien sind die jeweiligen Kanäle stumm. Lautstärkeeinstellungen und die Auslöse-Logik bleiben erhalten.

## Porträts, Hintergrund und Schiffe

- Wiederhergestellte Porträts: `public/portraits/portrait-1.webp`, `portrait-4.webp`, `portrait-5.webp`; die Steckplätze 2 und 3 bleiben Platzhalter
- Wiederhergestellter Menü-Hintergrund: `public/startscreen-background.webp` (ursprünglicher WebP-Blob aus der Git-Historie, unverändert); ohne Datei bleibt die definierte dunkle Hintergrundfarbe
- Wiederhergestellte Schiffsgrafiken: alle 28 PNGs in `resources/ships/{freighter,mining,patrol,salvage}/`, unter den unveränderten Dateinamen `*-variant-01.png` bis `*-variant-07.png`. Die Originalblobs wurden ohne Bildbearbeitung übernommen.

Zukünftig hinzugefügte Schiffssprites müssen die vorhandenen Dimensionen und den Asset-Standard (Bug rechts, transparenter Rand, 4 px/m, kompatible Hardpoints) erfüllen; der Test `tests/assets/ship-asset-standard.test.cjs` validiert künftig wieder jede hinzugefügte Datei. Das Rendering benutzt ohne Sprite die geometrischen Fallbacks.

## Git-Historie und Rechte

**Achtung:** Diese Löschungen entfernen Medien nur aus dem aktuellen Branch. Frühere Commits des bereits öffentlichen Repositories enthalten weiterhin die ursprünglichen Dateien und bleiben normalerweise abrufbar. Für eine vollständige Entfernung aus allen Git-Refs ist ein gesonderter, sorgfältig geplanter History-Rewrite samt Prüfung sämtlicher Klone, Forks, Tags, Actions-Artefakte und Caches erforderlich. Auch dadurch lassen sich bereits kopierte Dateien nicht zurückholen.

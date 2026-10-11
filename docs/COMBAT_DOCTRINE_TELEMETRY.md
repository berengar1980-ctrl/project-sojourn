# Harrowdrift — Kampfpläne und Telemetrie

## Zwei Zeitebenen

1. **Doktrinwahl:** Jedes Schiff bewertet die eigene und gegnerische Bewaffnung, Schilde, Rumpf, Geschwindigkeit, Wendigkeit und Spezialfähigkeiten im Acht-Sekunden-Takt. Welches Schiff bei Kampfsekunde 0 bewertet, bestimmt der reproduzierbare Gefechts-Seed; die zweite Seite folgt bei Sekunde 4. Eine gute Doktrin darf über mehrere Takte bestehen bleiben.
2. **Bedingungsausführung:** In jedem Physikschritt prüft die KI die Voraussetzungen ihres aktuellen Plans: `reach_range` (Reichweite), `align_weapons` (Montage/Feuerwinkel), `fire` (Schießen). Wenn eine Voraussetzung nicht mehr gilt, springt die Phasenausführung zurück. Sicherheitssteuerung und Feuerleitung laufen weiter. Der Schilddurchbruch löst eine sofortige Neubewertung der Angriffsplanung aus.

Unterstützte Doktrinen sind Schildbrecher, Hüllenkampf, Distanzkontrolle, Breitseite, Antriebsabfang, Minenfeld, Traktorabfang und Flucht. Sie verwenden gemeinsame Bewegungs- und Schussroutinen statt eigener Physik.

## Diagnostik

Das Kampfmodell hält ein Ereignisprotokoll mit Zeitstempeln, Seitenzuordnung und Typen `start`, `plan`, `phase`, `impact` und `result`.

- `start` nennt den Seed, die zufällig zuerst analysierende Seite, Schiffsnamen, Modelle, Geschwindigkeit, Schild/Hülle und konkrete Waffen mit Reichweiten.
- `plan` nennt Doktrin, Begründung, Sollentfernung, Feuerfokus und den gegnerischen Schadenstatus.
- `phase` beschreibt erfüllte oder verlorene Voraussetzungen der aktuellen Kampfsequenz.
- `impact` nennt tatsächlich verursachten Schaden und gegebenenfalls betroffene Komponenten.
- `result` enthält Sieger beziehungsweise Fluchtausgang.

Mit **KAMPFLOG EXPORTIEREN** im Kampfbildschirm kann man die vollständige JSON-Telemetrie einschließlich abschließendem Snapshot herunterladen. Die Simulation stellt zudem `getCombatLog()` zur Verfügung. Snapshot-Ansichten begrenzen die Logeinträge für ein flüssiges Rendering auf die neuesten 80, ohne den vollständigen Export zu beschneiden.

Für automatisierte Duelle `npm run combat:simulate -- 16` ausführen. Der CLI-Lauf simuliert 16 seeded Railgun-gegen-Breitseite-Gefechte und gibt JSON mit Gesamtdauer, verursachtem Schaden, Siegerverteilung und Einzelresultaten aus. Zur Analyse mehrerer Simulationen denselben Seed für Reproduzierbarkeit verwenden; für Balance andere Seeds und andere Schiffs-/Waffenkombinationen gegentesten. Testbare Qualitätsmetriken: Phasenwechsel pro Minute, Abstand zum Sollbereich, Schüsse und Treffer je Waffe, Schilddurchbrüche, Fluchterfolg und Kampfdauer.

**Offen:** Feingranulare Geschoss-/Minenereignisse, vollständige Unterpläne für jede Doktrin und zusätzliche automatisierte Massen-Simulationen. Der vorliegende Ausbau etabliert den zentralen datengetriebenen Rahmen, ersetzt aber nicht sämtliche zukünftigen Verhaltensdetails.

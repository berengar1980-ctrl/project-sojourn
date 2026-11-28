# Verbindliche Architektur: gemeinsame lokale Flugphysik und Feldsimulation

Stand: 27.11.2026. Arbeitsbranch: `refactor/unified-field-flight-physics`.

Dieses Dokument ist der Arbeitsvertrag für die Umsetzung und die Übergabe an
neue Chats. Vor jeder Änderung vollständig lesen. Nicht als erledigt melden,
was nur analysiert, extrahiert oder teilweise migriert wurde.

## Ausgangspunkt und Referenzhierarchie

- Basis: Main nach PR #408, Commit `6babc77e520d5c30f49f6876fc325dd110a7d02a`.
- Sicherung vor #407/#408: `backup/pre-refactoring-2026-11-27`, Commit
  `ef2f3ac5f917cc61782079ad94c9e8ae56a43c4c`. Kein echter Tag angelegt.
- Priorität 1: PvP 1vs1 um PR #400, Main-Commit
  `3d15b80a3cbed44167e2a4afba4a3ff50f7286af`.
- Priorität 2: FleetCombat desselben historischen Stands.
- Priorität 3: zivile Kampagne (Asteroiden- und Wrackfelder), wenn die
  höher priorisierte Referenz eine Mechanik nicht enthält oder nicht geeignet ist.

Bei jeder Regel die gewählte Quelle und Abweichungen begründen. Kein globaler
Rollback auf #400; spätere Features und Fehlerkorrekturen bleiben erhalten.
Explizite Nutzeranforderungen (z. B. kleine Trümmer verdrängen statt abprallen)
haben Vorrang vor historischen Fehlern. Bei widersprüchlichen Spielregeln ohne
eindeutige Vorgabe Entscheidung offen dokumentieren, nicht stillschweigend ändern.

### Befund zum Start

Bytegleich zwischen #400 und neuem Main: `combat-inertial-thrust.ts`,
`strategic-combat-movement.ts`, `combat-ram-targeting.ts`,
`combat-route-steering.ts`, `combat-contact-response.ts`.
Die Kollisionsreaktion auf Asteroiden änderte sich in #402 (vor #407/#408);
eine stärkere Rückstoßwirkung ist plausibel, aber nicht dynamisch nachgewiesen.
Die Kampfrouten änderten sich mathematisch kaum; die Rammzielberechnung ist
bereits in #400 enthalten. Historisch heißt daher nicht automatisch fehlerfrei.

## Geltungsbereich

Lokale Karten: PvP 1vs1, FleetCombat, Kampagnenkampf und zivile Kampagne in
Asteroiden- und Wrackfeldern; Spieler, Miner, Berger, Frachter, Piraten,
Patrouillen, Drohnen und physische Feldobjekte. Auch Hintergrundsimulation
derselben Felder und Übergänge zwischen Kampf und Arbeit.

Sternkartenwirtschaft, Handel, übergeordnete Kampagnenlogik und globale
Navigation sind nicht Gegenstand dieses Arbeitsbranches. Bestehende Missionen,
Save/Load, Wirtschaftskreislauf und Ressourcenbestände dürfen nicht regressieren.

## Zielarchitektur

```text
Spielerauftrag       NPC-Auftrag       Kampftaktik
       |                  |                  |
       +------------------+------------------+
                          |
               Gemeinsame Navigation
              Route, Hindernisse, Prognose
                          |
              Gemeinsame Flugsteuerung
              Drehen, Schub, RCS, Bremsen
                          |
                 Eine einzige Physik
        Vektor, Masse, Trägheit, Impuls, Kontakt
                          |
             Ein autoritativer Feldzustand
              Schiffe, Asteroiden, Wracks
```

Die KI entscheidet WAS zu tun ist; Navigation und Flugsteuerung bestimmen
WIE. Der physische Integrator ist der einzige reguläre Besitzer der
Positions-, Geschwindigkeits- und Drehintegration. Kontaktauflösung,
physische Constraints, initiale Platzierung und staged Restore dürfen
Zustände nur über klar definierte Zuständigkeiten ändern. Kein Teleportieren
oder sofortiges Nullsetzen als normales Flugmanöver. Keine zweite Physik für
Spieler, NPC, Drohne, Bergung, Mining oder Kampf. Dieselben Eingaben
einschließlich Schiffsparametern, Crew, Zustand, Flugauftrag und Zeitschritt
müssen dieselben physischen Ergebnisse liefern.

Taktische Ziele, zivile Vorfahrt, Arbeitsreichweite, Boost-Freigabe,
Rammabsicht, Sensoraufträge, Waffenwinkel und unterschiedliche Ausrüstung
dürfen als explizite Eingaben/Policies variieren; sie dürfen keine verdeckte
zweite Physik etablieren. Parallel laufende native 1vs1 bleiben bestehen.
Jeder Actor und Feldkörper wird genau einmal pro vorgesehenem Teilzeitschritt
integriert; Paar-/Phasenbesitz verhindert doppelte Kontakte und Schäden.

## Was ausdrücklich nicht gewünscht ist

- Keine neue Engine, keine parallele Ersatzengine und keine neue Schicht, die
  die alten alternativen Implementierungen unverändert weiterbetreibt.
- Keine bloße Zusammenführung von Hilfsfunktionen als fertige Vereinheitlichung.
- Kein Modus-Flag, das bei identischen Bedingungen eine andere Physik auswählt.
- Keine direkten Positionsänderungen in KI, Wegpunktlogik oder Arbeiterlogik.
- Kein Verlust von Features, Crew-Boni, Waffenverhalten, RCS, Boost, Rückwärtsflug,
  Positionshaltung, Enter-/Traktor-/Rammmechanik, Mining-/Bergungsereignissen.
- Kein ungeprüftes Ändern von Kampfbalance, Schadenswerten, Ticks, RNG,
  Missionsabläufen oder Ressourcenmengen zur Behebung von Tests.
- Keine großen fachfremden Erweiterungen oder unnötigen Adapter/Manager.
- Keine abgeschwächten, gelöschten oder auf das neue Fehlverhalten umgeschriebenen
  Tests, nur damit CI grün wird. Geänderte Erwartungen müssen fachlich begründet
  und durch erlaubte Verhaltensänderungen gedeckt sein.
- Kein Merge ohne ausdrückliche Freigabe und grüne erforderliche Prüfungen
  des tatsächlichen PR-Heads. Keine falsche Fertigmeldung.

## Arbeitspakete und verbindliche Abnahme-Checkliste

Alle folgenden Punkte sind offen. Die Paket-IDs sind stabil.
Abhaken erst nach Erfüllung sämtlicher Kriterien des jeweiligen Pakets und
Eintrag der Nachweise in den Nachweisblock. Teilfortschritt wird im Arbeitslog
festgehalten, nicht mit einem Haken. Reihenfolge grundsätzlich F01 bis F08;
Abhängigkeiten können gemeinsame kleine Migrationsschritte erfordern.

### F01 – Physischer Schiffszustand

- [ ] F01 Gemeinsamer physischer Schiffszustand

PvP als Referenz: Position, vollständiger XY-Geschwindigkeitsvektor,
Ausrichtung, Drehgeschwindigkeit, RCS-/Schubzustand. Geschwindigkeit ist
abgeleitet (vorzeichenbehafteter Längsanteil nur als Projektion); keine zweite
autoritative Geschwindigkeit. Schiffsmasse und physische Abmessungen zentral
aus Definitionen, soweit vorhanden. Fehlende Parameter vor Festlegung prüfen.

Inventar: `src/core/local-space-types.ts` (LocalShipState),
`src/systems/combat/strategic-combat-types.ts` (MutableCombatant),
`src/systems/local-space/local-space-ship-velocity.ts`, NPC-Feldzustände,
Drohnenzustand und Feldbrücken. Vorher alle Konstruktoren, Schreibstellen,
Checkpoints, Snapshots und Restore-Aufrufer erfassen. Ein gemeinsamer Vertrag,
keine dauerhaft parallelen Vektoren oder abgeschnittene seitliche Geschwindigkeit
bei Kampfbeitritt/-ende. Save-Owner und Migration/staged Restore prüfen.

Abnahme: Start-/Endzustände und Geschwindigkeitsvektoren bei Moduswechsel,
Save/Load und parallelen Duellen bleiben korrekt. Alte Zustandskonvertierungen
sind gelöscht oder nachweislich reine Daten-/UI-Adapter.

### F02 – Gemeinsame Flugsteuerung und Triebwerksphysik

- [ ] F02 Gemeinsame Flugsteuerung und Triebwerksphysik

Referenz: `src/systems/combat/combat-inertial-thrust.ts` (applyInertialThrust)
und `strategic-combat-movement.ts` (performCombatThrust), #400.
`src/systems/ships/ship-stats.ts` liefert bereits gemeinsame Bewegungswerte.

Übernehmen/extrahieren statt neu erfinden: Drehung, Hauptschub, Beschleunigung,
Trägheit, Verzögerung/Gegenschub, RCS-Translation, Boost/Ramp, Traktorassistenz,
Drift bei Energie-/Triebwerksausfall und Feldgrenzen. PvP-Konstanten zunächst
bewahren; fehlende Rückwärtskorrektur, Stationshaltung und präzises Stoppen
aus der zivilen Referenz als Befehle an dieselbe Physik überführen.
Auftragsbefehle können Zielausrichtung und Bewegungsrichtung unabhängig
vorgeben, ebenso Zieldrehung und Sollgeschwindigkeit/Stop.

Ablösekandidaten: `local-space-autopilot.ts` (advanceForwardRoute,
advanceReverseCorrection, faceAutopilotTarget, resetAutopilotMotion),
`field-ship-routing.ts` (moveFieldShip), `npc-worker-primitives.ts`
(moveToward), lokale Stationshaltung, Miner-/Berger-Arbeitspositionierung,
Piraten-/Patrouillen-/Drohnenbewegung, Distress-Navigation.
Jede verbleibende Schreibstelle erfassen und begründen. Taktische
Waffenausrichtung, Boost-Entscheidung und zivilen Auftrag nicht entfernen.

Abnahme: gemeinsamer Integrator und gemeinsame Flugsteuerung in allen Modi;
kein eigener ziviler Integrator mehr. Gleiches Schiff bei gleichem Befehl:
gleiche Beschleunigungs-, Brems-, Dreh-, RCS- und Driftkurve einschließlich
Rückwärtsfahrt, Stoppen, Positionshaltung, Boost, Traktor und Ausfall.
Präzises Anfliegen ohne Positionssprünge; RCS-Anzeige folgt echter Bewegung.

### F03 – Kollisionsphysik und Hindernisklassifizierung

- [ ] F03 Gemeinsame Kontaktphysik und Hindernisklassifizierung

Nutzerziel: kleine Asteroiden und Wrackteile werden verdrängt, das Schiff
verliert dabei nicht abrupt seine Fahrt; keine Routenumwege um kleine Trümmer.
Große Asteroiden und massive Wracks bleiben Hindernisse; das Schiff verliert
abhängig vom Massenverhältnis und Kontakt Geschwindigkeit oder prallt ab.
Masse, Trägheitsmoment, Kontur, Rotation und `routeBlocking` sind unabhängig
vom Modus; nicht aufgrund von `kind` beim Kampfbeitritt neu festlegen.
Ressourceninhalt ist nicht dasselbe wie physische Hinderniseigenschaft.

Grundlagen: PvP-Kontaktgeometrie und vorhandene massenabhängige Impulsrechnung
in `local-space-collision.ts` (resolvePairImpulse, separatePair), bestehende
compound-contact-/Schild-/Hüllengeometrie. Schild- und Hüllenkontakt können
unterschiedliche Formen und Schadensparameter haben; ein Impuls-/Kontaktkern.

Ablösekandidaten: `combat-asteroid-contacts.ts` (zusätzlicher massenunabhängiger
Rückstoß), `combat-asteroid-motion.ts` (Masse-/Trägheitsmultiplikation),
`field-debris-contact.ts`, `security-drone-debris-contact.ts`,
`security-drone-solid-contact.ts`, `combat-bystander-contacts.ts`,
`combat-contact-response.ts`, `ship-shield-collision.ts`,
`distress-ramming-physics.ts`, `salvage-shield-contact.ts`.
Nicht blind Dateien löschen: fachliche Kontaktgeometrie, Schadensparameter,
Feedback, Paaransprüche und Arbeitseffekte erhalten.

Abnahme: identische Kontakte in allen Modi, kleine/massive Körper, gleiche
Masse, stehende und bewegte Partner, schräge Kontakte (Tangentialbewegung),
Schild an/aus, Drohnen, Rammen, Wracks, Kettenkontakte, Grenzen, keine
Doppelimpulse und kein zusätzlicher Schaden beim Moduswechsel.

### F04 – Gemeinsame Navigation

- [ ] F04 Gemeinsame Navigation und Hindernisvermeidung

PvP `combat-asteroid-routing.ts` / `combat-route-steering.ts` als bevorzugte
Grundlage; vorhandene zivile Gittersuche in `local-space-navigation.ts` als
Fallback bei komplexen Hindernissen, nicht als paralleler Modusplaner.
Einheitliche Hindernis-/Konturabfrage, Sicherheitsabstände anhand realer
Geometrie, Prognose mit tatsächlichem Vektor und Bremsweg, gebundene
Ausweichwegpunkte, Fortschrittsüberwachung, sichere blockierte Routen.
Ein gemeinsamer Planer darf unterschiedliche Suchverfahren nach Situation
wählen; weder PvP noch ziviler Modus dürfen eigene Ersatzphysik besitzen.

Ablösekandidaten: `field-ship-routing.ts`, `local-space-autopilot-hazards.ts`,
`field-traffic-priority.ts`, `distress-navigation.ts`,
`local-space-wreck-navigation.ts`, `salvage-work-navigation.ts`.
Zivile Vorfahrt und taktische Absicht sind Policies. Absichtlicher Rammkurs
darf das Ziel, nicht andere Hindernisse, aus der Vermeidung ausschließen.
Tor-/Ausflugregeln, Arbeitsabstände und Zielbelegung erhalten.

Abnahme: freie, dichte und blockierte Felder, bewegte Hindernisse, Gegenverkehr,
Ausfahrt, kleine Trümmer ohne Detour, große Hindernisse sicher umfliegen.
Kein Durchreichen einer erwiesenermaßen blockierten Endroute; weniger
ungewollte Großkörperkontakte ohne Verschlechterung von Flugleistung.

### F05 – Kampftaktik und Manöver

- [ ] F05 Kampfmanöver und Rammverhalten

PvP #400 zuerst: Frontal-/Breitseitenangriff, Angriffspassagen, Distanzkampf,
Flucht, Minen, Traktor, Entermanöver und Waffenwinkel erhalten.
`combat-flight-intent.ts`, `combat-ram-targeting.ts`,
`combat-route-steering.ts`, `strategic-combat-movement.ts` prüfen.
Rammen gezielt verbessern: Abfangen statt endloser Verfolgung; bei Bedarf
Seitwärtsgeschwindigkeit abbauen, RCS-Ausrichtung, Abfangkurs festlegen,
Schub geben, nach verfehltem Anflug neu ausrichten. Keine alternative
Rammphysik. Historische Taktik nicht pauschal austauschen.

Abnahme: Replays für alle bestehenden Taktiken plus beidseitiges Rammen,
manövrierendes Ziel, Hindernisse, Abbruch und erneuten Ansatz. Messen:
Treffer/Rammquote, Dauer des Kreisflugs, Kollisionen mit großen Hindernissen,
Zeit in Waffenreichweite, Waffennutzung, Flucht und Entererfolg.
Unbeabsichtigte Balanceänderungen separat ausweisen.

### F06 – Gemeinsame Schiffs-, Crew- und Systemparameter

- [ ] F06 Gemeinsame Schiffs- und Systemparameter

Ein Konfigurationspfad aus Rumpf, Komponenten, Crew, Schäden und Energie.
Bestehende `ship-stats.ts`, `ship-runtime.ts`, Crew-Skill-Formeln und
`combatSensorStats` verwenden. Separate Aufbaupfade in
`game-controller-combat.ts`, `npc-combatant-setup.ts`,
`duel-combatant-setup.ts` ablösen/reduzieren. Gleiche Crew-Werte wirken gleich,
NPCs dürfen andere Werte haben. Schilde, Schildregen/-sperren, Hülle,
gerichtete Panzerung, Schadensüberlauf je Schadensart, Waffen/Minen,
Sensoren, Subsysteme und Energieüberlastung/-ausfall prüfen.
Doppelte Schadenswerte und Initialisierung klären; keine stillen Balanceänderungen.
PvP-Regeln bevorzugen; fehlende Mechaniken aus nächster Referenz ergänzen.

Abnahme: gleiche Ausrüstung/Crew ergibt gleiche Werte und Auswirkungen;
Schild-/Hüllenzustand bleibt über Kampfgrenzen erhalten. Treffer und
Ausfallregeln über dieselben Funktionen; bewusst abweichende Parameter
dokumentiert. Keine neue zweite Komponenten- oder Crew-Berechnung.

### F07 – Ein autoritativer physischer Feldzustand

- [ ] F07 Gemeinsamer Feldzustand und einmaliger Tick

Kampf ist eine Auftrags-/Taktikänderung innerhalb eines Feldes, kein
Wechsel in eine unabhängig simulierte physische Kopie. Bestehende native
1vs1 und Fleet-Koordination behalten. `field-combat-arena.ts`,
`combat-asteroid-motion.ts`, `parallel-native-duels.ts`,
`native-fleet-advance.ts`, `field-contact-authority.ts`, Feldbrücken,
`salvage-container-motion.ts` und Wreck-Lifecycle prüfen.
Gemeinsame Referenzen statt gegenseitiger Zustandskonvertierungen,
wo tatsächlich möglich. Beobachtende UI-Snapshots bleiben erlaubt.

Abnahme: Position, Geschwindigkeitsvektor, Rotation, Masse, Objekt-ID,
Ressourcen, Schild und Hülle bleiben bei Kampfbeitritt/-ende erhalten.
Ein Teilzeitschritt pro Actor/Körper, ein Paarimpuls je Kontaktphase,
auch bei parallelen und unabhängigen Gefechten. Aktives und nicht
angezeigtes Feld gleich behandeln; zerstörte/geworfene Objekte dürfen
nicht wieder erscheinen. Kampfwracks behalten Bergungsfähigkeit und Zustand.
Checkpoint und Restore mit bestehender Persistenzarchitektur.

### F08 – Lokale Arbeit, Traktor, Andocken und Darstellung

- [ ] F08 Gemeinsame lokale Arbeit und Darstellung

Mining und Bergung: Spieler/NPC teilen physische Anfahrt, Scanzeit und
Reichweiten, Arbeitsposition, Stationshaltung, Werkzeug-/Crew-Berechnung,
Arbeitszyklen, Ertrag, Ressourcenaufnahme, Kampfunterbrechung/-fortsetzung
und vollen Frachtraum. Unterschiedliche Werkzeuge, Erträge und Events bleiben
als fachliche Parameter. Traktor, Werfen, Abschleppen, Greifhaken und Andocken:
gemeinsame Kraft-/Constraint-Grundlage; Waffen- und Missionsregeln erhalten.
`distress-tow-physics.ts`, `combat-grapple-physics.ts`, Traktorpfade,
Mining-/Salvage-Services und NPC-Worker prüfen.

Darstellung: gemeinsame vorhandene Schiffs-, Schild-, Treffer-, RCS-,
Haupttriebwerks-, Wrack-, Asteroiden-, Drohnen-, Scan-, Kamera- und
Selektionsrenderer nutzen; keine neue Renderer-Engine. Feldspezifische
Overlays bleiben. Effekte werden aus tatsächlichem physischem Zustand
abgeleitet, nicht aus einer zweiten simulierten Bewegung.

Abnahme: gleiche Werkzeug-/Crew-Eingaben und Arbeitsbedingungen ergeben
gleiche Leistung; Ressourcenbilanz bleibt korrekt. Abbruch/Weiterarbeit,
Distress-/Abschlepp-/Enterabläufe und vollständige betroffene Missionen prüfen.
Keine verschwundenen Effekte, keine Skalierungs-/Zoomregression.

## Bereits gemeinsame Grundlagen: behalten, nicht neu bauen

Native 1vs1-Kampfschritte, Fleet-Koordination paralleler Duelle, native
Waffenverarbeitung, gemeinsame Asteroiden-/Wrackgeneratoren, Rock-to-Rock-Löser,
Schild-/Kontaktgeometrie, Feldverkehrsabfragen, Paarzuständigkeit,
Schiffsdefinitionen/Hardpoints, Crew-Bonusformeln, taktische Sensorwerte,
gemeinsame Mathematik und RNG, bestehende Renderer, Tests, Persistenzregeln.
Sie sind nicht automatisch ein Nachweis, dass alle Aufrufer vereinheitlicht sind.

## Verbindlicher Arbeits- und Prüfprozess

Vor jedem Paket: Ist-Aufrufer und direkte Zustands-Schreibstellen inventarisieren;
Quellreferenz und Zielregel festlegen; vorhandene Features und bewusste
Ausnahmen dokumentieren; Baseline-Replays/Tests sichern. Kein Implementieren
auf bloßen Annahmen. Nach jedem Paket die ursprünglichen Implementierungen
wirklich ersetzen/entfernen und sämtliche Aufrufer erneut prüfen.

### Drei unabhängige Nachweise

1. Architektur: gemeinsame Produktionsfunktion benennen, alle Modi und
   Aufrufer belegen, entfernte bzw. reduzierte Implementierungen benennen.
   Erlaubte Adapter dürfen nur Eingaben/Outputs übersetzen, keine Physik.
2. Verhalten: deterministische Vergleichstests mit gleichen Schiffs- und
   Crew-Werten, Position, Geschwindigkeit, Umgebung, Auftrag, dt und Seed
   in PvP, FleetCombat, Kampagnenkampf und zivilem Feld; Spieler und NPC,
   Mining und Wrackfeld. Physikwerte mit begründeter Toleranz vergleichen,
   keine reine Stringsuche oder alleiniger Unit-Test des Helpers.
3. Regression: #400-Replays (unveränderte Regeln) und aktuelle Main-Baseline
   (spätere Features) vergleichen. Absichtliche Änderungen separat bewerten.
   Reale Missions-/Arbeitsabläufe, Persistenz, Ressourcen und Performance
   prüfen. Quality Gate, Browser-Restart sowie passende integrierte
   Simulationen auf dem tatsächlichen Head. Bei CI-Fehlern Logs zuerst.

Vergleichsmatrix: Beschleunigen, Bremsen, Drehen, RCS, Rückwärtsfahrt,
Positionshaltung, Boost, Ausfall, kleine/große Körper, Schiffskontakte,
Flanken/Passagen/Flucht/Rammen/Entern, Arbeitsanflug, Kampfwechsel und Restore.
Alle betroffenen Fälle müssen jeweils aus den tatsächlichen Produktionspfaden
laufen. Gleicher Input und dt, keine taktisch unterschiedlichen Befehle
fälschlich als Physikabweichung werten. Zusätzlich eine Vollständigkeitsprüfung
der Schreibstellen (AST bzw. gezielte Codeprüfung) gegen eine begründete
Allowlist einführen; spätestens mit F02/F03 als ausführbarer Architekturtest.
Die Liste darf keine alten Modusintegratoren dauerhaft freistellen.

### Produktivcode-Bilanz

Baseline ist Main nach #408. Pro Paket und kumulativ erfassen:

```sh
git diff --numstat 6babc77e520d5c30f49f6876fc325dd110a7d02a...HEAD -- src/
git diff --stat 6babc77e520d5c30f49f6876fc325dd110a7d02a...HEAD -- src/
```

Tests, Dokumentation und Prüfskripte getrennt ausweisen. Ziel ist möglichst
wenig doppelte Implementierung und langfristiger Nettoabbau des Produktivcodes,
keine willkürliche Löschquote. Neue zentrale Implementierungen nur wenn nötig;
temporäre Adapter mit Entfernungskriterium. Nettozuwachs pro Paket erklären,
keine fertig gemeldete Migration mit alten Alternativpfaden. Am Ende tatsächliche
entfernte Funktionen/Dateien, neue Zeilen, gelöschte Zeilen, Netto ausweisen.

### Nachweise pro abgehaktem Paket

Für jedes fertige Paket muss je eine Zeile pro Schlüssel eingetragen werden
(z. B. F01). Der automatische Dokumentcheck verlangt diese sechs Nachweise,
verifiziert aber nicht ihre fachliche Wahrheit. Testpfad muss existieren.
Die sechs Schlüssel sind:

- code: Gemeinsame Produktionspfade und Funktionen, alle Modus-Aufrufer.
- removed: Entfernte Implementierungen, verbleibende Adapter und Begründung.
- test: Mindestens ein konkreter Pfad unter tests/ mit Endung .test.cjs.
- ci: Tatsächliche erfolgreiche CI mit Commit/Run und relevanten Tests.
- loc: Produktivcode additions/deletions/netto sowie Begründung.
- parity: Verhaltensvergleich, Feature-/Save-Erhalt, erlaubte Ausnahmen.

Format der Nachweiszeilen: `- F01 code: ...` usw. Keine Platzhalter,
keine erfundenen Nachweise, keine Haken bei bloß grünem Build.
Die Testpfadprüfung ist nur ein Mindestschutz; die tatsächlichen
Verhaltenstests und Architektur-Tests sind zwingend.

## Nachweisblock

Noch keine Paketnachweise. F01 ist lokal umgesetzt und verifiziert, aber wegen
ausstehender Branch-CI nicht abgenommen. Kein Paket abgeschlossen.

## Arbeitslog und Übergabe an neue Chats

- 28.11.2026: F01 bleibt offen. Gemeinsamer `PhysicalShipState` enthält
  Position, Heading, XY-Geschwindigkeit und Dreh-/Schubzustand. `speed` ist
  überall abgeleitet; lokale Spieleranzeige nutzt die signierte
  Vorwärtsprojektion, Kampfsnapshot und NPC-Reisewert die Vektormagnitude.
  Feldkampf startet und endet mit vollständig kopierten Bewegungswerten.
  Checkpoint-Restore normalisiert ältere skalare Saves in Vektoren und ergänzt
  fehlende Manövrierwerte mit null: Combat-, Sektor-NPC-, lokale Piraten-,
  Miner- und Drohnenstände. Ein Verhaltensvergleich entdeckte und behob die
  seitliche Drift-Dämpfung beim Combat-Rücklauf nach dem Stationshalt-Reset.
  Tests verifizieren den Combat→Local-Space-Rundlauf, Checkpoint-Parität,
  parallele Duelle und Alt-Save-Migration. `npm run check:quick` lief mit 405
  Tests und null Fehlern; `npm run build` lief erfolgreich. Vite meldete die
  bestehende Warnung zum 1,2-MB-JavaScript-Bundle. Commit `3b4d5908` liegt auf
  `refactor/unified-field-flight-physics`. Der Push an `origin` wurde von der
  automatischen Prüfregel abgelehnt, weil er Projektquellcode an das nicht
  verifizierte GitHub-Remote übertragen würde; deshalb gibt es für diesen
  Commit noch keine Branch-CI. Main wurde nicht verändert.
  Produktionsquellstand dieses Commits gegenüber seinem Branch-Parent: 851
  hinzugefügt, 390 entfernt, netto +461 Zeilen. Dieser Zuwachs ist die
  gemeinsame Zustands-/Save-Migration und extrahierte Helfer; kein
  Paketabschluss. Für F03 bleibt die Massenregel offen: `ShipDefinition`
  hat keine Hull-Masse und Collision-`pushWeight` ist kein bestätigtes Maß;
  keine Masse oder Rotationsinertie erfunden.
- 27.11.2026: F01 in Bearbeitung, noch nicht abgenommen. `PhysicalShipState`
  vereinheitlicht Position, Heading und XY-Geschwindigkeitsvektor;
  `ManeuveringShipState` ergänzt gemeinsame Dreh- und Schubfelder für
  bewegungsfähige Schiffe. Spieler-
  Local-Space, native Combatants, NPC-Sektor-Kampfzustände, lokale Miner,
  Bergungsschiffe, Piraten und Sicherheitsdrohne führen ihre Translation nun
  als Vektor; `speed` wird daraus abgeleitet. Feldkampf- und zivile
  Checkpoint-Übergänge übertragen den Vektor. Ältere NPC- und Drohnen-Checkpoints
  ohne Vektor werden aus Heading und bisheriger Geschwindigkeit migriert.
  `moveFieldShip` schreibt den Vektor statt eines separaten Skalars.
  Gemeinsame NPC-Pose-/Cruise-Speed-Helfer und Salvage-Kontaktauflösung aus den
  Services extrahiert; alle betroffenen Services bleiben unter der
  500-Zeilen-Grenze. Combat-Checkpoint-Restore akzeptiert historische
  Skalarzustände und überführt sie beim Laden in Vektoren. Produktionscode-Diff
  seit Branch-HEAD bis hier: 493 hinzugefügt, 372 entfernt, netto +121 Zeilen.
  Vergleichs-/Regressionstests: `tests/combat/shared-physical-velocity.test.cjs`,
  `tests/persistence/career-local-pirate-checkpoint.test.cjs`,
  `tests/persistence/career-local-miner-checkpoint.test.cjs`,
  `tests/operations/local-pirate-shared-routing.test.cjs`,
  `tests/local-space/local-combat-pirate-visibility.test.cjs`,
  `tests/local-space/local-pirate-background-continuity.test.cjs`,
  `tests/operations/background-drone-security.test.cjs`,
  `tests/operations/security-drone-solid-contacts.test.cjs`,
  `tests/operations/security-drone-debris-shield-mk3.test.cjs`,
  `tests/persistence/career-security-drone.test.cjs` und
  `tests/combat/security-drone-combat-pose-visual.test.cjs` liefen erfolgreich.
  Typecheck, Lint, Dependency-/Persistence-Check sowie gezielte Combat-, NPC-,
  Salvage-, Piraten- und Drohnen-Checkpoint-Tests liefen erfolgreich. Im
  Folgeeintrag vom 28.11.2026 stehen der aktuelle Gesamtlauf und Build.
  Inventarprüfung:
  `ShipDefinition` enthält nominale Länge, aber keine Hull-Masse; die bisherige
  Collision-`pushWeight`-Policy ist kein nachgewiesenes Massenmaß. Keine neue
  Masse oder Rotationsinertie erfunden. Offene Abnahmebedingung: tatsächliche
  Branch-CI. Keine zentrale Hull-Masse vorhanden; eine Massenregel wird nicht
  ohne Mechanikentscheidung ergänzt.
- 27.11.2026: PR #408 gemergt; Main 6babc77 geprüft. PR #409 ist ein
  separater Audit-PR, nicht Produktionsbasis. Sicherungsbranch vorhanden.
- Historische Referenz #400 identifiziert; erste statische Vergleiche erfolgt.
- Nächster Schritt: Zustimmung zum Push dieses Commits auf genau diesen Branch
  einholen, Branch-CI ausführen und deren Ergebnis dokumentieren; danach erst
  F02 beginnen.
- Bei jedem Arbeitsstand ergänzen: Datum, Commit/PR, Paket, konkret geänderte
  Dateien/Funktionen, entfernte Pfade, offene Aufrufer, neue/entfernte src-Zeilen,
  tatsächlich gelaufene Tests, CI-Ergebnis, Risiken und nächster Schritt.
  Nicht gelaufene Prüfungen ausdrücklich als nicht geprüft markieren.
- Neuer Chat: zuerst AGENTS.md und dieses Dokument lesen, Branch/HEAD/CI
  verifizieren, Nachweisblock und letzten Logeintrag prüfen, am nächsten
  offenen Schritt weiterarbeiten. Nicht eigenmächtig Main oder Backup ändern.

Weiterhin gelten `docs/ARCHITECTURE.md`, `docs/COMBAT_AI_TARGET_ARCHITECTURE.md`,
`docs/CAREER_PERSISTENCE.md`, `docs/SOJOURN_FEATURE_PARITY.md` und AGENTS.md.
Bei Konflikten zwischen alter Feature-Parität und diesem Auftrag die
konkrete Differenz dokumentieren, nicht verdeckt alte Unterschiede bewahren.


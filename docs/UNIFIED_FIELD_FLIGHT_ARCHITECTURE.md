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

Die Paket-IDs sind stabil. Der Status steht je Paket in der Checkliste.
Abhaken erst nach Erfüllung sämtlicher Kriterien des jeweiligen Pakets und
Eintrag der Nachweise in den Nachweisblock. Teilfortschritt wird im Arbeitslog
festgehalten, nicht mit einem Haken. Reihenfolge grundsätzlich F01 bis F08;
Abhängigkeiten können gemeinsame kleine Migrationsschritte erfordern.

### F01 – Physischer Schiffszustand

- [x] F01 Gemeinsamer physischer Schiffszustand

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

- [x] F02 Gemeinsame Flugsteuerung und Triebwerksphysik

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

- [x] F03 Gemeinsame Kontaktphysik und Hindernisklassifizierung

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

F03-Audit, 28.11.2026 (in Arbeit): Asteroid-gegen-Asteroid nutzt bereits
`local-space-collision.ts` in Kampagne und Combat. Der Combat-Adapter veränderte
aber Ressourcenmassen beim Moduswechsel, teilte die Felsreaktion zusätzlich
durch eine Art-Widerstandszahl und wendete auf das Schiff einen festen Faktor
`1.15` an. Die zivile Schildauflösung übertrug Impuls nur auf den Fels; freie
Feldtrümmer verwendeten einen festen Mindestkick `5`/Faktor `1.15`.
Schiffkontakte nutzten `pushWeight` oder getrennte Impulsregeln.

Massenentscheidung nach Nutzerfreigabe, 28.11.2026: `ShipDefinition` hat keine
Rumpfmasse. Die gemeinsame effektive 2D-Schiffsmasse wird daher aus der
strukturierten metrischen Rumpfellipse berechnet:
`π × combatHullRadii.radiusX × combatHullRadii.radiusY × 5.8`. Die Referenzdichte
`5.8` stammt aus den natürlichen Ressourcenasteroiden des bestehenden
Feldgenerators. Länge und Schild-Hardpoints/Geometrie kommen aus den Schiffs-
und Schirmdaten; Bildpixel oder Silhouetten werden nicht ausgewertet. Die
Formel gilt für Spieler, NPCs und Kampfadapter gleichermaßen. Asteroiden behalten
ihre vorhandene, material-/wrackabhängige Masse, Schwerpunkt-, Rotations- und
Trägheitsdaten; ein Kontaktimpuls ändert auch ihre Rotation am Kontaktpunkt.
Schiffe führen keine separate physische Spin-Geschwindigkeit, daher erzeugt
dieses Paket keine neue Drehmechanik für Schiffe.

F03-Umsetzung, noch nicht abgenommen: ein gemeinsamer Kern verteilt Trennung
und Normalimpuls nach inverser Masse. Kampagne, PvP, Feld-NPCs, leichte Trümmer,
Schiffs-Paare, gemischte PvP/Feldkontakte, Drohnen und die kinematische
Distress-Rammaktion verwenden denselben Kern. Leichtes Material wird aus seiner
vorhandenen Masse verdrängt und überträgt den Gegenimpuls auf das Schiff;
massive Körper bewegen das Schiff stärker. `routeBlocking` wird als physische
Eigenschaft vom Feld in Combat kopiert; `kind` bleibt Material-/Darstellungs-
information. Nur historische Combat-Snapshots ohne das neue optionale Feld
verwenden den Legacy-Fallback. Kampf- und zivile Schadensparameter,
Schild-/Hüllenfeedback, Ramm-Cooldown und Paaranspruch bleiben getrennte
Gameplay-Policies und werden nicht doppelt ausgelöst.

Abnahme am 28.11.2026: `npm run format:check`, `npm run lint`,
`npm run typecheck`, `npm run deps:check`, `npm run persistence:check`,
Quick Suite (410/410) und `npm run build` bestanden. Der neue direkte
Produktionspfadvergleich deckt identische zivile und Combat-Asteroidenkontakte,
Schiff-/Felsposition und XY-Geschwindigkeit sowie Tangentialerhaltung ab;
weitere vorhandene Regressionen decken Schilde, Drohnen, NPCs, Wracks,
Salvage, Navigation, Grenzen, Paaransprüche und Checkpoints ab. Der historische
PvP-1vs1-Replay-Hash blieb exakt; die F03-Massen-/Kontaktregressionen und beide
GitHub-Actions-Workflows auf PR-Head `e3346c047b44fe8daf9bdd605bf321ea2ea552fd`
bestätigen die Abnahme. Die unveränderten Schadens-/Feedback-Policies und die
gemeinsame Feldkörperklassifizierung wurden ebenfalls durch die vollständige
Regressionstests geprüft.

### F04 – Gemeinsame Navigation

- [x] F04 Gemeinsame Navigation und Hindernisvermeidung

PvP `combat-asteroid-routing.ts` / `combat-route-steering.ts` als bevorzugte
Grundlage für den schnellen Flankenversuch; vorhandene zivile Gittersuche in
`local-space-navigation.ts` bleibt gemeinsamer Fallback bei komplexen
Hindernissen, nicht als paralleler Modusplaner.
Einheitliche Hindernis-/Konturabfrage, Sicherheitsabstände anhand realer
Geometrie, Prognose mit tatsächlichem Vektor und Bremsweg, gebundene
Ausweichwegpunkte, Fortschrittsüberwachung, sichere blockierte Routen.
Ein gemeinsamer Planer darf unterschiedliche Suchverfahren nach Situation
wählen; weder PvP noch ziviler Modus dürfen eigene Ersatzphysik besitzen.

Ablösekandidaten: `field-ship-routing.ts`, `local-space-autopilot-hazards.ts`,
`field-traffic-priority.ts`, `local-space-wreck-navigation.ts`,
`salvage-work-navigation.ts`.
Zivile Vorfahrt und taktische Absicht sind Policies. Absichtlicher Rammkurs
darf das Ziel, nicht andere Hindernisse, aus der Vermeidung ausschließen.
Tor-/Ausflugregeln, Arbeitsabstände und Zielbelegung erhalten.

Abnahme: freie, dichte und blockierte Felder, bewegte Hindernisse, Gegenverkehr,
Ausfahrt, kleine Trümmer ohne Detour, große Hindernisse sicher umfliegen.
Kein Durchreichen einer erwiesenermaßen blockierten Endroute; weniger
ungewollte Großkörperkontakte ohne Verschlechterung von Flugleistung.

F04-Audit und Implementierung, 28.11.2026 (abgenommen): Die PvP-Zwei-
Flanken-/10-Hop-Suche ist jetzt der gemeinsame schnelle erste Versuch in
`local-space-navigation.ts`; komplexe Felder fallen auf dessen gemeinsame
44-m-A*-Suche zurück. Combat behält persistente taktische Routenbindung,
verwendet aber denselben Planer und gemeinsame Segmentgeometrie. Fehlgeschlagene
Routen ergeben keine Gerade durch ein Hindernis. Combat projiziert reale
Asteroidenvektoren bis zum aus Schiffsgeschwindigkeit und Beschleunigung
berechneten Bremszeitpunkt. Feld-NPCs verwenden den gemeinsamen Segmentcheck;
Patrol behält den begrenzten Sichtgraphen als Performance-Ausnahme. Verkehr
behält Vorfahrt und relative Swept-Step-Regeln. Der zivile Autopilot behält
Crew-/Sensorwarnungen und seine Zeit-bis-Kreuzung-Gefahrenpolicy. Salvage plant
Distress-Wrack und Verkehr jetzt gemeinsam; die Einzelkreis-Implementierung
`distress-navigation.ts` ist entfernt. Die identischen Kampf-/Zivilpfade,
bewegte Hindernisse, blockierten Ziele, Combat-Dichte und Distress-/Verkehrs-
Kombination werden durch Produktionspfadtests verglichen.

Wiederaufnahme am 28.11.2026: Der Route-Planer wurde in
`local-space-route-flanks.ts` aufgeteilt, damit das Navigationsmodul unter der
500-Zeilen-Grenze bleibt. Salvage akzeptiert jetzt auch einen vom Planer als
`compromised` markierten, aber tatsächlich geplanten A*-Weg statt bei jeder
reduzierten Sicherheitsmarge die Anfahrt neu zu starten. Die erste gemeinsame
A*-Combat-Variante veränderte den historischen #400-Replay und verhinderte im
dichten Asteroidenfeld einen Angriffsdurchflug. Die Ursache war nachweislich
der abweichende Combat-Anflugpfad. Combat verwendet nun den bereits gemeinsam
genutzten PvP-Flanken-/10-Hop-Algorithmus und gemeinsame Segmentgeometrie;
bewegte Asteroiden werden für die Planung weiterhin mit ihrem echten Vektor
projiziert. Die Notausweichflanke bleibt erhalten. Damit bestehen der
Combined-Battle-Replay (alle drei Seeds), der dichte Asteroidenkampf und der
neue Combat-/Zivil-Routenparitätstest.

Lokale Abnahme am 28.11.2026: `npm run check:quick` bestanden — Format, Lint,
Typecheck, Dependency- und Persistenzprüfung sowie 411/411 Tests. `npm run
build` bestanden; Vite meldet weiterhin die bestehende Chunk-Warnung für das
1,22-MB-JavaScript-Bundle. Nach der Aktualisierung dieses Arbeitsnachweises
bestanden `npm run format:check`, `git diff --check` und der
Architektur-Dokumentationstest. Die erste CI-Runde fand die fehlende
Persistenzklassifizierung für `local-space-route-flanks.ts`; die Einstufung
als `derived` und der Persistenz-Auswirkungsvermerk sind ergänzt. Auf PR #410
bestand der korrigierte Stand `a3983b83` Quality Gate Run 1974 mit Format,
Lint, TypeScript, Dependency- und Persistenzprüfung, 411/411 Tests,
Drei-Tage-Wirtschaftssmoke und Produktionsbuild. Career-Browser-Restart Run
1189 bestand ebenfalls. Damit sind die F04-Abnahmepfade lokal und in CI grün;
F04 ist abgenommen. Der Build enthält weiterhin die bekannte Vite-Warnung
zum 1,22-MB-JavaScript-Bundle. Kein Merge nach Main.

### F05 – Kampftaktik und Manöver

- [x] F05 Kampfmanöver und Rammverhalten

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

F05-Implementierung und Replay-Nachweis vom 28.11.2026: Ein Ramm-Anflug, der
acht Sekunden lang ohne Nahkontakt bleibt oder im Nahbereich unter 25 m/s
radialer Schließgeschwindigkeit festhängt, gibt seinen Impact-Lock auf,
wechselt die Anflugseite und erhält drei Sekunden zum Neu-Ausrichten. Die
vorhandene Flugphysik und Ramm-Schadensregel bleiben unverändert;
`combat-ram-approach-replay.test.cjs` misst beidseitige Angriffe, bewegtes Ziel,
physisches Großasteroid-Hindernis, Wiederholungen, Nahkontakt-Stillstand und
Rammquote. Seed 123: bilateral 2 Anflüge je Schiff, 1 Kontakt, 0.25 Kontakte je
Anflug; bewegtes Ziel 3/3 Kontakte (Quote 1.00); Hindernis 4/5 (Quote 0.80),
24.29 m minimale Asteroidenfreiheit und 0 Kontaktframes. Alle Szenarien blieben
unter 20 s Stillstand im Nahbereich und hatten keine ungültigen Frames. Der
60-s-Kampfbasislauf misst außerdem Bewegung, Angriffspassagen, Waffenreichweite
und Feuerphasen; die Flucht-, Minen-, Traktor-, Waffen- und Boardingregressionen
laufen im Projekttestgate. F05 ist nach bestandenem PR-Head-Quality-Gate und
Browser-Restart-Smoke vom 28.11.2026 abgenommen.

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
Allowlist einführen; mit F02 als ausführbarer Architekturtest.
Die Liste darf keine alten Modusintegratoren dauerhaft freistellen.

F02-Schreibstellenreview: Schiffs-Translation darf nur der gemeinsame
`src/core/ship-flight-physics.ts`-Integrator ausführen. Gemeinsame
Velocitieschreibstellen in `local-space-ship-velocity.ts` sind
Koordinatentransformationen/Reset, keine Integration. Route-Rollback,
Waypoint-Endzustand, Arbeitsstopp/Tod und Feld-/Combat-Übergänge setzen
Zustände kontrolliert zurück oder übertragen sie. Kontaktdateien dürfen
Positionen trennen und Impulse anwenden; sie ersetzen keine Flugsteuerung.
`tests/architecture/shared-flight-integrator-boundary.test.cjs` durchsucht
TypeScript-ASTs nach weiterer Positionintegration mit Geschwindigkeit/Tempo und
Zeitschritt und prüft die zentralen Aufrufer. Seine konkreten Ausnahmen sind
nur Nicht-Schiff-Körper: geworfene Asteroiden in
`combat-tractor-asteroid-throw.ts` sowie Miningchunks in
`mining-chunk-service.ts`; sie bleiben für F03 separat klassifiziert und
stellen keine Schiffsbewegungs- oder Modusausnahme dar.

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

- F01 code: `PhysicalShipState` ist der gemeinsame Positions-, Heading- und XY-Geschwindigkeitsvertrag; `ManeuveringShipState` ergänzt Dreh-/Schubzustand. Spieler, Combatants, Feld-NPCs und Drohne nutzen ihn; Übergänge und Restore übernehmen Vektoren vollständig.
- F01 removed: redundante autoritative Geschwindigkeit sowie lokale NPC-Pose-/Cruise- und Salvage-Kontaktduplikate entfernt; verbleibende `speed`-Werte sind abgeleitete Anzeige-/Datenadapter.
- F01 test: `tests/persistence/career-combat-runtime.test.cjs` und `tests/persistence/career-npc-checkpoint.test.cjs` prüfen Kampf-/NPC-Checkpoint-Restore; lokale Quick Suite bestand mit 405 Tests.
- F01 ci: PR-Head `cc81314df011c9e62b10b6a86d5e435d74210008`; GitHub Actions Quality Gate Run 1966 (`46114558950`) und Career Browser Restart Run 1181 (`46114558937`) beide erfolgreich.
- F01 loc: gegen Baseline `6babc77e520d5c30f49f6876fc325dd110a7d02a`: 851 additions, 390 deletions, netto +461 `src/`-Zeilen. Zuwachs kommt aus dem gemeinsamen Zustandsvertrag und staged Save-/NPC-Migration; die alten skalaren Speicherstellen werden entfernt.
- F01 parity: PvP-/Feldwechsel und Save/Load übertragen XY-Geschwindigkeit, Heading und Bewegungszustand; historische skalare Checkpoints werden migriert. Feature-Parity-Review vom 28.11.2026 bestätigt keine Änderung am Status der 241 historischen Feature-IDs; die lokale Vergleichssuite und beide PR-Head-Workflows sind grün.
- F02 code: `src/core/ship-flight-physics.ts` ist der einzige gemeinsame Schiffs-Flugintegrator für Beschleunigung, Bremsen/Gegenschub, Drehung, RCS, Boost-Rampe, Sollgeschwindigkeit, Drift und Grenzen. PvP (`combat-inertial-thrust.ts`, `strategic-combat-movement.ts`), ziviler Autopilot, Feldrouten, Stationshaltung, Mining-/Salvage-Arbeitsposition, Kampagnen-NPC-Kampf und Drohne delegieren an ihn; gemeinsame Schiffswerte stammen aus `ship-stats.ts`.
- F02 removed: zivile eigene Vorwärts-/Rückwärts-Integrationsschleifen, doppelte lokale `moveToward`-/`turnToward`-Helfer und der nicht mehr benötigte lokale Displacement-Adapter wurden entfernt. Routen-, Verkehrs-, Arbeits- und Taktikcode bleibt als Befehls-/Policy-Adapter; Zustandsübertragungen, Kontaktkorrektur und initiale Platzierung bleiben begründete Nicht-Integrations-Schreibstellen.
- F02 test: `tests/combat/shared-flight-integrator-parity.test.cjs`, `tests/combat/campaign-npc-flight-parity.test.cjs`, `tests/combat/shared-flight-commands.test.cjs` und `tests/architecture/shared-flight-integrator-boundary.test.cjs`; vollständige lokale Quick Suite 409/409, inklusive unverändertem historischen PvP-Replay-Hash.
- F02 ci: PR-Head `829f218899895822351ff6f4950944afa89c8de6`; GitHub Actions Sojourn Quality Gate Run 1968 (`46122731660`) und Career Browser Restart Smoke Run 1183 (`46122731636`) beide erfolgreich. Der vorherige Quality-Gate-Lauf 1967 scheiterte ausschließlich an fehlender Klassifikation der neuen zustandslosen Helper; Eigentümerregister und Review wurden ergänzt und der erfolgreiche Lauf bestätigt den Fix.
- F02 loc: gegen F02-Basis `cc81314df011c9e62b10b6a86d5e435d74210008`: 828 additions, 440 deletions, netto +388 `src/`-Zeilen. Darin 169 Zeilen gemeinsamer Kern; Nettozuwachs erklärt sich durch gemeinsame Steuerungslogik und die neu abgedeckten Modusadapter. Redundante Integrations-/Bewegungshelfer wurden gelöscht; kein zweiter Flugintegrator verbleibt.
- F02 parity: der historische PvP-Trace bleibt exakt; die tatsächlichen PvP-/Local-Space- und PvP-/Kampagnen-NPC-Produktionspfade matchen Beschleunigung, Heading, XY-Geschwindigkeit und Drehung. Ergänzende Prüfungen decken RCS-Anzeige und Rückwärtskorrektur, Boost, Traktorassistenz/-limit, präzises Stoppen, Drift und Feldgrenzen ab. Persistenzschema und bestehende Kampagnen-, Mining-, Bergungs-, Drohnen- und Kampf-Features bleiben erhalten; AST-Audit-Ausnahmen sind ausschließlich geworfene Asteroiden und Miningchunks.
- F03 code: `src/core/contact-impulse.ts` verteilt Trennung und Normalimpuls nach inverser Masse; `src/core/ship-contact-mass.ts` berechnet Schiffskontaktmasse aus metrischer Rumpfellipse und der bestehenden Referenzdichte 5.8. Lokale Asteroiden, Combat-Asteroiden, Schilde, Schiffs-Paare, Feld-NPCs, Drohnen, Trümmer und Distress-Rammen delegieren an denselben Impulskern. `routeBlocking`, physische Masse, Rotation und Kontur werden über den Kampfbeitritt getragen; Bildpixel bleiben unberücksichtigt.
- F03 removed: der feste Combat-Schiffskick `1.15`, feste Mindestkicks freier Trümmer, artabhängige Widerstandsdivision und redundante getrennte Normalimpulse für Schiff/Fels wurden entfernt. Redundante gewichtete Schiffstrennung wurde durch gemeinsamen inversen Masseanteil ersetzt; der ungenutzte Winkelabstand-Helfer entfiel. Materialdichte, Rotationsimpuls am Kontaktpunkt und vorhandene Gameplay-/Schadens-/Feedback-Policies bleiben erhalten.
- F03 test: `tests/combat/shared-asteroid-contact-parity.test.cjs` führt denselben generierten Asteroiden durch zivile `resolveLocalWreckContacts` und Combat `resolveCombatAsteroidContacts` und vergleicht Schiff-/Asteroidenposition und XY-Geschwindigkeit numerisch; zusätzlich prüft es Tangentialerhaltung und den Massenverhältniseffekt. `npm run check:quick` bestand lokal mit 410/410 Tests; `npm run build` bestand.
- F03 ci: PR-Head `e3346c047b44fe8daf9bdd605bf321ea2ea552fd`; GitHub Actions Sojourn Quality Gate Run 1971 (`46129168075`) und Career browser restart smoke Run 1186 (`46129168068`) beide erfolgreich. Der Quality Gate enthielt Format, Lint, Typecheck, Dependency- und Persistenzprüfung, alle Projekttests, integrierten Drei-Tage-Wirtschaftssmoke und Produktionsbuild; der Browser-Smoke prüfte Save, Neuladen und Fortsetzen.
- F03 loc: gegen F03-Basis `11cb5c94410218fdd73f81acbb672afc02de2aea`: 575 hinzugefügte, 394 entfernte und netto 181 `src/`-Zeilen. Das neue gemeinsame Kontakt-/Massenmodell ersetzt mehrere separate Kick-, Reibungs- und Trennungswege; die Nettozeilen bilden die nun modeübergreifenden Adapter und Erhaltungsprüfungen ab.
- F03 parity: PvP-1vs1, Fleet-/Combat-Asteroiden und zivile Feldkontakte verwenden dieselben metrischen Körperdaten und denselben Kontaktkern. Der historische PvP-1vs1-Replay-Hash bleibt exakt. Der Produktionspfadvergleich bestätigt identische Ergebnisse für denselben Feldkontakt; vorhandene Schild-, Drohnen-, Schiff-, Wrack-, Ramm-, Navigations- und Checkpoint-Regressionsprüfungen blieben grün. Keine neue Schadensauslösung beim Moduswechsel.
- F04 code: `planFlankWaypoint`, `fastFlankRoute`, `planPointRoute` und `routeSegmentClear` teilen die Route- und Hindernisgeometrie. Combat, Feldschiffe, Verkehr und Salvage verwenden gemeinsame Routenplanung; Taktik, Vorfahrt, Ausfahrt und Arbeitsabstand bleiben Aufrufer-Policies.
- F04 removed: die eigenständigen Combat-Flanken-/Blocker-Geometrien und `src/systems/salvage/distress-navigation.ts` wurden entfernt. Die begrenzte Patrol-Sichtgraph-Suche bleibt als dokumentierte Performance-Ausnahme; zivile Alarm-/Zeit-bis-Kreuzung-Policies bleiben erhalten.
- F04 test: `tests/navigation/unified-flight-route-parity.test.cjs`, `tests/combat/combat-combined-battle-replay.test.cjs`, `tests/combat/combat-dense-asteroid-interception.test.cjs`, `tests/navigation/field-traffic-stress.test.cjs` und `tests/salvage/distress-operational-fixes.test.cjs`; GitHub-Testsuite bestand mit 411/411.
- F04 ci: PR-Head `a3983b833e5492a5cadf2f68e518513b0a6c8b85`; Sojourn Quality Gate Run 1974 (`46146017092`) und Career browser restart smoke Run 1189 (`46146017121`) erfolgreich. Persistenzprüfung, alle Tests, Drei-Tage-Wirtschaftssmoke, Build und Save-/Browser-Neustart/Weiterlaufen bestanden.
- F04 loc: gegenüber F04-Basis `39bb82fc8a3b417b010f77a2b2a0b4d46b655894`: 438 `src/`-Zeilen hinzugefügt, 225 entfernt, netto +213. Gemeinsame Route-Geometrie und Salvage-Arbeitspositionen ersetzen getrennte Pfade; der begrenzte Patrol-Algorithmus bleibt aus Performancegründen.
- F04 parity: der historische #400 Replay-Trace bleibt auf allen drei Seeds exakt; dichte Asteroidenkämpfe behalten Angriffspassagen. Identische Combat-/Zivilgeometrie, bewegte Hindernisse, blockierte Ziele, Verkehr, Ausfahrt und Distress-Salvage sind durch Produktionspfad- und Regressionstests abgedeckt. Neue Geometrie führt keine Save-Autorität ein.
- F05 code: `combat-ram-targeting.ts` beendet einen festgefahrenen Impact-Anflug nach acht Sekunden ohne Nahkontakt oder bei radialem Nahkontakt-Stillstand unter 25 m/s, löst den Intercept-Lock, wechselt die Flankenseite und lässt den Kurs drei Sekunden neu ausrichten. Es werden keine zweite Rammphysik und keine Balanceparameter eingeführt.
- F05 removed: Der unbeschränkte direkte Intercept-Lock ist durch den begrenzten Anflug mit Flankenwechsel ersetzt. Keine bestehende Waffentaktik, Flugphysik oder Kontakt-/Schadensregel wurde entfernt; es bleibt kein paralleler Ramm- oder Steuerungspfad.
- F05 test: `tests/combat/combat-ai-ram-boost-activation.test.cjs` prüft Abbruch/Seitenwechsel; `tests/combat/combat-ram-approach-replay.test.cjs` misst bilaterale, bewegte und asteroidenblockierte Anflüge samt Wiederholung und Kontakten. Der 60-s-`combat-motion-baseline.cjs`-Lauf erfasst Passagen, Reichweite und Feuerphasen. Flucht, Minen, Traktor, Waffenwinkel, Treffer und Boarding bleiben durch bestehende Regressionen abgedeckt.
- F05 local: Seed 123 ergab bilateral 2/2 Anflüge je Seite und 1 Rammkontakt (0.25 Kontakte/Anflug), am bewegten Ziel 3 Kontakte bei 3 Anflügen, am Asteroiden 4 Kontakte bei 5 Anflügen. Der Hindernisfall hielt 24.29 m Freiraum, ohne Kontaktframes. Nahkontakt-Stillstand blieb je Schiff unter 20 s; alle drei Simulationen hatten 0 ungültige Frames.
- F05 ci: PR-Head `cc3c3f21628944cf98f9084d333784cddcb6319f`; Quality Gate Run 1976 (`46151374716`) und Career Browser Restart Smoke (`46151374737`) beide erfolgreich.
- F05 loc: gegenüber F04-Basis `ca9a45ff085e5725fa0b09de700a28cb4f7c7782`: 92 `src/`-Zeilen hinzugefügt, 19 entfernt, netto +73; der Ablauf bleibt in den kanonischen Ramm-Intent-/Zielmodulen.
- F05 parity: `combat-unified-flight-replay.test.cjs` besteht mit identischen historischen Hashes für die drei PvP-1vs1-Loadouts und vier Seeds. Lokales `npm run check:quick` bestand mit 412/412 Tests; `npm run build` und beide Workflows des aktuellen PR-Heads bestanden. Der bekannte Vite-Chunkgrößenhinweis bleibt.

## Arbeitslog und Übergabe an neue Chats

- 28.11.2026: F05-Audit und Replay-Implementierung. Audit von `combat-flight-intent.ts`,
  `combat-ram-targeting.ts`, `combat-route-steering.ts` und
  `strategic-combat-movement.ts`: bestehende Waffen-/Flucht-/Minen-/Traktor-/
  Boardingpfade und historische PvP-Replays bleiben erhalten. Der direkte
  Ramm-Intercept hatte keinen Abbruch bei blockiertem oder verfehltem Anflug;
  Nahbereichs-Stillstand konnte außerdem den Impact-Lock halten. Achtsekündiger
  Abort mit Flankenwechsel und kurzer Neu-Ausrichtung ergänzt und integrierte
  bilaterale, bewegte sowie physische Asteroiden-Replays samt Metriken ergänzt.
  Die historischen 1vs1-Hashes blieben exakt. Lokal `npm run check:quick`
  (412/412), Format, Lint, Typecheck, Dependency-/Persistenzprüfung und Build
  bestanden. PR-Head `cc3c3f21628944cf98f9084d333784cddcb6319f` bestand Quality
  Gate Run 1976 und Career Browser Restart Smoke; F05 ist abgenommen. Build
  meldet nur den vorhandenen Chunkgrößenhinweis.

- 28.11.2026: F04-Audit und Implementierung auf Basis der F03-Abnahme
  `39bb82fc8a3b417b010f77a2b2a0b4d46b655894`. PvP-Flankenversuch und zivile
  A*-Rückfallebene sind im gemeinsamen Punktplaner; Combat, Feldrouting und
  Salvage delegieren. Der einzelne Distress-Detour wurde entfernt. Gezielte
  Typ- und Produktionspfadtests bestehen; 410/411 Quick-Tests bestehen.
  Offen ist der historische #400-Kampftrace nach einer 1-cm-Abweichung bei
  einem Asteroidenmanöver. Der unveränderte F03-Combat-Routenpfad besteht den
  Kontrolllauf, deshalb bleibt diese F04-Verhaltensabweichung bis zur
  Ursachenentscheidung offen. Build besteht; GitHub Actions wurde für den
  uncommitteten Stand nicht ausgeführt. Kein Merge nach Main.
- 28.11.2026: Fortsetzung von F04. Der historische #400 Replay-Drift sowie
  der fehlende Angriffsdurchflug im dichten Asteroidenfeld wurden auf den
  abweichenden Combat-A*-Anflug zurückgeführt. Nach Rückkehr auf den gemeinsam
  genutzten PvP-Flanken-/10-Hop-Algorithmus bei gemeinsamer Segmentgeometrie
  bestehen beide Regressionen wieder. `npm run check:quick`: 411/411; darin
  Format, Lint, Typecheck, Dependency- und Persistenzprüfung. `npm run build`
  erfolgreich, mit bestehender 1,22-MB-Bundle-Warnung. Geänderte Pfade:
  Combat-/Local-Space-/Feldnavigation, Salvage-Routing und -Service,
  `tests/navigation/unified-flight-route-parity.test.cjs` sowie
  `tests/salvage/distress-operational-fixes.test.cjs`; entfernt:
  `src/systems/salvage/distress-navigation.ts`. Produktionsdiff der bereits
  getrackten `src/`-Dateien: 327 hinzugefügt, 225 entfernt; zusätzlich
  `local-space-route-flanks.ts` mit 111 Zeilen. Der lokale Commit
  `refactor: unify field flight routing` ist erstellt; der Remote-Branch
  steht noch auf `39bb82fc8a3b417b010f77a2b2a0b4d46b655894`, daher gibt es
  noch keinen GitHub-Actions-Lauf für F04. F04-Checklisteneintrag bleibt
  offen bis Branch-CI und Abschlussprüfung; kein Merge nach Main.
- 28.11.2026: PR #410 Quality Gate Run 1973 scheiterte nach erfolgreichen
  Format-, Lint-, TypeScript- und Dependency-Gates an der fehlenden
  Persistenzklassifizierung von `src/systems/local-space/local-space-route-flanks.ts`.
  Der Test-, Wirtschaftssmoke- und Build-Schritt wurde dadurch übersprungen.
  Browser-Restart Run 1188 bestand. Das Routingmodul ist als `derived`
  klassifiziert, `docs/CAREER_PERSISTENCE.md` dokumentiert die Save-Auswirkung;
  `npm run persistence:check` besteht lokal. Der Korrekturstand ist lokal
  committed, CI für ihn steht noch aus. F04 bleibt bis zum grünen Quality Gate
  offen; kein Merge nach Main.
- 28.11.2026: F04-Korrektur auf PR-Head `a3983b833e5492a5cadf2f68e518513b0a6c8b85`
  durch GitHub Actions abgenommen. Sojourn Quality Gate Run 1974 bestand
  Format, Lint, TypeScript, Dependency- und Persistenzprüfung, 411/411 Tests,
  den integrierten Drei-Tage-Wirtschaftssmoke und den Produktionsbuild;
  Career browser restart smoke Run 1189 bestand Save, Browser-Neustart und
  Fortsetzen. F04 ist abgenommen und die Checkliste markiert. Es gibt weiterhin
  keinen Merge nach Main.
- 28.11.2026: F03 auf `refactor/unified-field-flight-physics` umgesetzt und
  nach lokaler Abnahme sowie erfolgreichen GitHub Actions auf PR-Head
  `e3346c047b44fe8daf9bdd605bf321ea2ea552fd` abgenommen. Feld-/Combat-
  Asteroiden, Schildkontakt, freie Trümmer, Schiffspaare, gemischte
  PvP/Feldbystander, Drohnenkontakte und Distress-Rammen den gemeinsamen
  Impuls-/Trennungskern `src/core/contact-impulse.ts`. Die effektive
  Schiffsmasse wird in `src/core/ship-contact-mass.ts` einheitlich aus
  metrischer Rumpfellipse und vorhandener Referenzdichte 5.8 berechnet; keine
  Bildpixel. Feldkörper tragen `routeBlocking` durch die native Combat-Brücke;
  Legacy-Combat-Snapshots haben einen begrenzten Fallback. Redundante feste
  Schiffskicks, asteroidische Widerstandsdivision und manche getrennte
  Schiff-/Trümmerimpulse wurden entfernt; Material-/Schadens-/Feedback-Policies,
  Rotationsimpuls, Cooldowns und Feld-Checkpoint-Owner bleiben bestehen. Der
  echte Pfadvergleich `tests/combat/shared-asteroid-contact-parity.test.cjs`
  führt denselben generierten Körper durch zivile `resolveLocalWreckContacts`
  und Combat `resolveCombatAsteroidContacts` und vergleicht Schiff und Fels
  numerisch, einschließlich Tangentialerhaltung. Nach Korrektur eines alten
  skalaren Navigationstest-Fixtures besteht die vollständige Quick Suite mit
  410/410; Format, Lint, Typecheck, Dependency- und Persistenzcheck sowie Build
  waren ebenfalls grün. Source-Bilanz gegen F03-Basis: 575 hinzugefügt, 394
  entfernt, netto +181 Zeilen. GitHub Actions Sojourn Quality Gate Run 1971
  (`46129168075`) und Career browser restart smoke Run 1186 (`46129168068`)
  sind beide erfolgreich. Lokaler Build zeigt nur die bekannte große
  JavaScript-Bundle-Warnung. Kein Merge nach Main.
- 28.11.2026: F02 in Arbeit auf `refactor/unified-field-flight-physics`, Basis
  `cc81314df011c9e62b10b6a86d5e435d74210008`; kein Merge nach Main. Der
  gemeinsame `src/core/ship-flight-physics.ts`-Integrator besitzt jetzt
  Beschleunigungsantwort, Brems-/Gegenschub, Boost-Rampe, RCS-Multiplikator,
  Sollgeschwindigkeitslimit, Drehung, Drift und Feldgrenzen. PvP-1vs1 nutzt ihn
  mit unveränderter Operationsreihenfolge; ziviler Local-Space-Autopilot,
  Bergungs-/Mining-Anflug, Stationshaltung, lokale Miner/Berger/Piraten,
  kampagnenweite NPC-Kampfverfolgung (`npc-sector-combat-movement.ts`),
  Patrouillendrohne und NPC-Arbeitsanflug verwenden dieselben Kernfunktionen.
  Routen-/Taktikentscheidungen bleiben Auftragsadapter und besitzen keine
  eigene Integrationsschleife. `shipFlightBounds` vereinheitlicht Grenzen.
  `field-ship-routing.ts` wurde in Flugkommando, Verkehrsprüfung und
  Wegpunktabschluss zerlegt; zusätzliche Flight-/Availability-Adapter wurden
  aus zu großen Services extrahiert. Der historische 1vs1-Trace blieb exakt
  gleich; die neue Produktionspfad-Gegenprobe vergleicht Position, XY-Tempo,
  Heading und Drehgeschwindigkeit für Beschleunigen, Drehung, Bremsen und
  Grenzen. Ein gezielter Kommandotest prüft Boost-Rampe, Traktorlimit, RCS,
  Stop und Drift. `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm run deps:check`, `npm run persistence:check` sowie Quick Suite (407/407)
  und Build bestanden, bevor der zusätzliche Sektor-NPC-/Mining-Arbeitspositions-
  pfad migriert wurde; diese Änderungen werden erneut verifiziert.
  `campaign-npc-flight-parity.test.cjs` vergleicht Kampagnenverfolgung/Flucht
  direkt mit dem PvP-Steuerungspfad. `shared-flight-integrator-boundary.test.cjs`
  fügt einen TypeScript-AST-Audit mit drei begründeten Nicht-Schiff-Ausnahmen
  hinzu. Nach Entfernung der sofortigen Mining-/Salvage-Zielausrichtung nutzen
  auch zivile Arbeitsdrehungen dieselbe Drehbegrenzung. Der abschließende lokale
  Gate-Lauf bestand: Format, Lint, Typecheck, Dependency-Architektur,
  Persistenzprüfung, Quick Suite (409/409) und Build. Die alte PvP-Replay-Prüfung
  bleibt exakt; Produktionspfadvergleiche prüfen Beschleunigen, Drehen, Bremsen,
  Grenzen, Kampagnen-Verfolgung/Flucht sowie RCS-Anzeige/Rückwärtskorrektur;
  Befehlsprüfungen decken Boost-Rampe, Traktorassistenz/-limit, Stop und Drift ab.
  `git diff --check` ist sauber. Die Produktivcode-Bilanz gegen den Branchstand
  vor F02 beträgt 828 hinzugefügte, 440 entfernte und netto 388 `src/`-Zeilen;
  die 169-zeilige gemeinsame Physik steht zusätzlichen Extraktionen und der
  Entfernung redundanter Flughelfer gegenüber. F02 wurde nach erfolgreichem
  GitHub-Actions-Nachweis auf PR-Head `829f218899895822351ff6f4950944afa89c8de6`
  abgenommen; die sechs Nachweiszeilen stehen im Nachweisblock. Quality Gate
  Run 1968 (`46122731660`) und Career Browser Restart Smoke Run 1183
  (`46122731636`) sind beide erfolgreich. Der vorherige Quality Gate Run 1967
  identifizierte exakt die fehlende Persistenzklassifikation für zwei neue
  zustandslose NPC-Piraten-Helper. Eigentümerregister und Review wurden ergänzt;
  `npm run persistence:check` und der vollständige neue PR-Head-Workflow sind
  anschließend grün. Kein Merge nach Main.
- GitHub-Actions-Nachweis auf `cdc8e940db16fe2b36e913136fb26f5eb580178b`:
  Quality Gate Run 1967 scheiterte im Schritt `persistence:check`, weil die
  neuen zustandslosen Module `npc-local-pirate-availability.ts` und
  `npc-local-pirate-flight.ts` im Eigentümerregister und Review fehlten. Format,
  Lint, Typecheck und Dependency-Architektur waren erfolgreich; Tests und Build
  wurden übersprungen. Ursache aus dem Joblog, nicht spekulativ. Die Klassifikation
  als abgeleitet ist ergänzt. Der nachfolgende PR-Head bestätigte den Fix:
  Quality Gate Run 1968 und Browser-Smoke Run 1183 waren auf `829f218` grün.
- 28.11.2026: F01 abgenommen nach tatsächlichen erfolgreichen GitHub-Actions-Läufen
  auf PR-Head `cc81314df011c9e62b10b6a86d5e435d74210008`: Quality Gate Run 1966
  (`46114558950`) und Career Browser Restart Run 1181 (`46114558937`). Beide
  Workflows sind grün. Der gemeinsame `PhysicalShipState` enthält
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
  bestehende Warnung zum 1,2-MB-JavaScript-Bundle. Der F01-Code und zwei
  Status-/Nachweiskommits liegen auf `refactor/unified-field-flight-physics`;
  Main blieb unverändert. Draft-PR #410 startete GitHub Actions.
  Produktionsquellstand dieses Commits gegenüber seinem Branch-Parent: 851
  hinzugefügt, 390 entfernt, netto +461 Zeilen. Dieser Zuwachs ist die
  gemeinsame Zustands-/Save-Migration und extrahierte Helfer; kein
  Paketabschluss. Für F03 blieb zunächst die Massenregel offen: `ShipDefinition`
  hat keine Hull-Masse und Collision-`pushWeight` ist kein bestätigtes Maß;
  keine Masse oder Rotationsinertie erfunden. Die Entscheidung vom 28.11.2026
  ist im F03-Audit oben dokumentiert: metrische Rumpfellipse mit vorhandener
  Ressourcen-Referenzdichte, ohne Bildauswertung oder neue Schiffsspin-Mechanik.
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
- Nächster Schritt: GitHub-Actions-Quality-Gate und Career-Browser-Restarttest
  auf dem aktuellen PR-Head prüfen; F01 bleibt bis zu deren erfolgreichem
  Abschluss offen.
- 28.11.2026: Der freigegebene Push der zwei F01-Commits wurde auf genau diesen
  Branch übertragen; Remote-Vergleich: zwei Commits vor dem vorherigen HEAD,
  keine Abweichung hinter dem Branch-Parent. Die lokalen Commit-IDs wurden bei
  der GitHub-Übertragung neu erzeugt, die Code- und Dokumenttrees entsprechen
  den Änderungen. Erster Pflicht-Preflight fand die fehlenden
  Persistenzklassifizierungen von `npc-local-physical-pose.ts` und
  `npc-local-salvage-contacts.ts`; beide zustandslosen Module sind als
  `derived` klassifiziert, die Persistenzfolgen in `CAREER_PERSISTENCE.md`
  dokumentiert. Danach bestanden `npm run persistence:check`, `npm run
format:check`, `npm run check:quick` (405/405) und `npm run build`; der Build
  meldet weiterhin die bestehende Chunk-Warnung. GitHub-Actions-Run 1179
  (Career-Browser-Restart) war erfolgreich. Run 1964 (Quality Gate) lief auf
  Head `9034b571` und erreichte 404 bestandene Tests; allein
  `tests/quality/feature-parity.test.cjs` schlug fehl, weil der erforderliche
  Review-Log-Eintrag in `docs/SOJOURN_FEATURE_PARITY.md` fehlte. Dieser
  fachliche Nachweis ist ergänzt; kein Test wurde abgeschwächt. Run 1965
  stoppte anschließend bei Prettier: die lange Paritätsdatei war bei ihrer
  GitHub-Tree-Übertragung durch eine gekürzte Kommandoausgabe beschädigt.
  Lokal ist die vollständige formatierte Datei aus dem committed Branch-Stand
  wiederhergestellt; `tests/quality/feature-parity.test.cjs` besteht. Die
  vollständige Datei wird erneut übertragen. AGENTS.md ist an den aktiven
  Anbieter GitHub Actions angepasst. F01 bleibt offen, bis der aktualisierte
  PR-Head beide Workflows erfolgreich beendet. F02 beginnt erst danach.
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

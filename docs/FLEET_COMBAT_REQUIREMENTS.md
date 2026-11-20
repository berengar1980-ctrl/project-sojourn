# FleetCombat – verbindliches Anforderungsregister

Quelle: hochgeladene Spezifikation „PROJECT SOJOURN – Dynamisches Kampfsystem und FleetCombat“ (20.11.2026).

**Branch:** `feature/fleetcombat-scenario-lab`. **Merge-Regel:** Kein Merge nach `main` ohne ausdrückliche Freigabe, erfolgreiche CI und funktionierende PvP- sowie Kampagnentests.

Status: **DONE** = im Code umgesetzt und durch eigene Tests abgedeckt (CI weiterhin separat prüfen); **FOUNDATION** = Architektur implementiert, nicht spielbar; **OPEN** = noch nicht umgesetzt. Diese Kennzeichnungen dürfen nicht mit erfolgreich abgeschlossenen End-to-End-Tests verwechselt werden.

| ID    | Verbindliche Anforderung                                                        | Status     | Prüfnachweis / noch nötig                                                                                                      |
| ----- | ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| FC-01 | Bestehender 1vs1-Kern unverändert                                               | FOUNDATION | `fleet-legacy-baseline.test.cjs` vergleicht acht zentrale Quelldateien bytegenau. Alle bestehenden 1vs1-Tests bleiben Pflicht. |
| FC-02 | Spieler immer auf lokaler Karte                                                 | FOUNDATION | `fleet-test-scenario.test.cjs`; Szenario enthält genau einen Spieler                                                           |
| FC-03 | Fünf Karten auswählbar                                                          | FOUNDATION | `DUEL_MAPS` verwendet; reale Arena noch nicht verbunden                                                                        |
| FC-04 | 0–10 Miner, Drohnen, Piraten A und B unabhängig                                 | FOUNDATION | `fleet-test-scenario.test.cjs`, UI                                                                                             |
| FC-05 | NPC-Miner verwenden Kampagnenarbeit und Fluchtverhalten                         | OPEN       | NPC-Runtime in gemeinsamer Welt integrieren                                                                                    |
| FC-06 | Sicherheitsdrohnen: Sensor -> sofortiger Abfangkurs -> realer Beitritt          | OPEN       | Sensorkontakte, Hindernisnavigation und Reichweite testen                                                                      |
| FC-07 | Zwei unabhängige 1vs1 parallel                                                  | FOUNDATION | `fleet-engagement-manager.test.cjs`; Simulation noch nicht angeschlossen                                                       |
| FC-08 | Echte 2vs1, 3vs3, N-vs-M mit einer physischen Welt                              | FOUNDATION | 2vs1-Testlaufzeit mit einer Arena und drei Schiffen; 3vs3, vollwertige KI und Waffenphysik noch offen                          |
| FC-09 | Schiffe können laufende Kämpfe verstärken                                       | FOUNDATION | EngagementManager verwaltet Beitritt; Zustandsübernahme noch offen                                                             |
| FC-10 | Keine doppelte Schiffsautorität                                                 | FOUNDATION | EngagementManager exklusiv; später World-/Combat-Scheduler prüfen                                                              |
| FC-11 | Positionen, Geschwindigkeit, Waffen, Schilde, Subsysteme beim Übergang erhalten | OPEN       | Zustandsübergabe erst nach eigenständigem 2vs1-Kern                                                                            |
| FC-12 | Neutrale Schiffe arbeiten, beobachten, navigieren oder fliehen weiter           | OPEN       | Weltintegration mit unabhängigen NPC-Aktivitäten                                                                               |
| FC-13 | KI-Zielwahl mit Zielbindung, Re-Targeting und Fokusangriff                      | FOUNDATION | Feste Ziel-IDs und einfaches Retargeting vorhanden; Kampagnen-KI und differenzierte Zielwahl fehlen                            |
| FC-14 | Hindernisse, Asteroiden, Rammen, Traktorwürfe, Minen                            | FOUNDATION | Bestehende Navigation und Hinderniskollision wiederverwendet; Rammen, Traktorwürfe und Minen offen                             |
| FC-15 | Fraktionen A/B verfeindet; gemeinsame Beute bei gemeinsamem Kill                | OPEN       | Deterministische Beuteteilung; keine automatische Allianz                                                                      |
| FC-16 | Mehr als zwei Parteien je Gefecht möglich                                       | FOUNDATION | EngagementManager kennt nur eindeutige Schiff-IDs, keine Zwei-Team-Grenze                                                      |
| FC-17 | Kein Merge durch räumliche Nähe                                                 | FOUNDATION | `engage()` nur bei expliziter Kampfhandlung; Tests                                                                             |
| FC-18 | FleetCombat bleibt nach Verlusten FleetCombat                                   | FOUNDATION | `fleet-engagement-manager.test.cjs`                                                                                            |
| FC-19 | Gleiche Mechaniken für PvP-Test und Kampagne                                    | OPEN       | Gemeinsame Services implementieren, Kampagnenadapter später                                                                    |
| FC-20 | Tests, CI, Format, Lint und Typecheck grün                                      | OPEN       | Workflow-Ergebnisse und echte Runtime-Tests prüfen                                                                             |

## Zu jedem Feature-Commit

1. Änderungen ausschließlich auf dem Feature-Branch.
2. Keine Änderung der acht geschützten 1vs1-Dateien. Weitere Bestandsdateien nur nach Prüfung.
3. Neue Funktion mit konkret reproduzierbarem Test absichern.
4. `npm run check:quick` und `npm run build` sowie CI ausführen; Ergebnisse dokumentieren.
5. Anforderungen in diesem Register nachführen und nur bei belegtem Verhalten als abgeschlossen markieren.
6. Für die Freigabe: fünf Karten; 0/1/viele Einheiten jeder Kategorie; 2 unabhängige Duelle; 2vs1; 3vs3; Drohnen-Abfang; Flucht; Join/Leave; Minen; Rammen; Traktor-Asteroiden; zivile Tätigkeit; Kampagnenparität.

**Aktueller Testumfang:** Der Mehrschiff-Prototyp startet mit 0 Minern, 0 Drohnen und insgesamt mindestens 2 Piraten aus A und/oder B (je 0–10). Er zeigt alle aktiv eingetroffenen Schiffe auf einer gemeinsamen Arena mit Bewegung, Kollision und direkten Waffen-Treffern. Das Diagnose-Canvas ist nicht der finale Renderer. Die vollständige Trefferchance, Munition, Geschosse, Minen, Rammen, Traktorwürfe, NPC-Arbeit und Kampagnen-KI sind **nicht** implementiert. Der vorhandene 1vs1-Modus bleibt bytegleich.

## Prototyp-Grenzen

Die erste Laufzeit verwendet direkte Treffer statt der vollständigen Projektilsimulation. Vor jeder Freigabe müssen Waffenreichweite, Trefferchance, Laufzeiten, Munition, Rammen, Minen und Traktorwürfe auf das Kampagnenniveau gebracht werden. Ein erfolgreicher 2vs1-Test allein erfüllt FC-08 daher nicht.

## CI-Validierung

Der Teststatus wird erst nach vollständigem CI-Lauf als grün markiert.

## FC-21 – Zeitversetzte Schiffsankunft

- Spieler: immer ab Sekunde 0 auf der Karte; Sicherheitsdrohnen: in der Testkonfiguration immer ab Beginn vorhanden.
- Jeder Miner und jeder Pirat aus A/B erhält eine eigene Checkbox „Von Beginn an auf der Karte“ und ein Eingabefeld für seine Ankunftszeit (1–3600 Simulationssekunden).
- Die Zeit bleibt bei Kartenwechsel oder Neuauslosung für gleichbleibende IDs erhalten.
- Noch nicht eingetroffene Schiffe sind nicht im aktiven Weltsnapshot, können weder navigieren noch schießen, getroffen werden oder als Ziel ausgewählt werden.
- Der 2vs1-Test nutzt die Zeitsteuerung bereits; Eintritt erfolgt zunächst am Kartenrand. Ein wirklicher Flug von der Sternkarte in die lokale Karte und ein vollständiger Kampagnen-NPC-Join bleiben für die spätere Weltintegration offen.
- Nachweis: `tests/combat/fleet-combat-service.test.cjs` überprüft Vor-/Nach-Ankunft und Waffenruhe bis zum Eintritt.

## FC-22 – Testbare Mehrfraktionen-Konfiguration

- Der FleetCombat-Reiter unterstützt mehrere Piraten beider Fraktionen gleichzeitig.
- Beide Fraktionen dürfen sich gegenseitig bekämpfen; Einheiten derselben Fraktion sind nicht feindlich.
- Spieler, Zivilisten und Sicherheitskräfte sind untereinander verbündet.
- Die Zeitsteuerung pro Pirat bleibt erhalten; der reale Eintritt erfolgt an der Randzone des lokalen Felds.
- Bis zur Anbindung der echten Kampagnen-Minerlogik sind Miner im ausführbaren Test gesperrt; Drohnen dürfen jetzt mit mindestens einem Piraten starten. Die bisherige direkten Treffer sind kein Ersatz für die vollständige Waffenphysik.
- Nachweis: `fleet-combat-service.test.cjs` prüft mehrere Fraktionen, verbündete Parteien und verzögerten Eintritt.

## FC-23 – Sicherheitsdrohnen-Interception (Zwischenstand)

- Eine neue Interceptor-Komponente verwendet direkt die vorhandene
  `AsteroidSecurityDrone`: Sensorreichweite, verdeckte Sicht durch Asteroiden,
  Patrouillenbewegung, Kursplanung und physische Annäherung.
- Eine Drohne ignoriert Zivilisten und Sicherheitskräfte und sucht sichtbare
  Piraten beider Fraktionen. Ein bereits kämpfender Pirat bleibt Ziel.
- Eigene Drohnen-Kontakt- und Navigationstests sind hinzugefügt.
- **Aktueller Stand:** Die Drohne verwendet ein echtes Mk-III-Kampf-Loadout aus dem vorhandenen Kampagnen-NPC-System. Nur ihre Kampagnen-Drohnenklasse steuert ihre Bewegung; ein externer Steuerungsadapter liefert die Position an die gemeinsame FleetCombat-Simulation. Sobald sie physisch in Angriffsreichweite ist, tritt sie dem laufenden Gefecht bei und kann mit dem derzeit vereinfachten Mehrschiff-Waffenmodell Schaden verursachen und erhalten. Die Testanzeige unterscheidet Drohnen durch runde Markierungen.
- **Noch offen:** Vollständige Kampfparität (Munition, Projektile, Minen, Traktorwürfe), Produktions-Kampagnenintegration, reale Drohnen-Sprites und die Integration der lokalen NPC-Miner. Die Feature-Branch-Simulation ist noch keine abschließende Karriere-Anbindung.

## FC-24 – Drohnenanflug gegen physische Schiffshindernisse

- Die Drohne fliegt einen Punkt knapp außerhalb des Kollisionsbereichs des Piraten an, nicht dessen blockierten Mittelpunkt.
- Der Zielpirat bleibt bei der echten Wegplanung und Schildkontaktprüfung ein physisches Hindernis.
- Der Regressionstest prüft das Abfangen trotz eines soliden Piratenhindernisses und die tatsächliche Flugbewegung vor dem Kampfbeitritt.

## FC-25 – Eine gemeinsame Laufzeit, zwei Einstiegspunkte (verbindliche Architektur)

**Nicht verhandelbar:** Der FleetCombat-Reiter ist ausschließlich Szenarioeditor,
Teststeuerung und Diagnose-UI. Der Produktionsmodus der Kampagne und das
PvP-Testlabor müssen dieselbe FleetCombat-Laufzeit und dieselben Services für
Bewegung, Navigation, Sensoren, Kollisionsauflösung, Kampf-KI, Waffen,
Schadensberechnung und Zustandsübergänge verwenden.

- Der authoritative FleetCombat-World-/Engagement-Service liegt unter
  `src/systems/` und importiert keine Module aus `src/ui/` oder `src/app/`.
- Die PvP-Oberfläche erzeugt lediglich Szenario- und Startparameter und
  ruft den **gleichen** produktiven FleetCombat-Factory-Einstiegspunkt auf
  wie die Kampagne; sie besitzt keine eigene NPC-, Bewegungs- oder Kampf-KI.
- Der Kampagnen-Einstiegspunkt übergibt echte NPC-/Spielerzustände, ohne sie
  für ein eigenes Testdatenmodell nachbauen zu müssen. Position, Geschwindigkeit,
  Inventar, Schild/Hülle, Waffen-Cooldowns, Fraktion und aktive Tätigkeiten
  werden beim Wechsel ohne Reset, Doppel-Tick oder Teleportation übertragen.
- Wo die heutigen Kampagnenmechaniken nicht direkt für N Schiffe nutzbar sind,
  wird die **gemeinsame Mechanik** in ein wiederverwendbares `src/systems/`-Modul
  extrahiert; der alte 1vs1-Einstieg bleibt bytegleich. Kein duplizierter
  PvP-Ersatz für Projektilphysik, Sensorauswertung, Arbeits-KI oder Kollisionen.
- Änderungen am gemeinsamen Verhalten wirken bei identischem Weltzustand
  auf beide Einstiegspunkte. Das muss durch identische Replay-Szenarien sowie
  einen automatisierten Paritätstest nachgewiesen werden.
- Kampagnenanbindung, inklusive Wiederaufnahme aus Career-Checkpoint während
  eines Gefechts und verzögerter Eintritte, ist **vor** der Freigabe des
  FleetCombat-Features zu testen. Nicht erst nach dem Abschluss der PvP-UI.

**Status: OPEN.** Der derzeitige Mehrschiff-Prototyp benutzt noch eigene
Direkt-Treffer-Logik, konstruierte Test-Schiffszustände und einen zusätzlichen
Drohnen-Zielentscheid. Diese Lücken müssen vor einer vollständigen Freigabe
wegfallen. Ein grüner Prototyp-Test oder eine unveränderte 1vs1-Engine ist
**kein** Nachweis für Kampagnenparität.

## FC-26 – Live-Kampagnenzustände ohne Neuinitialisierung übernehmen

- Der gemeinsame `createFleetCombatService` akzeptiert optional einen bereits
  existierenden `MutableCombatant` aus dem produktiven Kampfsystem statt
  über `createCombatant` eine neue Entität zu erzeugen.
- Die Identität der übergebenen Entität und die Weltposition werden geprüft.
  Fehlerhafte Übergaben werden abgewiesen, nicht stillschweigend teleportiert.
- Vorhandene Werte wie Position, Geschwindigkeit, Ausrichtung, Hülle, Schild,
  Subsystemzustände, Taktik und interne Waffen-/Minen-Cooldowns bleiben erhalten.
  Der ursprüngliche mutable Zustand bleibt die Autorität der Runtime.
- Nachweis: `tests/combat/fleet-career-state-handoff.test.cjs`.
- **Status: FOUNDATION.** Der Handoff ist ein Schritt zur gemeinsamen Laufzeit;
  es gibt noch keine produktive Übergabe echter Career-NPCs aus dem
  Kampagnen-Controller. Die PvP-Testvorschau erzeugt weiter Testeinheiten.
  Gameplay-Parität (FC-19/FC-25) bleibt OPEN.

## FC-27 – Reale Kampagnen-NPCs an der gemeinsamen Kampfgrenze

- Der neue systems-basierte `createFleetCareerNpcParticipant` nutzt direkt
  `npcCombatant(npc)` aus dem produktiven Karriere-Kampf: echtes Schiff,
  installierte Komponenten, Waffen, Minen, Schiffswerte und NPC-Doktrin.
  Keine zufällige PvP-Testausrüstung und keine zweite NPC-Ausrüstungslogik.
- Bestehende Karriere-Fraktionen `pirates`/`pirates2` werden auf
  `pirate-a`/`pirate-b` abgebildet. Miner und sonstige Zivilisten bleiben
  `civilian`. Sicherheitsdrohnen behalten `security`.
- Lokale Position, vorgegebene Zielbindung und Ankunftszeit werden übergeben.
  Der Adapter verändert weder Navigation noch Arbeitszustand der Welt.
- Regression mit echten `SectorNpcState`-Vorlagen: Miner und Piraten beider
  Fraktionen, Kampagnen-Waffen/Minen, verzögerter Eintritt und neutrales
  Verhalten des Miners im gemeinsamen FleetCombat-Service.
- **Status: FOUNDATION.** Der produktive Kampagnencontroller ruft den Adapter
  noch nicht auf. NPC-Arbeit, Feldnavigation, Flucht, Kontinuität von Cargo und
  tatsächlicher Career-Checkpoint müssen weiter integriert werden. FC-19/FC-25
  bleiben OPEN. Die Testarena ist nicht die Kampagnen-Detailkarte.

## FC-28 – Echtes Karriere-Mining läuft im gemeinsamen FleetCombat-Tick

- FleetCombat kann vor der Schiffsbewegung eine bereits existierende
  Karriere-Feldwelt **genau einmal pro Simulationsintervall** aktualisieren.
  Die Welt behält die alleinige Bewegungs-, Kollisions- und Wirtschaftsautorität.
- `createFleetCareerMiningBridge` verwendet die echte
  `createNpcLocalMiningService`-Runtime und leitet deren unveränderte
  Schiffspositionen und Ausrichtungen an FleetCombat weiter.
- Die Kampagnenservices entscheiden unverändert über Erzvorkommen,
  Anflugrouten, Asteroidenscans, Abbauzyklen, NPC-Fracht, Ereignisse,
  Abreise sowie Unterbrechung bei Kampf-/Erholungszuständen.
- Weder FleetCombat noch der Adapter enthalten eine zweite Mining-KI,
  ein zweites Cargo-System oder eine zweite Miner-Navigationsberechnung.
- Nachweis: `fleet-career-mining-bridge.test.cjs` führt echte
  Feldnavigation, Scanphase, Laserarbeit, Erzabbau und Unterbrechung
  in einer gemeinsamen 3-Schiff-Runtime aus.
- **Status: FOUNDATION.** Der produktive Kampagnencontroller übergibt
  seine existierende Feldwelt noch nicht an die FleetCombat-Factory.
  Die PvP-Szenariooberfläche muss dieselbe Karriere-Feldinstanz nutzen,
  statt eigenständig abzubildende Mine-Asteroiden oder Minerlogik
  zu erzeugen. Kampfreaktion/Flucht und Produktions-Save-Resume
  bleiben offen.

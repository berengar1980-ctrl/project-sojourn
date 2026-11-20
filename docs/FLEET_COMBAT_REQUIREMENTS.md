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

## FC-29 – NPC-Miner im ausführbaren PvP-FleetCombat-Testlabor

- Der Launcher lässt Miner nun in `scattered` und `asteroid_field` starten.
  Die Ausgangskarte wird mit `generateMiningSpace` und
  `miningFieldCombatArena` aus den echten Kampagnen-Generatoren erstellt.
- Die Testumgebung erzeugt isolierte _Kopien_ der Karriere-Miner-Vorlagen,
  kombiniert sie mit `createNpcLocalMiningService` und bucht gefördertes Erz
  mittels der produktiven `NpcEconomyService.mineLocal`-Funktion. Kein
  zweiter Mining-Zyklus, keine eigene Navigation und keine zweite
  Frachtkapazitätsberechnung.
- Beginn und verzögerte Ankunft folgen der FleetCombat-Konfiguration. Der
  Feldservice ist Besitzer der Bewegungs- und Abbauzyklen und wird nur einmal
  pro FleetCombat-Step aktualisiert. Voll beladene Miner verlassen physisch
  das Feld und verschwinden dann aus dem Fleet-Snapshot.
- Der PvP-Simulationsmodus verwendet zur Probenahme einen unlimitierten
  Ressourcenallokator, aber **die echte Kampagne** behält die
  ressourcenbegrenzte Wirtschafts- und Feldzustandsinstanz als Autorität.
  Das ist ein Test-Setup, keine alternative Spielökonomie.
- Nachweise: `fleet-career-mining-bridge.test.cjs` (Navigation, Scan, Erz,
  Unterbrechung) und `fleet-mining-test-setup.test.cjs` (PvP-Feldinstanz,
  Late-Join, tatsächlicher Miner-Tick).
- **Status: FOUNDATION.** Piratenangriffe führen noch nicht automatisch
  zur echten Karriere-Flucht-/Gegenwehrentscheidung. Die Laufzeit-Synchronisierung
  mit dem produktiven Kampagnencontroller und die Darstellung der
  Abbaulasereffekte bleiben offen; 1vs1 und vollständige Waffenparität
  sind unverändert bzw. weiterhin ausstehend.

## FC-30 – Karriere-Miner reagiert auf Piratenangriff in FleetCombat

- Der gemeinsame FleetCombat-Kern meldet vor jedem Karriere-Welttick die
  bereits bestehende Angriffszielbindung eines Piraten. Es findet **keine**
  eigene Sensor- oder Aggressionsentscheidung des Testlabors statt.
- Der Karriere-Miner verwendet `npcDefenseReaction` und die aus
  `npcCombatant` abgeleitete zivile Kampf-Doktrin für die Entscheidung
  **fliehen oder kämpfen**. Ein unbewaffneter Miner flieht.
- `SectorNpcState.combatMovement` erfasst den Angriff im vorhandenen
  persistenten NPC-Zustand. Der native `NpcLocalMiningService` stoppt dadurch
  Scan/Abbau und Mining-Laser, bevor der nächste Abbauzyklus läuft.
- Für die tatsächliche Flucht-/Kampfflugbewegung verwendet FleetCombat
  `moveCombatant` aus dem vorhandenen strategischen Kampfsystem;
  `syncCombatPose` hält die Position des originalen lokalen Miners synchron.
  Der Miner erhält niemals gleichzeitig eine zweite Arbeits-Flugbewegung.
- Nur beim Verteidigen wird ein Gegner als Schussziel gesetzt; der fliehende
  Miner bewegt sich vom Angreifer fort und schießt nicht zurück.
  Verliert der Pirat das Angriffsziel, geht die Bewegungsautorität zurück
  an den Karriere-Feldservice. Kampfschaden wird in NPC-Hülle zurückgeschrieben.
- Regression: `fleet-career-mining-bridge.test.cjs` prüft Angriff,
  Unterbrechung, tatsächliche Fluchtbewegung, Pose und Rückgabe der Kontrolle.
- **Status: FOUNDATION.** Piraten-Targeting und Sensor-/Sichtlinienprüfung
  sowie volles Kampf-/Waffenverhalten müssen vor Featurefreigabe mit der
  produktiven Kampagne vollständig verbunden werden. Bestehender 1vs1-Kern
  bleibt unverändert.

Bestehende, bereits von der Kampagne verwaltete NPC-Gefechte werden weder
überschrieben noch bei Zielverlust durch den FleetCombat-Adapter gelöscht;
der Regressionstest prüft die unveränderte Zustandsidentität.

Der Karriere-Miner besitzt in den echten Vorlagen funktionierende Bewaffnung.
Deshalb wird im Integrationstest sowohl die Flucht bei geringer Aggressivität
als auch die Gegenwehr bei hoher Aggressivität nachgewiesen; bei Gegenwehr
bleibt die aus der Karriereausrüstung abgeleitete Kampf-Doktrin erhalten.

## FC-31 – Einstieg mit der bereits existierenden Karriere-Feldinstanz

- `createFleetCombatForCareerField` nimmt eine **bereits laufende**
  `AsteroidFieldWorld.field(locationId)`-Instanz entgegen. Sie erzeugt
  weder neue Asteroiden noch eine zweite Miner-/Wirtschaftsinstanz.
- Aktive Karriere-Miner werden anhand ihrer realen lokalen Schiffs-ID
  und `SectorNpcState` an die vorhandene `createFleetCareerMiningBridge`
  übergeben. Doppelte IDs und doppelte Bewegungsautorität werden abgewiesen.
- Arena und Wracks stammen von `miningFieldCombatArena` und der echten
  Feldinstanz. Weitere Teilnehmer müssen als reale Career-Teilnehmer
  übergeben werden; es gibt keine hier versteckten Testschiffe.
- `fleet-career-field-entry.test.cjs` prüft Identität der Feld- und
  Mining-Instanz, einen statt mehrfachen Mining-Ticks, Weltpositionen
  und Fehlerfälle.
- **Status: FOUNDATION, nicht produktiv verbunden.** Der Kampagnen-Controller
  muss die normale Feld-Tickautorität beim Start an FleetCombat übergeben
  und nach dem Ende zurücknehmen. Die derzeitige reguläre
  `advanceControllerFieldWorld`-Schleife darf nicht parallel laufen.
  Piraten-/Drohnen-Lebenszyklus und Persistenz müssen ebenfalls vor
  Produktivfreigabe angeschlossen werden. Formatierung der FC-31-Dateien
  wurde durch den bestehenden FleetCombat-Prettier-Workflow nachgeführt;
  vollständige Qualitätsprüfung bleibt separat nachzuweisen.

## FC-32 – Exklusive Tick-Autorität der Karriere-Feldwelt (Grundlage)

- Ein eigener `FleetFieldTickOwnership`-Lease schützt jede
  `AsteroidFieldRuntime`-Instanz gegen zwei gleichzeitige FleetCombat-Besitzer,
  doppelte Feld-Ticks, eine unberechtigte Freigabe und Reentranz.
- `beginControllerFieldFleet` übernimmt **die existierende** Feldinstanz über
  `createFleetCombatForCareerField` und lehnt den Handoff ab, wenn bereits
  ein Spielerduell oder ein NPC-Duell in diesem Feld aktiv ist.
- `advanceControllerFieldWorld` leitet während des Leases den Feld-Tick
  ausschließlich an den gemeinsamen FleetCombat-Service. Der native Miner-Tick
  erfolgt nur über die FC-28/30-Brücke. Andere nicht übernommene Felder behalten
  ihren bisherigen Kampagnen-Takt.
- `endControllerFieldFleet` gibt die Autorität nur an den identischen
  Besitzer zurück. Die normale Kampagnenwelt übernimmt dann wieder.
- Regression: `tests/combat/fleet-field-tick-ownership.test.cjs` prüft
  ausschließliche Tick-Autorität, fremde Felder, Reentranz und Rückgabe.
- **Status: FOUNDATION; keine automatische Aktivierung in produktiven
  Kampagnenbegegnungen.** Während eines Leases wird der vollständige
  bisherige Feld-Callback unterdrückt, also auch der separate native
  Piraten-/Drohnen-Tick. Die gemeinsame FleetCombat-Laufzeit muss deren
  echte Kampagnen-Adapter zuerst vollständig übernehmen, bevor dieses
  Opt-in im Gameplay aktiviert werden darf. Auch aktiver FleetCombat,
  Eintrittszeiten und Tick-Lease benötigen Save/Resume. Vor FC-33+ bleibt
  dieser Einstieg ausdrücklich ein Integrationsbaustein, kein fertiges
  kampagnenspielbares Mehrschiffgefecht. Die Formatierung der FC-32-Dateien
  erfolgt über den dedizierten FleetCombat-Branch-Workflow; CI prüft den
  formatierten Folgecommit erneut.

## FC-33 – Echte lokale Piraten und Feld-Sicherheitsdrohne (Integrationsgrundlage)

- `createFleetCareerFieldSecurityBridge` verwendet die **vorhandenen**
  `LocalPirateTraffic`- und `AsteroidSecurityDrone`-Instanzen aus
  `AsteroidFieldWorld.field(locationId)`; keine neue PvP-Route,
  Sensorlogik oder NPC-Hüllenfabrik.
- Aktive lokale Piraten beider Karrierefraktionen erhalten die Ausrüstung
  aus `createFleetCareerNpcParticipant`. Die bestehende
  `LocalPirateTraffic.tick`-KI läuft genau einmal im gemeinsamen Feld-Tick.
  Die vorhandene Intercept-Entscheidung meldet ihr Ziel an FleetCombat;
  während des eigentlichen Kampfmanövers wird `moveCombatant` des
  strategischen Kampfsystems verwendet und die Pose zurück in die
  Originalinstanz synchronisiert.
- Für die echte Karriere-Drohne gilt die vorhandene Sensorik samt
  Asteroiden-Verdeckung, Patrouillen- und Hindernisnavigation über
  `AsteroidSecurityDrone` und `createFleetDroneInterceptor`. Die
  Drohne verfolgt jeden erkannten Piraten, auch wenn er bereits kämpft.
  Eine bereits anderweitig übergebene Drohne wird nicht dupliziert.
- Schäden an Piraten/Drohne werden zum existierenden `SectorNpcState`
  synchronisiert; eine zerstörte Drohne wird auch im Feld abgeschaltet.
- Die FC-31-Fabrik führt Miner, lokale Piraten und Drohne in derselben
  `createFleetCombatService`-Instanz zusammen. Die FC-32-Tick-Lease
  verhindert, dass parallel der normale Feld-Callback läuft.
- Regression `fleet-career-field-security-bridge.test.cjs` deckt echte
  lokale Teilnehmer, Native-Traffic-Tick, Pose und keine doppelte
  Drohneninstanz ab.

**Status: FOUNDATION, nicht produktiv aktiviert.** Native Piraten nehmen
derzeit vorhandene zivile Ziele (Miner/Spieler) ins Visier; vollständige
Piraten-A/B-Feindzielwahl, gemeinsame Beute, Fraktionsdynamik, legale
Drohnenmeldungen, Nachzügler und kontinuierliche Karriere-Speicherung müssen
vor produktiver Aktivierung ergänzt werden. Außerdem basiert die
Fleet-Waffenlaufzeit noch auf vereinfachten Direkt-Treffern, nicht auf der
vollständigen Kampagnen-Physik. Die alten 1vs1-Module bleiben geschützt.
Der dedizierte FleetCombat-Branch-Workflow formatiert die neuen Dateien;
CI auf dem formatierten Folgecommit bleibt zur Freigabe verpflichtend.

## FC-34 – Fraktionsübergreifende Piraten-Zielwahl und Kampfbeitritt

- `LocalPirateTraffic.tick` verwendet weiterhin die **originale** Kampagnen-
  Route, A*-Hindernisbehandlung, Zielabstände und Intercept-Callback. Der
  neue optionale `additionalTargets`-Eingang erlaubt zusätzliche **bereits
  existierende** feindliche Schiffe; bisherige Kampagnen-Aufrufstellen
  behalten unverändertes Verhalten.
- Die pure Projektion `fleetCareerHostileContacts` verwendet das bereits
  gemeinsame `isFleetHostile` und die aktuellen FleetCombat-Snapshots.
  Pirat A und B sind gegenseitig feindlich, Verbündete bleiben ausgenommen,
  und bereits engagierte Piraten sind weiterhin angreifbar.
- Abwesende und zerstörte Piraten sowie eine nicht verfügbare
  Sicherheitsdrohne werden nicht als Phantomziele angeboten. Normale
  Miner/Spieler-Ziele bleiben beim bisherigen Karriere-Piratenverkehr.
- Über `beforeWorldTick` erhält derselbe Karriere-Service den aktuellen
  Kampfzustand vor der nächsten Zielfindung, einschließlich der aktuellen
  Positionen. Bei Nahkontakt kann ein zweiter Pirat dem Gefecht beitreten;
  die existierende `CombatEngagementManager`-Topologie bildet daraus
  ein Mehrschiffgefecht, ohne den 1vs1-Kern zu verändern.
- Regressionen: `fleet-career-hostile-contacts.test.cjs` prüft Feindschaft,
  aktives Gefecht, Tod und Abwesenheit; `fleet-career-pirate-crossfaction.test.cjs`
  prüft das Zusammenführen zweier A-Piraten und eines bereits bekämpften
  B-Piraten in dieselbe Fleet-Begegnung.
- **Status: FC-34-Implementierung, CI nach der automatischen Formatierung erneut ausstehend.** Die bestehende native
  Zielwahl bleibt entfernungsgesteuert. Dauerhafte Piraten-/Fraktionspolitik,
  geteilte Beute, Save/Resume, vollständige Waffenphysik und automatisierte
  produktive Aktivierung bleiben separat offen.

## FC-35 – Gemeinsame Beute und einmaliger Kampfausgang (Grundlage)

- FleetCombat übergibt je Simulationsschritt tatsächliche Waffentreffer
  (`sourceId`, `targetId`, Schild-/Hüllenschaden) zusammen mit den
  Kampfsnapshots an die vorhandene `afterCombatTick`-Weltbrücke.
- `createFleetCareerLootSettlement` führt einen Schadensbeitrags-Nachweis
  pro NPC-Ziel, der unabhängig von Piratenfraktions-Zugehörigkeit ist.
  Nur Piraten mit tatsächlichem Schaden erhalten einen Anteil; bloße
  Zielwahl, Treffer mit null Schaden und bereits zerstörte Teilnehmer
  begründen keinen Beuteanspruch.
- Erst beim bestätigten Hüllentod eines echten Karriere-NPCs werden
  **insgesamt höchstens zehn Fracht-Einheiten** fair im Umlauf an die
  überlebenden beteiligten Piraten vergeben. Knappes Ladevolumen wird
  berücksichtigt. Dafür wird ausschließlich die vorhandene
  `transferPirateLoot`-Routine verwendet – ohne deren geschützten
  1vs1-Code zu verändern.
- Buchungen erfolgen direkt an den bestehenden `SectorNpcState.cargo`-
  Objekten und `activity`-Feldern; kein eigenes PvP-Wirtschaftssystem.
  Ein pro Begegnung geführter Abschlussmarker verhindert doppelte
  Beuteauszahlung bei weiteren Ticks.
- Regression `fleet-career-loot-settlement.test.cjs` prüft die Aufteilung
  zwischen feindlichen Piratenfraktionen, Frachterhaltung, Ladegrenzen,
  Null-Schaden, Einmaligkeit sowie die unveränderte 1vs1-Standardgrenze.
- **Status: FOUNDATION; CI auf formatiertem Stand ausstehend.** Der Ledger/Abschlussmarker lebt aktuell nur
  im laufenden FleetCombat und benötigt versionierte Save/Resume-Unterstützung.
  Rechtliche Konsequenzen, Wrackgenerierung, Markt- und Versicherungs-
  Ereignisse sowie vollständige Waffen-/Projektilphysik sind nicht Teil
  dieses Arbeitsschritts. Produktive Freigabe bleibt gesperrt.

## FC-36 – Kampagnen-Speichersperre während des Kampfes (Entscheidung geändert)

- **Neue verbindliche Nutzerentscheidung:** Laufende Gefechte werden nicht
  gespeichert. In der Kampagne darf der Spieler während eines 1vs1- oder
  FleetCombat-Gefechts **nicht speichern**; Laden eines zuvor gespeicherten
  Spielstands bleibt auch mitten im Gefecht erlaubt und beendet die bisherige
  Sitzung über den bestehenden vollständigen Controller-Neustart.
- `controllerCareerSaveBlockReason` führt die Prüfung unmittelbar vor
  `createCareerSaveStore.save` aus; ein nicht abschließend verrechnetes
  Spieler-Kampfergebnis (`combatResultPending`) bleibt gesperrt.
  Die bisherigen Beschränkungen auf ruhenden Orbit/Hafen bleiben bestehen.
- Das Kampagnen-Einstellungsmenü zeigt den Grund an und deaktiviert
  **nur** die Schaltfläche Speichern; Laden bleibt unverändert verfügbar.
  Eine zweite Prüfung beim tatsächlichen Speichern verhindert Umgehungen
  durch einen zwischenzeitlichen Zustandswechsel.
- Auch eine aktive exklusive FC-32-Feld-Lease blockiert vorsorglich das
  Speichern, da weder das laufende Gefecht noch dessen FC-35-Beuteledger
  im bisherigen Karriere-Checkpoint enthalten sind. Bereits vorhandene
  **separate NPC-1vs1-Gefechte** lösen keine neue globale Sperre aus.
  Für rein autonome NPC-Fleet-Gefechte sind konsistente Save-Grenzen
  später ausdrücklich zu klären; bis dahin bleibt diese Lease-Sperre.
- Die Speicherfreigabe erfolgt erst nach dem Kampfergebnis und Rückgabe
  der Fleet-Tick-Autorität. PvP erhält keinen Karriere-Speichermechanismus.
- Regression `fleet-career-save-policy.test.cjs` prüft 1vs1, eingebettete
  Kämpfe, Ergebnisphase, Fleet-Lease, normales Speichern und unverändertes
  Laden; `fleet-field-tick-ownership.test.cjs` prüft die Lease-Freigabe.
- **Entscheidung ersetzt frühere Save/Resume-Pläne:** Die Anforderung,
  laufende FleetCombat-Projektile, Schaden, Mitglieder und Beuteledger
  zu serialisieren, ist gestrichen. Die bereits bestehenden Karriere-
  Checkpoint-Daten außerhalb eines Gefechts bleiben unverändert.
  FC-36 ist auf den dedizierten Controller-Settings-Adapter aufgeteilt.
  Der reguläre Quality-Gate überprüft den automatisch formatierten
  Folgecommit einschließlich der Architekturgrenze von 500 Dateizeilen.

## FC-37 – Persistente FleetCombat-Kampfwracks (Grundlage)

- Nach jeder FleetCombat-Schadensrunde registriert ein eigenständiger
  `createFleetCareerWreckSettlement`-Adapter zerstörte **echte Karriere-NPCs**
  (keine synthetischen Spieler/Tests-Schiffe). Er verwendet unverändert
  `addDestroyedShipWreck` aus dem existierenden Kampagnen-Bergungsservice.
- Pro zerstörtem Schiff entsteht höchstens ein physikalisch darstellbares,
  bergbares Wrack; mehrere simultane Abschüsse erzeugen mehrere Wracks.
  Zeitlich spätere Abschüsse werden ebenso verarbeitet.
- Bei Controller-Handoff wird die Registrierung über das bereits
  persistierte `AsteroidFieldWorld.registerCombatWrecks` ausgeführt.
  Die normalen Feld-Checkpoints speichern Wrackpositionen, Varianten und
  Bergungsressourcen ohne neuen FleetCombat-Speicherstand.
- Tests: `fleet-career-wreck-settlement.test.cjs` kontrolliert zweimalige
  Verarbeitung, mehrere zerstörte NPCs, verzögerte Verluste und
  Kollisions-/Darstellungsdaten bei neuer Arena-Montage.
- **Noch nicht produktiv aktiviert:** Dynamischer Eintrag neu entstandener
  Wracks in die _bereits aktive_ Kampfarena und der volle Kampfabschluss
  inklusive Legal-/Reputationsfolgen bleiben offen. Der vorhandene
  1vs1-Wrackgenerator bleibt unangetastet. FC-36 verbietet das Speichern
  während laufender FleetCombat-Gefechte; außerhalb werden diese Wracks
  über das normale Karriere-Feldcheckpoint mitgenommen.
  Die FC-37-Qualitätsprüfung erfolgt nach der automatischen Formatierung
  erneut auf dem formatierten Feature-Branch.

## FC-38 – Neue Wracks sofort in der aktiven FleetCombat-Arena (Implementierung)

- Der FC-37-Adapter erzeugt und persistiert Wracks weiterhin ausschließlich über die bestehende Kampagnen-Bergungsfabrik und die Feldwelt.
- Nach der Schadensrunde ergänzt `appendCombatWrecksToArena` neu registrierte Wracks unmittelbar in **derselben** FleetCombat-Arena, statt die Arena neu zu erstellen. Ihre vorhandene `wreckCombatBody`-Geometrie wird unverändert wiederverwendet: Darstellung, Silhouetten-Kollisionsradius, Drift und Rotation.
- Die bereits vorhandene `resolveCombatAsteroidContacts`-Kollisionsroutine und Hindernisnavigation finden diese Körper ab dem nächsten Simulationsschritt. Es gibt keinen zweiten Kollisionssolver.
- Wiederholte Schadensrunden dürfen dieselbe Wrack-ID nicht erneut einfügen. Später zerstörte NPCs erscheinen zusätzlich in der bereits laufenden Arena.
- Regression: `tests/combat/fleet-career-wreck-settlement.test.cjs` prüft sofortige Einfügung, Kollisions-/Navigationskörper, native Kontaktgeometrie, idempotente Wiederholung und nachfolgende Abschüsse.
- **Status: Implementiert, noch nicht als CI-grün bestätigt.** Automatische Kampagnenaktivierung und vollständige Waffen-/Renderer-Parität bleiben offen; der geschützte 1vs1-Kern bleibt unverändert.

## FC-39 – Native Waffensteuerung und Geschossflug für N Schiffe (Implementierung)

- Die vereinfachte `fleetDirectShot`-Soforttrefferfunktion wurde entfernt. Die gemeinsame
  FleetCombat-Laufzeit verwendet `createFleetWeaponPhysics` mit **vorhandenen**
  Kampagnen-Modulen für Waffenkategorien, Hardpoints/Waffenwinkel,
  `selectFireControlVolley`, `weaponCycleSeconds`, Cooldowns, Feuerleit-Kadenz,
  Treffer-/Kritischwurf, Schaden, Schildsegmente, Panzerung, Subsysteme und
  `firstObstacleHit`. Keine zweite Schadens- oder Feuerleit-Tabelle.
- Laser/Rail: Sichtlinie, Waffenmündung, Strahlenende, Schildtreffer und Deckung
  werden auf Basis der bisherigen 1vs1-Funktionen berechnet.
- Plasma/Autokanone: fliegende Weltkoordinaten-Geschosse verwenden dieselbe
  `ballisticInterceptPoint`-Vorausberechnung, Fluggeschwindigkeit,
  Schild-Segmenttests, Rumpfkontakt und Hindernis-Raycast. Schäden werden
  **erst beim tatsächlichen Einschlag** gebucht.
- Lenkflugkörper: vorhandener begrenzter Kurswechsel, Hindernisprüfung,
  Flugzeit und Überschussbehandlung. Verfehlte Geschosse verursachen
  nach dem Vorbeiflug keinen Schaden mehr.
- Die FleetCombat-Snapshots enthalten aktive Flugkörper und Strahlen für
  den späteren gemeinsamen Renderer; Trefferereignisse für FC-35 entstehen
  erst bei einem echten Schild- oder Hüllenschaden (keine Beute für Fehlschüsse).
- Regression `fleet-weapon-physics.test.cjs` prüft native Laser-Treffer,
  Kollisionsdeckung, Autokanonen-Flugzeit, Hüll-/Schild-Buchung, Raketen-
  Blockade und neutrale Drittparteien. Die bisherigen
  `fleet-combat-service.test.cjs`-Mehrschiff-/Late-Join-Tests bleiben Pflicht.
- **Status: Implementiert; Lint, Typprüfung und Persistenzarchitektur bestehen. Die FC-38/39-Ausnahmen des bestehenden 1vs1-Diff-Guards wurden explizit geprüft und ergänzt. Gesamt-CI auf formatiertem Stand weiterhin erforderlich.** Dies ist **noch
  keine vollständige Waffen-/Kampfparität**: Energieverwaltung, Welt-Asteroiden-
  Bewegung, Minen, Rammen, Traktorwürfe, komplexe Kollateraltreffer und
  vollständige visuelle Renderer-Anbindung werden getrennt integriert und
  getestet. Der geschützte 1vs1-Quellkern bleibt unverändert; die produktive
  automatische Kampagnenaktivierung ist weiterhin gesperrt.

## FC-40 – Native Minen, Rammen und Traktor-Asteroiden in FleetCombat (Integrationsstand)

- `fleet-native-specials.ts` ruft die **unveränderten** Kampagnen-Module
  `maybeDropRuntimeMine`/`advanceRuntimeMines`, `applyCombatRamImpact`
  und `maybeLaunchTractorAsteroid`/`advanceThrownAsteroids` auf.
- Ein Begegnungspaar verwendet dieselben Live-`MutableCombatant`-Referenzen und
  dieselbe Arena; es werden weder Schiffe noch Ausrüstung oder Asteroiden
  neu initialisiert. Ein gefangener Asteroid wird durch die native Routine
  aus den stationären Körpern entfernt.
- Minen benutzen den bestehenden Bestand, die native Scharfschaltung,
  Verfolgung und Schaden. Traktorwürfe behalten die native Fang-, Lade-,
  Flug- und Trefferphase. Rammkontakt wird vor der gemeinsamen physischen
  Schiffstrennung nach der vorhandenen Impuls-/Panzerungsberechnung bewertet.
- Der Adapter berücksichtigt pro Schiff nur einen Abklingzeit-Tick; eine
  aktive Zweierbegegnung kann in einer Mehrschiffszene fortlaufen, während
  weitere Paare unabhängig kämpfen.
- Wirkliche Schild-/Hüllenschäden gehen über denselben
  `FleetCombatShotSnapshot`-Meldekanal wie normale Waffen an die
  Kampagnen-Abrechnung. Mine-/Wurf-Snapshots werden ergänzt.
- Regression `tests/combat/fleet-native-specials.test.cjs` prüft
  native Ramm-Sperrzeit, Inventarverbrauch, Minenzündung und
  echten Traktor-Asteroidenwurf ohne künstlichen Soforttreffer.
- **Status: Implementiert, vollständige CI und Szenario-/Renderer-Parität noch
  nachzuweisen.** Diese Integrationsstufe ist keine produktive
  Kampagnenfreigabe. Insbesondere gleichzeitige Mehrfachdetonationen,
  Wechsel von Eigentümern/Zielen und echte grafische Anzeige
  müssen in nachfolgenden N-Schiff-Regressionen abgesichert werden.

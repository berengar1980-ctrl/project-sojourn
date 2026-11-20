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

**Aktueller Testumfang:** Der 2vs1-Prototyp startet nur mit 0 Minern, 0 Drohnen, 2 Piraten A und 0 Piraten B. Er zeigt die drei Schiffe auf einer gemeinsamen Arena mit Bewegung, Kollision und direkten Waffen-Treffern. Das Diagnose-Canvas ist nicht der finale Renderer. Die vollständige Trefferchance, Munition, Geschosse, Minen, Rammen, Traktorwürfe, NPC-Arbeit und Kampagnen-KI sind **nicht** implementiert. Der vorhandene 1vs1-Modus bleibt bytegleich.

## Prototyp-Grenzen

Die erste Laufzeit verwendet direkte Treffer statt der vollständigen Projektilsimulation. Vor jeder Freigabe müssen Waffenreichweite, Trefferchance, Laufzeiten, Munition, Rammen, Minen und Traktorwürfe auf das Kampagnenniveau gebracht werden. Ein erfolgreicher 2vs1-Test allein erfüllt FC-08 daher nicht.

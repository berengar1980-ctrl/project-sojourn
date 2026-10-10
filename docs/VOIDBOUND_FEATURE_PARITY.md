# Voidbound → Project Sojourn Feature-Parity-Matrix

**Snapshot:** 2026-10-06  
**Voidbound main:** `830ff178cb94eec1da7ded77888a922f51af944c`  
**Project Sojourn baseline:** `a19a3e8c4818aa9aef5bc17cd9030937e657a379`

## Zweck

Diese Datei ist die dauerhafte Entscheidungs- und Portierungsbasis für den Funktionsumfang von Voidbound.
Grundlage ist der autoritative Voidbound-Katalog `tests/feature-catalog.cjs` / `tests/FEATURE_MATRIX.md`:
**241 katalogisierte Features in 27 Bereichen; 117/117 Voidbound-Runtime-Dateien sind diesem Katalog zugeordnet.**

Die Sojourn-Bewertung ist absichtlich konservativ:

- **✅ Umgesetzt** – äquivalentes Kernverhalten ist auf Sojourn `main` vorhanden.
- **🟨 Teilweise** – Unterbau oder Teilverhalten existiert, aber nicht die vollständige Voidbound-Funktion.
- **⬜ Offen** – kein vollständiges Äquivalent auf Sojourn `main`.
- **🔁 Bewusst anders** – Architekturziel wird in Sojourn absichtlich anders gelöst.

„Offen“ bedeutet nicht automatisch „muss portiert werden“. In **Entscheidung** wird später pro Feature `übernehmen`, `ändern`, `verwerfen` oder `später` festgelegt.

## Verbindliche Merge-Regel

**Jeder Pull Request gegen `main`, der `src/`, `tests/` oder `resources/` verändert, muss diese Datei ebenfalls prüfen und verändern.**

Dabei gilt:

1. Prüfen, welche Voidbound-Feature-IDs vom PR betroffen sind.
2. Status und Sojourn-Bewertung anpassen, wenn sich die Parität geändert hat.
3. Wenn sich kein Feature-Status ändert, im Review-Log ausdrücklich `keine Statusänderung` dokumentieren.
4. Neue Sojourn-Features, die kein Voidbound-Gegenstück haben, werden im Review-Log genannt; die 241 Voidbound-IDs bleiben unverändert.
5. Erst danach darf der PR gemergt werden.

Automatisiert wird das durch `scripts/check-feature-parity.cjs` und `tests/quality/feature-parity.test.cjs`. Der normale `npm test`-/`npm run check`-Lauf erkennt auf Feature-Branches den Diff zu `main` und schlägt fehl, wenn `src/`, `tests/` oder `resources/` geändert wurden, diese Matrix aber unverändert blieb. Zusätzlich validiert der Test 241 eindeutige Feature-IDs und die erlaubten Status-/Entscheidungswerte.

## Gesamtstatus

| Status | Anzahl |
|---|---:|
| ✅ Umgesetzt | 41 |
| 🟨 Teilweise | 50 |
| ⬜ Offen | 148 |
| 🔁 Bewusst anders | 2 |
| **Gesamt** | **241** |

## Status nach Bereich

| Bereich | ✅ Umgesetzt | 🟨 Teilweise | ⬜ Offen | 🔁 Bewusst anders | Gesamt |
|---|---:|---:|---:|---:|---:|
| runtime | 1 | 3 | 1 | 1 | 6 |
| character | 0 | 0 | 8 | 0 | 8 |
| prologue | 0 | 0 | 6 | 0 | 6 |
| dialogue | 0 | 0 | 1 | 0 | 1 |
| world | 2 | 0 | 1 | 0 | 3 |
| map | 2 | 4 | 3 | 0 | 9 |
| travel | 3 | 3 | 3 | 0 | 9 |
| settings | 0 | 0 | 2 | 0 | 2 |
| ui | 2 | 2 | 8 | 1 | 13 |
| smuggling | 1 | 0 | 11 | 0 | 12 |
| trade | 8 | 7 | 12 | 0 | 27 |
| npc | 7 | 4 | 11 | 0 | 22 |
| salvage | 0 | 1 | 0 | 0 | 1 |
| ship | 7 | 4 | 6 | 0 | 17 |
| equipment | 0 | 0 | 4 | 0 | 4 |
| crew | 4 | 8 | 11 | 0 | 23 |
| operations | 2 | 8 | 9 | 0 | 19 |
| patrol | 0 | 1 | 6 | 0 | 7 |
| customs | 0 | 0 | 10 | 0 | 10 |
| combat | 2 | 1 | 11 | 0 | 14 |
| boarding | 0 | 3 | 3 | 0 | 6 |
| save | 0 | 0 | 5 | 0 | 5 |
| audio | 0 | 1 | 1 | 0 | 2 |
| banner | 0 | 0 | 4 | 0 | 4 |
| factions | 0 | 0 | 1 | 0 | 1 |
| pirate | 0 | 0 | 1 | 0 | 1 |
| campaign | 0 | 0 | 9 | 0 | 9 |

## Aktuell wichtigste Lücken / Entscheidungsblöcke

1. **NPC-Verhalten und Ökonomie-Reife:** Denk-/Liegezeiten, unvollständige Marktkenntnis, Kapital-Sinks, Population-Recovery und Piraten-/Risikoökologie.
2. **Save/Persistence:** Autosave, Export/Import, Schema, Rollback und persistente Karriere.
3. **Crew-Tiefe:** Beziehungen, Gespräche, Moralentscheidungen, Storys, Abgänge und Heilungsloop.
4. **Ship Combat:** vollständiger taktischer/strategischer Schiffskampf.
5. **Smuggling / Customs / Factions / Patrol:** großer noch offener Designblock.
6. **Campaign / Character / Prologues:** als Sojourn-eigene Systeme neu entwerfen statt Inhalte 1:1 zu kopieren.
7. **Mining Depth:** Claims, Prospecting-Seams, Deep Inclusions und Claim-Tactics.
8. **Salvage Depth:** Distress-Rescue, Relics, Boarding-Wreck-Integration und Progression.

## Review-Log

| 2026-10-10 | Waffen-Hardpoints im Editor und Werft-Kompatibilität | Voidbound-Parität geprüft: **keine Statusänderung**. Sojourn-Schiffs-JSONs sind nun die autoritative Grundlage für Waffen-Slots, erlaubte Montageklassen und maximale Feuerwinkel. Der Hardpoint-Editor kann Position, Richtung, Winkel und erlaubte Klassen kalibrieren; Werftangebote und Einbau prüfen die tatsächlichen Einbauplätze, Kampfprojektion nutzt JSON-Limits, leere Waffenslots verschieben keine Mündungen. Bestehende JSONs ohne explizite Erlaubnisliste behalten vorläufig ihr bisheriges kompatibles Verhalten bis zur Neukalibrierung. `combat.weapon_fire` bleibt teilweise. |


| 2026-10-10 | PR #188 · Strategieplanung im Raumkampf | Voidbound-Parität geprüft: **keine Statusänderung**. Sojourn-eigene strategische Kampfplanung: Spieler- und NPC-Kampfseite beurteilen Bewaffnung, Schild-/Hüllenlage, Reichweite, Geschwindigkeit und Wendigkeit in unabhängigen achtsekündigen Zyklen mit vier Sekunden Phasenversatz. Bestehende Pläne werden mit Wechselhysterese bevorzugt; Flugsteuerung führt die gewählte Front-, Breitseiten-, Distanz- oder Minenstrategie kontinuierlich aus. `combat.weapon_fire` bleibt teilweise und `combat.flee` umgesetzt. Keine neue Voidbound-Feature-ID. |


| 2026-10-10 | PR #187 · Taktische Breitseiten-Sicherheit und Railgun-Reserve | Voidbound-Parität geprüft: **keine Statusänderung**. Sojourn-spezifische Korrektur: Breitseitensteuerung überschreibt die anschließende Minen-, Hindernis- und Randvermeidung nicht mehr. Bei fliehenden Zielen ohne Schilde kann eine geladene Railgun für den späteren Langstreckenschuss zurückgehalten werden, solange kürzere Waffen noch effektiv wirken; Regressionstests für beide Verhaltensweisen ergänzt. `combat.weapon_fire` bleibt teilweise, `combat.flee` bleibt umgesetzt. Dies ist noch keine vollständig ausgebaute taktische Kampf-KI. |

| 2026-10-10 | Voidbound Feuerleit-Impulse und taktische Waffenmontagen | `combat.fire_control` offen → **umgesetzt**: gemeinsame schiffweite Feuerleit-Impulse, sequenzielles Laden, freie Auswahl derselben verfügbaren Waffe und Mindestschussabstand bei weiterhin eigener Lafettenladezeit. `combat.weapon_fire` bleibt **teilweise** (keine persistente Munitionsverwaltung und keine vollständige Kampf-Energieüberlastung). Neue Sojourn-spezifische feste Front- und Backbord-/Steuerbord-Schusswinkel, echte Waffenhardpoints aller 28 Schiffvarianten, ungelenkte kinetische Geschosse, lenkende Raketen, angepasste Railgun-/Autokanonenbalance, taktische Ausrichtung beider Schiffs-Autopiloten und abgetrennte Feuerleit-Snapshots. |

| 2026-10-10 | Raumkampf Phase 1B – Enterseilphysik | Voidbound-Parität geprüft: **keine Statusänderung**. Der einmalige Combat-Greifhakenversuch sowie die bestehende Schild- und Trefferchance bleiben unverändert. Nach erfolgreichem Haken zieht eine Winde das Seil ein, Seilspannung überträgt gleich große entgegengesetzte Impulse bei weiterlaufender Trägheit und ein verfügbarer Traktorstrahl erhöht die Einholgeschwindigkeit; Fehlschläge koppeln nicht. Spieler/NPC-Verhalten und Snapshots sind symmetrisch. Nur der Sojourn-Raumkampf wird erweitert, nicht das Voidbound-Missionsbergungssystem. |

| 2026-10-10 | Raumkampf Phase 1 – gemeinsame Bewegungswerte und Trägheit | Voidbound-Parität geprüft: **keine Statusänderung**. Kampfbewegungswerte werden für Spieler/NPC aus demselben Schiffstyp abgeleitet; die physikalische Kampfbewegung nutzt eine gespeicherte Geschwindigkeitsrichtung, die beim Drehen nicht sofort rotiert. Kollisionsdämpfung, Traktorsperre und Snapshot werden konsistent aktualisiert. `combat.flee` bleibt umgesetzt; `combat.weapon_fire` bleibt teilweise. Sojourn-eigene physikalische Grundlage für zukünftige Waffenwinkel und Crew-/Werftboni. |

| 2026-10-09 | Paket D · Combat Grapple und Boarding | Bei Schild 0 kann jedes Schiff pro Gefecht genau einen Greifhakenversuch bei höchstens 900 m Entfernung unternehmen: Erfolgswahrscheinlichkeit 30 % bei voller Hülle, linear auf 60 % bis 15 % Hülle. Misserfolg zeigt Haken und Abpraller; Erfolg koppelt die Schiffe, beendet den Raumkampf und führt zum taktischen Enterkampf. NPCs handeln symmetrisch, der Spieler verteidigt gegen NPC-Enterangriffe. Persönliche Ausrüstung wird nur nach gewonnenem Enterkampf erbeutet und im Crew-Inventar registriert, nicht bei gewöhnlichen Raumkampfsiegen. Neue Regressionstests. Keine Änderung an bestehenden Schiffshardpoints. |

| 2026-10-09 | Paket C · Schleppphysik-Feinschliff | Voidbound-Parität überprüft: keine Statusänderung. Paket-C-Schleppbewegung verwendet feste Simulations-Teilschritte für stabileres Verhalten bei schwankender Framerate; die Drehung des schweren Havaristen folgt seiner Bewegungsrichtung verzögert, statt sofort einzurasten. Regressionstest vergleicht variable und konstante Zeitschritte. |

| 2026-10-09 | Paket B · Greifhaken und Schleppseil | Voidbound-Parität geprüft: `salvage.distress_rescue` bleibt teilweise; nach Abschleppannahme startet der Greifhaken mit sichtbarem Anflug vom eigenen Mount, der Havarist bekommt Trägheit, das flexible Seil reagiert auf Kurven, Spannung und Bremsen. Der lokale Austritt verlangt beide Fahrzeuge im Exit-Bereich, die Route zur Werft startet erst nach manuellem Verlassen. Bestehende Schiffshardpoints unverändert. Keine Statusänderung der Voidbound-Feature-Matrix. |

| 2026-10-09 | Paket A · Notruf-Inszenierung, Schiffshardpoints und Karten-Austritte | Voidbound-Parität geprüft: `salvage.distress_rescue` bleibt teilweise; Notrufdiagnose erzeugt einen sichtbaren verzögerten Scan, gefälschte Notrufe können zu taktischem Boarding führen und Credits werden nach Hilfeleistung direkt angezeigt. Havaristen nutzen passende vorhandene Schiffssprites; jeder registrierte Schiffstyp erhält fehlende Traktorstrahl- und Greifhaken-Montagepunkte, ohne bestehende Hardpoints zu verändern. Lokale Bergungs- und Mining-Karten erhalten einen markierten Austrittspunkt; Kampf-Flucht erfolgt nur an einem markierten Punkt. Der Abschleppauftrag startet die Sternkarten-Reise erst am lokalen Ausgang. Greifhaken-Seilphysik bleibt Paket B; keine Statusänderung der Voidbound-Feature-Matrix. |

| 2026-10-09 | Diagnosebutton für Notrufereignisse | Voidbound-Parität geprüft: keine Statusänderung. Sojourn-Bergungsoberfläche verarbeitet Diagnose, Notreparatur, Abschleppen und Evakuierung konsistent über `pointerdown` mit unterbundener Ereignisweitergabe, damit lokale Szeneneingaben den Einsatz nicht überlagern. `salvage.distress_rescue` bleibt teilweise. |

| 2026-10-09 | PR #177 · Notruf-Parität und zeitgesteuerte Sektor-Events | Voidbound-Parität geprüft: `salvage.distress_rescue` bleibt **teilweise**, da trotz erweiterten Schadenprofilen, Crew-Diagnose, physischer Abschleppfahrt zur Werft, Auszahlung bei Übergabe und NPC-Rettungsabschlüssen noch nicht alle Voidbound-Einsatzvarianten und Integrationen nachgewiesen sind; `salvage.special_events` bleibt **umgesetzt**. Spieler erhalten eine Annahme- und Bearbeitungsfrist, danach verschwinden unvollständige Signale aus der Spielerkarte und werden NPC-Salvagern freigegeben. Die Erweiterung betrifft keine anderen Voidbound-Feature-IDs; keine Statusänderung. Siehe `tests/salvage/distress-rescue-parity.test.cjs` und `tests/salvage/sector-salvage-events.test.cjs`. |

| Datum | PR/Änderung | Ergebnis |
|---|---|---|
| 2026-10-09 | CircleCI-Mehrfachdiagnostik (Nachfolge PR #118) | Voidbound-Parität geprüft: keine Statusänderung. Reine CI-Infrastrukturverbesserung: fehlgeschlagene CircleCI-Schritte melden mehrere konkrete Fehlerzeilen als GitHub-Commit-Status. GitHub Actions werden nicht verwendet. |
| 2026-10-09 | Cargo-Routenklick und farbige Handelsmarker | Voidbound-Parität geprüft: keine Statusänderung. Sojourn-spezifische visuelle Hervorhebung bekannter Marktchancen und Nachfrageprofile; Route bleibt eine explizite Navigation ohne automatischen Flug. |
| 2026-10-09 | PR #175 · Traktorstrahl, Abfanggeschwindigkeit und Laser-Präzisierung | Voidbound-Parität geprüft: keine Statusänderung. Sojourn-spezifische Komponente Traktorstrahl Mk I–VI mit Slot für alle Schiffstypen, Standardausrüstung für Miner/Bergung, Spieler- und NPC-Kampfausrüstung sowie schildabhängige Fluchtsperre und reduzierte Zielgeschwindigkeit bei Traktorbindung; schnellere Patrouillen- und Piratenschiffe; dünnere Laserstrahlen mit Hardpoint-Mündungsblitz. `combat.flee` bleibt umgesetzt und `combat.weapon_fire` teilweise; kein neues Voidbound-Feature eingeführt. |\n| 2026-10-09 | Sternkarten-Fracht: Gesamtmarkt und Routenwahl | Voidbound-Parität geprüft: keine Statusänderung. Sojourn-spezifische Anzeige des besten bekannten Gesamterlöses beziehungsweise einer ausdrücklich unbepreisten Nachfrageempfehlung; Käufer und Märkte sind direkt als Navigationsziel anwählbar. |
| 2026-10-09 | Erweiterung Frachthandel: niedriger Grundankauf und Nachfragehinweise | Voidbound-Parität geprüft: keine Statusänderung. Sojourn-eigene Ergänzung der Hafenmärkte für legale Waren und strukturierte Käuferhinweise ohne fingierte Livepreise. |
| 2026-10-09 | Sichtbarkeit des Sternkarten-Frachtbuttons (Nacharbeit zu PR #170) | Voidbound-Parität geprüft: keine Statusänderung. Ausschließlich CSS-Positionierung des bereits vorhandenen optionalen Frachtmarkt-Scanners; keine Änderung an Handels- oder Navigationslogik. |
| 2026-10-09 | PR #170 · Sternkarten-Frachtmarkt-Scanner | Voidbound-Parität geprüft: keine Statusänderung. Die optionale Fracht- und Verkaufsortanalyse auf der Sternkarte ist eine Sojourn-spezifische Erweiterung auf Basis vorhandener Markt-Intel, Verkaufspreise und Frachtdaten. Keine neue Voidbound-Feature-ID; Handel erfolgt weiterhin beim Andocken. |
| 2026-10-09 | PR #169 · Werft-Navigation und Schiffsvorschau | Voidbound-Parität geprüft: keine Statusänderung. Die getrennte Schiffskauf-/Komponentenansicht, Rollenfilter und Schiffsdatenvorschau sind Sojourn-spezifische UI-Erweiterungen; bestehende Voidbound-Feature-IDs bleiben unverändert. |
| 2026-10-06 | Baseline-Migration der Voidbound-Feature-Matrix | 241 Features erstmals gegen Sojourn main klassifiziert: 33 umgesetzt, 47 teilweise, 159 offen, 2 bewusst anders. |
| 2026-10-06 | PR #67 · Docked location visuals | Geprüft: angedockte Orte verwenden Sternkarten-Visuals; keine Parity-Statusänderung erforderlich (`ui.port_local_hub` bleibt umgesetzt). |
| 2026-10-06 | PR #68 · Feature parity baseline und Merge-Regel | Matrix eingecheckt; Branch-Diff-Gate und Regressionstest eingeführt; keine zusätzliche Feature-Statusänderung. |
| 2026-10-06 | PR #70 · Voidbound Crew-Skill-Effekte | Alle sieben Stationsskill-Effekte als zentrale Runtime-Formeln portiert; Mining/Bergung/Piloting/Logistics an vorhandene Sojourn-Systeme verdrahtet; `trade.logistics_fee` offen → umgesetzt. |
| 2026-10-06 | Ship weapons + mines Mk I–VI | Acht Waffenfamilien und drei Minentypen jeweils Mk I–VI ergänzt; Schild/Hüllen/Allround-Rollen, geschichtete Schadensauflösung und crew-/sensorabhängige Minenerkennung getestet. `ship.weapon_roles` offen → umgesetzt; `combat.weapon_fire` offen → teilweise. Minen sind eine neue Sojourn-Erweiterung ohne eigene Voidbound-ID. |
| 2026-10-07 | Sternkarten-Verfolgung und Schiffskampf | Spieler kann reale NPC-Schiffe auf der Sternkarte auswählen und angreifen; bewegliche Ziele werden physisch verfolgt, Verteidiger fliehen oder gehen zum Gegenangriff über, Kontakt startet den strategischen Waffenloop. Aggressive Patrol-NPCs können andere NPC-Schiffe eigenständig abfangen. `travel.chase` offen → umgesetzt; `combat.start` offen → umgesetzt; `combat.weapon_fire` bleibt teilweise. Vor-Kontakt-Flucht ist neu, `combat.flee` bleibt bis zum vollständigen In-Combat-Retreat offen. |
| 2026-10-07 | Crew-Skill Runtime Audit | Alle Voidbound-Verwendungen der sieben Stationsskills auditiert. Sensorik live an NPC-Kontakte, Transponder und echte historische Markt-Intel gekoppelt; Engineering-Schildregeneration mit 3/7-s Sperren portiert. Fehlende Parent-Systeme bleiben ausdrücklich READY/OPEN statt fälschlich umgesetzt. |
| 2026-10-07 | Persönliches NPC-Markt-Intel | Händler, Miner und Salvager besitzen eigene Markt-Snapshots. Lokale Märkte werden beim Aufenthalt exakt aktualisiert, entfernte Berichte altern und unbekannte Märkte beeinflussen keine Route. `npc.trade_routes` und `npc.resource_side_trade` bleiben umgesetzt; keine Statusänderung. |
| 2026-10-07 | NPC-Autonomie State Machine | Händler, Miner, Salvager und Patrol teilen eine sekundengenaue Activity-State-Machine mit Dock-/Liege-/Denk-/Lade-/Startzeiten. Persistente Persönlichkeit beeinflusst Timing und Entscheidungen; Patrols erhalten echte Ruhephasen. Bestehende NPC-Features bleiben umgesetzt; keine Statusänderung. |
| 2026-10-07 | PR #80 · Räumlicher Raumkampf | Raumkampf auf echte Top-Down-Karten umgestellt: Verfolgung führt in lokale Gefechte; in Mining-/Bergungsfeldern bleibt der Kampf in derselben Karte. Waffen fliegen räumlich mit Cooldowns, Schild/Hülle und Impact-Effekten; NPC-KI kämpft, kitet, legt Minen oder flieht. Drei Minentypen nutzen Sensor-Erkennung, Hunter-Minen verfolgen Ziele; Asteroiden und Wracks blockieren Kampfbewegung. `combat.flee` offen → umgesetzt; `combat.weapon_fire` bleibt teilweise wegen noch fehlender vollständiger Munitions-/Fire-Control-Persistenz. |
| 2026-10-07 | Sternkarten-Layout und Zoom | Zoom-Out auf die gefittete Sternkartenansicht begrenzt und Initial-Fit gegen transient kleine Viewports stabilisiert; innere Körper von Solis weggerückt, Pale Reach nach oben mittig verschoben und optisch klar von Leviathan getrennt; Stationsöffnungen auf der Sternkarte transparent und Schiff-LOD dort deaktiviert. Keine Voidbound-Parity-Statusänderung. |
| 2026-10-07 | Raumkampf-Physik, Waffen- und Schildkorrektur | Raumkampf auf träge Schiffsbewegung mit Turnrate/Beschleunigung umgestellt; Laser/Railgun als kurzlebige Hardpoint-Beams, Raketen/Plasma/Autocannon als physische Projektile. Asteroiden/Wracks blockieren Schiffe und Feuer. Kampf verwendet wieder den gemeinsamen ShieldImpactRenderer/Shield-Service mit korrekter Einschlagseite. Schadenstempo auf beobachtbare ~30–60-s-Gefechte abgestimmt. `combat.weapon_fire` bleibt teilweise, da vollständige Munitions-/Fire-Control-Persistenz weiter fehlt. |
| 2026-10-07 | Voidbound-äquivalente Piraten-NPCs | Neun physische Korsaren-NPCs in zwei rivalisierenden Banden (5/4) ergänzt. Bis eigene Assets existieren verwenden sie Patrol-Rümpfe, tragen aber unterschiedliche Vektor-Abzeichen. Strategisch wählen sie verkehrsreiche Jagdreviere, vermeiden starke Piratenballung und Patrouillendruck, verfolgen Frachter/Miner/Berger und reisende Spieler, rauben nach gewonnenen NPC-Gefechten reale Fracht und nutzen die vorhandene Raumkampf-KI. Sicherheitspatrouillen priorisieren Piratenkontakte. Wie bei Voidbound bedeutet 0 Hülle nicht Tod: Spieler, Piraten, Patrouillen und zivile NPCs werden kampfunfähig, geborgen und repariert; die persistente Identität bleibt erhalten. |
| 2026-10-07 | Selektives Mining, Sternkarten-Schiffsmaßstab und Local-Lighting | Analysierte Asteroiden können komplett oder gezielt nach 1–2 Ressourcen abgebaut werden; ungewählte Vorkommen schwinden dabei mit 50 % der individuellen Zielressourcenrate ohne Frachtertrag. Spieler-/NPC-Schiffe nutzen auf der Sternkarte dieselbe vergrößerte Maßstabsfunktion. Mining-, Bergungs- und Kampfmap erhalten stärkeres Richtungslicht, die Sternkarte unverändert. `mining.run` bleibt teilweise; keine Parity-Statusänderung. |
| 2026-10-07 | Fix selektives Mining und Ressourcen-Reveal | Zielressourcen werden pro Asteroid persistent gespeichert; zwei Ressourcen lassen sich zuverlässig markieren/wechseln. Mining-Start analysiert unbekannte Vorkommen nicht mehr automatisch; ein Ressourcenname wird erst nach tatsächlich angenommener Frachtprobe sichtbar, Nahbereichsscan identifiziert weiterhin alle Vorkommen. Keine Parity-Statusänderung. |
| 2026-10-07 | PR #93 · Voidbound-Bergungsereignisse und Werftforschung | Maximal drei zeitlich begrenzte Bergungsevents (davon höchstens ein Hilferuf) erscheinen als dynamische Sternkartenziele. Sonderwracks liefern ausschließlich modifizierbare Schiffssysteme; normale Wracks keine Schiffskomponenten mehr. Hilferufe unterstützen Diagnose, Reparatur, Abschleppen, Evakuierung und Boarding-Hinterhalte. Spieler und Salvager-NPCs können Sonderkomponenten bergen und an Werften verkaufen; der gemeinsame Forschungsstand schaltet verbesserte Werftvarianten frei. `salvage.special_events`, `salvage.component_value` und `ship.salvage_research` → umgesetzt; `salvage.distress_rescue` → teilweise. |

| 2026-10-08 | PR #160 · Audio-Einstellungen und Bergungs-Scan-Kegel | Review gegen Voidbound abgeschlossen: Die CSS-Darstellung vorhandener Umgebungs-/RCS-Lautstärkeregler wird wiederhergestellt und die Bergungsinspektion visualisiert einen zeitlich gesteuerten Scan-Kegel vom Traktor-Hardpoint zum Wrack. Keine Änderung an Ressourcenlogik, Bergungsfortschritt oder Voidbound-Parity-Status; keine Statusänderung. |

| 2026-10-08 | PR #161 · Zeitgesteuerte und sichtbare Welt-Events | Voidbound-Parity geprüft: Ereignis-/Ökonomie-Tagesfortschritt wird in der Demo anhand verstrichener Spielzeit statt Ortswechsel ausgelöst. Sonderwracks und Notrufe bleiben unabhängig vom Spielerschiff aktiv und erhalten erkennbare Kartenmarkierungen. `salvage.special_events` bleibt umgesetzt und `salvage.distress_rescue` bleibt teilweise; keine Statusänderung. |

| 2026-10-08 | PR #162 · NPC-Triebwerks- und RCS-Effekte auf der Sternkarte | Voidbound-Parity geprüft: NPC-Schiffe zeigen auf der Sternkarte Haupttriebwerksabgas bei Reisebewegung und RCS-Manövereffekte bei Richtungsänderungen anhand der Schiffshardpoints. Bestehende NPC-Bewegungs- und Darstellungsmechanik bleibt erhalten; keine Statusänderung in der Feature-Matrix. |

| 2026-10-08 | Kampf-Flucht an Kartenrändern | Parity-Review für `combat.flee`: Fliehende Schiffe werden am Arenarand nicht mehr durch normale Randvermeidung zurückgelenkt; bei ausreichendem Abstand beendet das Erreichen des Randes die Flucht. `combat.flee` bleibt umgesetzt; keine Statusänderung. |

| 2026-10-08 | Werft: Schiffshandel, Komponenten Mk I–VI und einzelner Kaufbonus | Parity-Review: Kaufbare Schiffsrümpfe werden gegen Credits freigeschaltet; Mk-I–VI-Komponenten erhalten beim Kauf genau eine gewählte Effizienz- oder Leistungsvariante und werden über das Komponenten-Inventar ausgerüstet. Bestehende Forschungs-/Bergungskomponenten bleiben getrennt; `ship.salvage_research` bleibt umgesetzt, übrige Schiffsausrüstung erhält neue Sojourn-Funktionalität ohne Statusänderung der bestehenden Matrix. |

## Vollständige Matrix

### runtime

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `runtime.canonical_modules` | Runtime uses canonical modules without version patch chains | Strict TypeScript/ES-module architecture with canonical owners; no patch-chain runtime. | offen |
| 🔁 Bewusst anders | `runtime.function_layers` | Cross-cutting extensions use the explicit function-layer registry | Bewusst nicht portiert: Sojourn verbietet Function-Layer/Monkey-Patching und nutzt explizite APIs/Komposition. | offen |
| 🟨 Teilweise | `runtime.integrity_audit` | Runtime integrity audit detects invalid NPC/market/player state and repairs NPC anchors lost with temporary wrecks | Starke Invarianten und Tests vorhanden; ein Voidbound-artiger Runtime-Audit/Repair-Pass fehlt noch. | offen |
| 🟨 Teilweise | `runtime.main_views_render` | All main screens render valid markup | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| 🟨 Teilweise | `runtime.state_model` | Canonical runtime state globals initialize and remain save-compatible | Typed State/Domain Services vorhanden; vollständige persistente Karriere-/Save-Kompatibilität fehlt. | offen |
| ⬜ Offen | `runtime.build_save_versions` | Build version and persistent save-schema version are separate diagnostics | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### character

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `character.start_screen` | Character creation start screen | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.portraits` | Portrait selection remains available | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.four_careers` | Four starter careers remain selectable | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.social_questions` | Character social questions produce profile traits | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.social_points` | Completed social profile totals exactly 12 points | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.combat_points` | Combat skill allocation totals 130 points | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.station_points` | Station skill allocation totals 245 points | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `character.custom_ship_name` | Custom player and ship names survive initialization | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### prologue

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `prologue.trader` | Trader prologue flow | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `prologue.trader_otto` | Trader prologue can recruit or leave Otto | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `prologue.patrol` | Patrol prologue and crew choice | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `prologue.miner` | Miner prologue and Hagen outcome | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `prologue.salvager` | Salvager prologue and Gerrit outcome | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `prologue.story_presentation` | All four career prologues retain story-heavy narration and character dialogue | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### dialogue

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `dialogue.player_portrait` | Whenever the captain speaks in rendered dialogue, the selected character portrait is used | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### world

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `world.locations` | Sector locations remain populated and categorized | The Narrows ist als großer Sektor mit Planeten, Stationen, Mining- und Salvage-Orten umgesetzt. | offen |
| ⬜ Offen | `world.faction_control` | Every relevant location has faction control | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `world.structural_demand` | Structural demand profiles exist for trade resources | 56 Ressourcen mit Produzenten-/Bedarfsabdeckung über die Sektorhäfen. | offen |

### map

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `map.compact_layout` | Compact star-map UI remains available | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `map.names` | Planet/location names remain visible at normal zoom | Ortsnamen werden gerendert und können inzwischen ausgeblendet werden. | offen |
| ✅ Umgesetzt | `map.navigation_line` | Navigation line supports selectable map locations | Ziele sind auswählbar; Route/Preview-Linie ist vorhanden. | offen |
| ⬜ Offen | `map.faction_legend` | Faction layer includes a visible legend | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `map.target_summary` | Target strip shows control, law, distance, services and economy | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ⬜ Offen | `map.options_popup` | Map options/help popup retains explicit open/close behavior | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `map.player_relative_danger_overlay` | System map renders cached fixed green/yellow/red world-zone clouds; ship, crew, condition and Mk progression are tracked separately as personal threat assessment | Danger-aware Routing existiert, aber nicht Voidbounds sichtbares persönliches Grün/Gelb/Rot-Overlay. | offen |
| ⬜ Offen | `map.safe_destination_rings` | Star map can highlight personally safe planet destinations whose safe route avoids red space; route planning is cached outside the render loop | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `map.curated_progression_regions` | A broad red base cloud is overlaid by irregular yellow/green corridors and islands; base regions and locations stay approximately one-third green/yellow/red while preserving role progression corridors | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |

### travel

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `travel.route_profiles` | Phase-3 route planner provides Fast/Balanced/Safe geometric courses through fixed world zones, previews risk/detour/fuel and executes the chosen polyline during travel without automatic refuel stops | NPCs nutzen safe/balanced/fast; für den Spieler fehlt die vollständige Voidbound-Auswahl inkl. Risiko/Fuel-Preview. | offen |
| ✅ Umgesetzt | `travel.start` | Travel can start to another location | Äquivalentes Kernverhalten ist in Sojourn main vorhanden. | offen |
| 🟨 Teilweise | `travel.fuel_cost` | Travel consumes the displayed fuel cost | Persistenter NPC-Treibstoff ist umgesetzt; Player-Strategic-Travel spiegelt Voidbounds Fuel-Logik noch nicht vollständig. | offen |
| ✅ Umgesetzt | `travel.arrival` | Arrival restores normal location state and opens the local Aufenthalt hub | Äquivalentes Kernverhalten ist in Sojourn main vorhanden. | offen |
| 🟨 Teilweise | `travel.market_lock` | Trading/port services are blocked while in flight | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `travel.chase` | NPC pursuit/chase state remains functional | Spieler und NPCs besitzen einen physischen Moving-Target-Chase-State auf der Sternkarte; Ziele werden dynamisch nachgeführt, Flucht/Gegenverfolgung und Deep-Space-Rückkehr bleiben navigationskonsistent. | übernehmen |
| ⬜ Offen | `travel.emergency_fuel` | Emergency fuel assistance works when stranded | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `travel.corsair_grace` | Passive player corsair interception is zone-driven from the start of a career: green lowers contact pressure, yellow is baseline and red increases both interception pressure and heavy-corsair weighting | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `travel.stationary_fast_forward` | Stationary play can toggle a realtime x10 game-hour fast-forward without the old +1h wait button | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### settings

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `settings.navigation_speed` | Navigation speed setting persists and drives travel scale | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `settings.notification_filters` | Trade/patrol/salvage/crew notification toggles work | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### ui

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `ui.responsive_navigation` | Responsive navigation keeps all primary destinations and exposes Operations as a first-class main item | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `ui.current_place` | Current location is visible in the shell | Äquivalentes Kernverhalten ist in Sojourn main vorhanden. | offen |
| ⬜ Offen | `ui.scroll_preservation` | Repeated renders preserve pane/nested scroll positions | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `ui.events_screen` | Events screen exposes filtered world events | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `ui.logbook` | Logbook remains available and bounded | Retro/System-Log existiert; kein vollständiges Voidbound Logbook/Events-Modell. | offen |
| ⬜ Offen | `ui.live_event_refresh` | Realtime loop refreshes event UI without full rerender | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🔁 Bewusst anders | `ui.action_bindings` | Canonical UI binder dispatch keeps interactive controls wired | Gleiches Architekturziel wird über typed Controller/Input-Adapter statt zentralem DOM-Binder gelöst. | offen |
| ⬜ Offen | `ui.info_hover` | Compact hover info icons reveal secondary detail and disappear when pointer/focus leaves | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `ui.port_local_hub` | Aufenthalt is a location-aware hub with local situation and focused on-site venues | Docked-Port-UI mit echtem Markt, Crew und Ship/Loadout-Kontext ist vorhanden. | offen |
| ⬜ Offen | `ui.hive_tavern_placeholder` | Makropolwelten expose an Unterdeck-Schankstube whose rumor contact unlocks after day 21 while gambling remains inactive | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### smuggling

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `smuggling.hidden_hold_intel` | The concealed cargo hold is completely hidden from UI until the paid tavern rumor unlocks its pirate-yard installation channel | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.hidden_hold_intel_staged` | The tavern informant teases an illegal opportunity, deferral preserves secrecy, return dialogue changes, and the actual hidden-hold channel is revealed only after payment | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.hidden_hold_payment_action` | The 3000-Thrones tavern payment is reliably handled after modal rerenders and reveals the hidden-hold contacts only on successful payment | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |

### trade

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `trade.charter_gate` | Commodity commerce requires a trade charter | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `trade.independent_charter` | Independent charter costs Thrones and supports custom identity | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `trade.house_charters` | Veylan/Mercator house charters apply house rules | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `trade.house_exit` | House charter can be cancelled | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `trade.independent_exit` | Independent charter can be dissolved without refund | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `trade.house_protection` | House charter reduces passive corsair interceptions | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `trade.local_buy` | Local commodity purchase changes credits, cargo and stock | Käufe verändern Credits, Cargo und Marktbestand. | offen |
| ✅ Umgesetzt | `trade.local_sell` | Local commodity sale produces authoritative payout | Verkäufe verändern Cargo, Credits und Marktbestand. | offen |
| 🟨 Teilweise | `trade.sell_all` | Sell-all flow clears eligible cargo | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `trade.cargo_direct_sale` | Cargo tab exposes direct sell controls | Cargo-first Trading erlaubt direkten Verkauf aus dem angedockten UI. | offen |
| 🟨 Teilweise | `trade.navigation_tabs` | Trade tabs and responsive main navigation preserve cargo-first trade access | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `trade.system_market` | System market compares known/estimated prices | Systemmarkt/Intel mit Routenmöglichkeiten und alternden Informationen vorhanden. | offen |
| ⬜ Offen | `trade.danger_region_filter` | System-market and cargo route comparisons can independently hide fixed green/yellow/red world-zone destinations; personal progression never recolors the geography | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `trade.risk_economy` | Dangerous trade regions carry a logistics price premium while high-value ores concentrate in dangerous mining regions | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| 🟨 Teilweise | `trade.system_market_route_intent` | System-market route buttons are visible without opening details and carry buy/sell arrival intent to the destination trade screen | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ⬜ Offen | `trade.price_colors` | Effective purchase prices retain five price bands/legend | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `trade.logistics_fee` | Logistics skill changes sale fee | Logistik-Stationsleistung steuert die tatsächliche Verkaufsgebühr und die im Port/Systemmarkt angezeigten Nettoverkaufspreise; Schiffe ohne Logistikstation erhalten keinen Bonus. | übernehmen |
| ⬜ Offen | `trade.restricted_fees` | Restricted goods pay local regulatory fees | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `trade.market_situations` | Market situations modify affected prices and expire | Zeitlich begrenzte lokale/sektorweite Marktsituationen verändern Preise und laufen aus. | offen |
| ✅ Umgesetzt | `trade.market_simulation` | Market simulation preserves resource circulation | Tägliche Produktion/Verbrauch/Nachfrage/Resource-Circulation ist umgesetzt. | offen |
| ⬜ Offen | `trade.market_sabotage` | Frachter can hire exclusive existing corsairs to sabotage a needed import resource; blockade start produces a live price/status overlay and world event, while civilian NPC routing reacts to the blockade | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `economy.career_progression_balance` | Legal market spreads are constrained so trade remains lucrative without collapsing hull progression into a few oracle-perfect routes | Grundlage ist vorhanden, aber das vollständige Voidbound-Verhalten ist noch nicht erreicht. | offen |
| ✅ Umgesetzt | `trade.market_intel` | Sensor market intel stores age/history rather than fabricating data | Sensorcrew und Sensorhardware bestimmen Reichweite und Alter der Marktinformationen; alte Daten stammen aus echten historischen Snapshots und fehlende Historie wird nicht erfunden. | übernehmen |
| ⬜ Offen | `trade.port_intel_broker` | Paid local trade intelligence reveals and refreshes targeted best buy/sell market data | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `trade.route_profit` | Best-sale route uses actual fees/fuel/charter effects | Routenfinder berücksichtigt nun die aktive Logistikgebühr; Player-Fuel und Chartereffekte sind noch nicht vollständig äquivalent. | offen |
| 🟨 Teilweise | `trade.crew_profit_share` | Crew profit shares are charged on realised income | Crew-Anteile existieren als Daten/Share-Rate; vollständige Belastung realisierter Gewinne ist noch nicht äquivalent abgesichert. | offen |
| ⬜ Offen | `trade.faction_reputation` | Trading/faction actions can change reputation | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### npc

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `npc.population` | Civilian and corsair NPC populations spawn | Persistente zivile/patrol NPCs vorhanden; vollständige zivile + Corsair-Ökologie fehlt. | offen |
| ⬜ Offen | `npc.population_continuity` | Destroyed trader, miner and salvager traffic is replaced after a delayed registration window so long-term corsair losses cannot permanently collapse the civilian economy | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `npc.ship_progression` | Established civilian captains can spend accumulated profits on their role-specific Mk-IV hull at a real shipyard; subsequent route policy automatically re-evaluates the stronger ship | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `npc.component_progression` | Civilian NPCs purchase persistent reactor/engine/shield/hull/sensor/weapon upgrades at real shipyards; derived speed, fuel efficiency and route capability use the installed loadout | NPCs kaufen persistente, rollenpriorisierte Komponenten-Upgrades an Werften. | offen |
| ✅ Umgesetzt | `npc.physical_fuel` | Civilian NPC travel consumes persistent fuel, plans refuelling legs through real service locations and resumes the final economic destination after intermediate stops | NPC-Flüge verbrauchen Fuel, planen Tankstopps und setzen das Endziel danach fort. | offen |
| ⬜ Offen | `npc.capital_sinks` | Long-running civilian profits pay crew, maintenance, insurance and periodic reinvestment/dividends so liquid cash does not compound without bound | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### salvage

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `salvage.distress_rescue` | Salvage ships receive distress calls with variable technical damage, best-technician diagnosis, repair or physical towing, critical evacuation and rare zone-weighted corsair boarding traps | Dynamische Hilferufe erzeugen variable Schadenslagen mit Diagnose über Engineering, Reparatur, Abschleppentscheidung, kritischer Evakuierung und seltenem taktischem Boarding-Hinterhalt. Voidbounds physische Schleppreise/volle Zonengewichtung ist noch nicht vollständig portiert. | übernehmen |

### npc

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `npc.civilian_visibility` | Civilian traffic remains visible through transponders | Zivile NPC-Schiffe werden über eine sensor- und hardwareabhängige Transponderreichweite sichtbar; die Sternkarte zeigt nicht mehr global alle NPCs. | übernehmen |
| 🟨 Teilweise | `npc.corsair_stealth` | Corsairs retain shorter tactical detection range | Voidbounds verkürzte Corsair-Erfassungs- und Identifikationsreichweiten sind im Sensor-Contact-Service exakt portiert; eine echte Corsair-Population fehlt noch. | übernehmen |
| ⬜ Offen | `npc.trade_charters` | Civilian NPCs receive Veylan/Mercator trade charters | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `npc.trade_routes` | Civilian NPCs buy, move and sell cargo | NPC-Händler kaufen physisch, reisen und verkaufen gegen denselben Marktstate wie der Spieler; Zielwahl nutzt persönliches, alterndes Markt-Intel und läuft über Andocken, Liegezeit, Denken, Laden, Startvorbereitung und Flug statt Sofortentscheidungen. | übernehmen |
| ✅ Umgesetzt | `npc.resource_side_trade` | Miner and salvager NPCs choose their work destination first, then may use only ordinary cargo space for one profitable low-detour trade stop before continuing to the original job | Mining-/Salvage-NPCs können auf dem Weg zum Job profitablen Nebenhandel durchführen; auch dieser verwendet ausschließlich das persönliche Markt-Intel des NPCs. | übernehmen |
| ✅ Umgesetzt | `npc.personal_route_planning` | Civilian NPCs use the shared geometric route planner with capability- and temperament-dependent safe/balanced/fast policies that automatically adapt when their ship strength changes | NPC-Routenpolitik nutzt den gemeinsamen Planner und wird zusätzlich durch persistente Risikobereitschaft, Geduld, Profitfokus, Routinen und bevorzugte Märkte beeinflusst. | übernehmen |
| ⬜ Offen | `npc.travel_corsair_risk` | Existing corsair NPCs can intercept travelling NPCs along their actual route; personal red space increases contact range and attack pressure while stronger NPCs can treat the same world space as safer | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `npc.travel_raid_repair_delay` | NPCs damaged by a strategic corsair interception actually pause for field repairs before resuming the stored route | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `npc.financial_integrity` | NPC accounts cannot remain invalid/negative | Transaktionen schützen viele Invarianten; der vollständige Voidbound Audit/Repair-Unterbau fehlt. | offen |
| ✅ Umgesetzt | `npc.resource_work` | Miner and salvager NPCs select sites and complete persistent work cycles | NPC-Miner/Salvager verwenden dieselbe Autonomie-State-Machine wie Händler: Arbeitsflug, Working-Phase, sichtbarer Scan/Abbau bzw. Bergung, volle Fracht, Denk-/Startphase und Verkaufsflug. | übernehmen |
| ⬜ Offen | `npc.market_sabotage` | NPC traders can finance anonymous corsair blockades from profitable opportunities; hired corsairs are exclusive and other civilians weigh blockade risk before routing there | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `npc.smuggling_inspections` | NPC contraband concealment, Fleet scans, inspection choices, fines and confiscation remain deterministic and bounded | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `npc.corsair_hulls` | Corsairs use corsair hull classes, not civilian freighters | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `npc.simulation_performance` | NPC simulation reuses ship-derived data and avoids redundant hourly patrol cargo scans | Service-Struktur reduziert redundante Arbeit; Voidbounds spezifischer Performance-Vertrag ist nicht vollständig portiert. | offen |
| ⬜ Offen | `npc.recovery` | Defeated patrol targets enter persistent recovery state | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### ship

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `ship.starter_classes` | Starter hulls keep class-specific slot counts and roles | Mining, Freighter, Salvage und Patrol mit rollenspezifischen Stats/Hardpoints und Varianten vorhanden. | offen |
| ⬜ Offen | `ship.medium_classes` | Mk4 hulls remain shipyard-only and arrive operational | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ✅ Umgesetzt | `ship.slot_normalization` | Installed component layout survives normalization | Persistenter Loadout-Service hält typisierte Komponenten-Slots pro Schiff. | offen |
| 🟨 Teilweise | `ship.component_picker` | Component picker shows true before/after effects | Loadout-Konsole/Slot-Wechsel vorhanden; vollständige Vorher/Nachher-Picker-UX fehlt. | offen |
| ⬜ Offen | `ship.weapon_configurator` | Weapon configurator preserves series/tier/modifiers | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `ship.weapon_tiers` | Small/medium hull weapon tier limits remain enforced | Mk I–VI sind für alle acht Waffenfamilien definiert und Loadout-Tierlimits bleiben erzwungen; mittlere/Mk4-Hüllen und vollständige Configurator-UX fehlen noch. | übernehmen |
| ✅ Umgesetzt | `ship.weapon_roles` | Shield/hull/allround weapon roles remain mechanically distinct | Acht Waffenfamilien besitzen explizite Allround-/Schild-/Hüllenrollen mit getrennten Schild-/Hüllenschäden; Spezialwaffen sind mechanisch mindestens etwa vierfach auf ihren Zieltyp fokussiert. | übernehmen |
| ✅ Umgesetzt | `ship.energy` | Ship energy reports permanent and combat load separately | Reaktoroutput sowie Base/Shield/Weapon/Combat-Last werden getrennt berechnet. | offen |
| 🟨 Teilweise | `ship.energy_overfit` | Combat-only systems may overfit while permanent load may not | Energy-Snapshot bildet Combat-Last ab; vollständige Voidbound-Validierungsregeln fehlen. | offen |
| ⬜ Offen | `ship.refuel` | Port refuel charges correct credits and fills fuel | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `ship.repair` | Port repair quote and service restore hull | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `ship.port_service_lock` | Refuel/repair/shipyard actions reject travel/chase/combat/deep space | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `ship.hull_purchase` | Hull purchase migrates crew stations and capacities safely | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `ship.loose_components` | Loose ship components occupy cargo and can be stored | Salvage-Komponenten-Inventar vorhanden; Voidbounds Component-as-Cargo/Storage-Modell noch nicht vollständig. | offen |
| ✅ Umgesetzt | `ship.salvage_research` | Salvaged special components unlock meaningful variants | Verkauf modifizierter Bergungskomponenten an einer Werft speichert pro Mk-Stufe den besten bekannten Effizienz-/Schadensbonus und schaltet daraus kaufbare Werftvarianten frei; Spieler und NPCs speisen denselben Forschungsstand. | übernehmen |
| ✅ Umgesetzt | `ship.cargo_capacity` | Normal and special cargo capacities remain enforced | Physische Cargo-Kapazitäten werden von Handel, Mining, Salvage und NPC-Arbeit genutzt. | offen |
| ✅ Umgesetzt | `ship.art` | Player/enemy hull art resolves to actual ship type | Player/NPC Renderer verwenden reale Rollen-/Variantenschiffsassets. | offen |

### equipment

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `equipment.market` | Personal equipment can be bought/sold without trade charter | Persönliches Ausrüstungs-/Marktsystem ist noch nicht umgesetzt. | offen |
| ⬜ Offen | `equipment.equip` | Inventory items can be equipped and unequipped | Persönliches Ausrüstungs-/Marktsystem ist noch nicht umgesetzt. | offen |
| ⬜ Offen | `equipment.skill_requirements` | High-tier weapons respect combat skill requirements | Persönliches Ausrüstungs-/Marktsystem ist noch nicht umgesetzt. | offen |
| ⬜ Offen | `equipment.bonuses` | Gear bonuses feed effective station/combat stats | Persönliches Ausrüstungs-/Marktsystem ist noch nicht umgesetzt. | offen |

### crew

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `crew.roster_catalog` | Hireable crew catalogue has unique identities, stats and dialogue | Alle 26 Voidbound-Hireables mit Kernstats wurden migriert; Portraits/Dialogtiefe fehlen absichtlich noch. | offen |
| ⬜ Offen | `crew.voice_profiles` | Crew voice profiles and conversation/departure extensions remain active | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.servitor_stations` | Starter station posts are filled by servitors | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `crew.hire_request` | Anfragen opens individual candidate dialogue | Echte Kandidaten können im Port angeworben werden; individuelle Dialogstufen sind noch nicht äquivalent. | offen |
| 🟨 Teilweise | `crew.hire_accept_reject` | Hiring requires explicit accept/reject and produces individual responses | Hire-Mechanik existiert; explizite Accept/Reject-Reaktionen aus Voidbound fehlen. | offen |
| ⬜ Offen | `crew.rivals` | Rival crew pairs can block each other | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.friends` | Friendly crew pairs recognize/recommend each other | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `crew.dismiss_rehire` | Dismissal/rehire preserves persistent character state | Dismiss existiert; langfristig persistenter Rehire-State ohne vollständiges Save-System noch nicht äquivalent. | offen |
| ✅ Umgesetzt | `crew.station_assignment` | Crew can be assigned to ship stations | Crew kann typisierten Schiffsstationen zugewiesen werden und beeinflusst Runtime-Stats. | offen |
| ✅ Umgesetzt | `crew.station_training` | Station duty accrues training over world time | Stationsdienst-Training/Progression ist als Foundation umgesetzt. | offen |
| ✅ Umgesetzt | `crew.combat_training` | Combat participation accrues combat training | Combat-Training ist in der Crew-Foundation umgesetzt. | offen |
| ✅ Umgesetzt | `crew.capacity` | Crew berths/minimum manning are enforced by hull | Crew-Kapazität und Manning-Penalties pro Hull sind umgesetzt. | offen |
| 🟨 Teilweise | `crew.morale` | Motivation reacts to decisions and affects station output | Motivation/Loyalty und Performance-Effekt vorhanden; entscheidungsgetriebener Morale-Loop fehlt. | offen |
| 🟨 Teilweise | `crew.loyalty` | Loyalty changes slower than motivation | Loyalty existiert im State; langsame Verhaltensprogression aus Voidbound fehlt. | offen |
| ⬜ Offen | `crew.relationships` | Directed relationships and memories persist | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.conversations` | Crew conversations queue, resolve and produce visible consequences | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.talk_pacing` | Normal crew conversations obey need/cooldown pacing | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.stories` | Multi-stage crew story follow-ups preserve history | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.hugo_story` | Hugo is a campaign-owned elite recruit whose pirate-base introduction leads into a persistent charter-linked criminal storyline | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `crew.departures` | Repeated unresolved grievances can schedule safe harbor departure | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `crew.injury_healing` | Injury state persists/heals and affects crew stories | Injury/Incapacitation beeinflusst Assignment/Boarding; zeitbasierte Heilung/Story-Verknüpfung fehlt. | offen |
| 🟨 Teilweise | `crew.card_layout` | Roster and hire candidates use portrait-left summary cards with ship skills below and responsive 3/2/1 columns | Echte Crew erscheint im Port-UI und zeigt alle sieben Stationsskills; Portrait-/Responsive-Card-UX ist noch nicht vollständig äquivalent. | offen |
| ⬜ Offen | `crew.character_header` | Character sheet keeps portrait/identity left and character navigation plus Crew action on the right | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### operations

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `operations.hub` | Operations hub exposes mining, salvage and patrol modes | Mining und Salvage existieren als Loops; Patrol ist noch kein vollständiger dritter Operationsmodus. | offen |
| ⬜ Offen | `mining.quote` | Mining quote exposes yield, fuel and duration | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `mining.prospecting` | Mining zones require prospecting before extraction and reveal estimated seams plus intrinsic resource value | Long/Short-Range-Scans identifizieren Asteroiden; Claims/Seams/Intrinsic-Value-Prospecting aus Voidbound fehlt. | offen |
| ⬜ Offen | `mining.claims` | Players can register persistent low-cost mining claims, navigate back to them and abandon them | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `mining.npc_claims` | NPC miners create, fully fund, evaluate, abandon and contest mining claims; players can steal claims with sensor, compensation and captain-relation consequences | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### npc

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `npc.captain_reputation` | NPC captains keep a persistent personal reputation toward the player, shown in the captain overview and used by claim-conflict behavior | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### operations

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `mining.deep_inclusions` | Prospected seams can contain deep signatures that require survey and multi-day deep extraction with stability risk | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `mining.claim_tactics` | Player and NPC claim thieves can wait outside sensor range, detect counter-scans and use feigned departure to catch theft | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `mining.run` | Mining is a multi-day interruptible work operation; ore is booked only after completed work and foreign claim detection is checked during elapsed time | Physisches Local-Space-Mining unterstützt jetzt ALLE oder gezielt 1–2 analysierte Ressourcen; nicht gewählte Vorkommen verlieren beim selektiven Abbau mit halber Rate Material als Verschnitt. Voidbounds mehrtägige unterbrechbare Operation/Claim-Prüfung fehlt weiter. | offen |
| 🟨 Teilweise | `mining.dynamic_events` | Mining shifts can pause for persistent decision events with safe/risky choices, yield/time/damage consequences, rare inclusions, deeper signatures and competitor pressure | Mining-Events mit Entscheidungen existieren; Claims/Deep-Inclusions/Competitor-Stack fehlt. | offen |
| ⬜ Offen | `salvage.standard` | Standard salvage cycles consume time and generate salvage | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `salvage.progression` | Routine salvage has increased baseline yield and dedicated special-cargo capacity so progression does not depend only on rare jackpot wrecks | Routine-Salvage und physische Bergung existieren; Special-Cargo/Progression-Tuning ist unvollständig. | offen |
| ✅ Umgesetzt | `salvage.special_events` | Timed special salvage signals can spawn and be pursued | Zeitlich begrenzte Bergungssignale erscheinen als dynamische Sternkartenziele, können direkt angeflogen werden, öffnen eine persistente Event-Wrackkarte und werden nach Abschluss entfernt. Maximal drei Bergungsereignisse sind gleichzeitig aktiv. | übernehmen |
| 🟨 Teilweise | `salvage.sensor_wrecks` | Sensor wreck detection depends on range/officer state | Die exakte sensorabhängige Wrackreichweite ist portiert; der lokale Wrackscan existiert, aber sektorweite versteckte/dynamische Wrackentdeckung fehlt noch. | übernehmen |
| 🟨 Teilweise | `salvage.boarding_wreck` | Boardable wrecks can spawn and enter boarding flow | Tactical-Boarding-Foundation vorhanden; Live-Wrack→Boarding-Integration ist unvollständig. | offen |
| ⬜ Offen | `salvage.component_extract` | Wreck component extraction advances world time | Physische Schiffskomponenten können aus Wracks geborgen werden. | offen |
| ✅ Umgesetzt | `salvage.component_value` | Better salvaged components have higher intrinsic value | Geborgene Komponenten werden aus Basiswert, Seltenheit und realem Effizienz-/Schadensbonus bewertet; bessere Sondervarianten erzielen entsprechend höhere Werftwerte. | übernehmen |
| 🟨 Teilweise | `salvage.component_install` | Salvaged components can be retained/installed under capacity rules | Recovered Components + Loadout-Unterbau vorhanden; vollständiger Retain/Install/Capacity-Flow fehlt. | offen |
| ⬜ Offen | `salvage.relics` | Relics can be sold or turned in to their faction | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `salvage.departure_protection` | Completed special salvage grants short encounter protection | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### patrol

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `patrol.mandate` | Imperial patrol mandate is issued only at authorized locations | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `patrol.security_mode` | Security patrol mode requires an imperial mandate | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `patrol.distress_events` | Corsair attacks can create distress events | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `patrol.distress_pursuit` | Patrol distress pursuit starts a real chase/combat | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `patrol.piracy_revokes_mandate` | Civilian piracy revokes imperial patrol mandate | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| 🟨 Teilweise | `sensors.contacts` | Sensor contact identification depends on distance/type | Sternkartenkontakte werden nach Sensorcrew, Sensorhardware und Kontaktart gefiltert; zivile Transponder sowie verkürzte Corsair-Erfassungs-/Identifikationsreichweiten sind portiert. Unterdrücken/Ignore-Flow fehlt noch. | übernehmen |
| ⬜ Offen | `sensors.suppression` | Ignored contacts can be suppressed and reset at safe harbor | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### smuggling

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `smuggling.legality` | Resources preserve legal/restricted/illegal categories | Äquivalentes Kernverhalten ist in Sojourn main vorhanden. | offen |
| ⬜ Offen | `smuggling.ui_bindings` | Smuggling and mandatory customs controls stay wired to their actions | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.hidden_hold` | Hidden cargo hold can be installed under its conditions | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.hidden_transfer` | Cargo can move into/out of hidden storage with capacity limits | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.pirate_protection` | Pirate protection can be accepted and tied to a corsair faction | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.protection_fee` | Pirate protection charges 5% only on illegal sales | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.suspicion` | Smuggling activity changes visible suspicion/control risk | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |
| ⬜ Offen | `smuggling.illegal_supply` | Illegal resources use separate black-market supply stabilization | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |

### customs

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `customs.harbor_trigger` | Harbor customs inspections can trigger without pre-revealing contraband | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.patrol_trigger` | Patrol inspections can trigger in space | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.false_positive` | Legal cargo can rarely produce a false-positive inspection | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.mandatory_modal` | Open customs encounters block underlying market/UI | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.papers` | Player can submit freight papers | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.bribe` | Harbor inspection supports discrete payment attempt | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.physical_scan` | Contraband scan occurs only on physical inspection | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.escape_resist` | Space inspection supports escape/armed resistance outcomes | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.confiscation_fine` | Detected contraband can be confiscated and fined | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `customs.context_artwork` | Space and harbor inspections use distinct final officer artwork | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### smuggling

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `npc.smuggling_detection` | NPC patrols use anomalies/false positives rather than omniscient smuggler flags | Schmuggel-/Zoll-Unterbau fehlt abgesehen von Ressourcen-Legalitätsdaten. | offen |

### combat

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ✅ Umgesetzt | `combat.start` | Ship combat initializes from actual enemy hull/source | Sternkartenkontakte werden als reale NPC-Schiffe verfolgt; bei physischem Kontakt startet der strategische Kampf mit tatsächlichem Schiffstyp, aktuellem NPC-Hüllenstatus und montierten Waffen. | übernehmen |
| ⬜ Offen | `combat.pirate_threat_tiers` | Persistent corsairs resolve into distinct light, heavy and marauder combat profiles with staggered engagement distances and weapon tiers | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.patrol_defeat_recovery` | Patrol hull defeats use a softer credits, cargo and tow-hull recovery curve while civilian defeat penalties retain legacy severity | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.realtime_timer` | Combat timer/watchdog repairs stalled runtime combat | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| 🟨 Teilweise | `combat.weapon_fire` | Player weapon fire consumes fire-control/cooldown and deals damage | Der strategische Kampf feuert montierte Waffen automatisch nach ihren Cooldowns und wendet Schild-/Hüllenschaden, Trefferchance, Crew-Boni und Krits an; Voidbounds Fire-Control-Impulse, Überlastungslogik und vollständige Munitionspersistenz fehlen noch. | übernehmen |
| ✅ Umgesetzt | `combat.fire_control` | Fire-control impulse count follows weapon slots | Der räumliche Sojourn-Kampf besitzt pro Schiff einen gemeinsamen Feuerleit-Impulsvorrat entsprechend der installierten Waffen. Schüsse verbrauchen Impulse unabhängig vom gewählten Waffentyp, Aufladung erfolgt nacheinander (0,90/0,80/0,72/0,68 s), Mindestabstand 450 ms; eigene Waffenladezeiten, Schusswinkel, Snapshots und Spieler-/NPC-Parität sind umgesetzt. | übernehmen |
| ⬜ Offen | `combat.shield_window` | Shield break opens temporary hull-damage window | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.pause` | Combat pause freezes cooldown/overload deadlines | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ✅ Umgesetzt | `combat.flee` | Flee/retreat can resolve without corrupting navigation | Räumlicher Raumkampf unterstützt Flucht als echte Taktik: Schiffe brechen aus dem Gefechtsraum aus, der Kampf wird sauber beendet und bei lokalen Gefechten wird die Endposition in Mining-/Bergungsraum zurückgeschrieben. | übernehmen |
| ⬜ Offen | `combat.victory` | Victory resolves source event, cargo/components and corsair fate | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.defeat` | Defeat consistently reduces cargo and resolves combat | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.overload_cooldown` | Overload increases weapon cooldown | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.overload_drive` | Severe overload can disable drive and prevent escape | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |
| ⬜ Offen | `combat.overload_shields` | Shield impact overload can force collapse and delay regeneration | Der strategische Voidbound-Schiffskampf ist in Sojourn noch nicht umgesetzt. | offen |

### boarding

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `boarding.ship` | Player can board eligible defeated/close enemy ship | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `boarding.simulation` | Boarding resolver returns rounds/states and applies consequences | Deterministische Tactical-Boarding-Runtime existiert; Konsequenzen/Integration sind unvollständig. | offen |
| ⬜ Offen | `boarding.wreck` | Wreck boarding uses the same resolver and preserves presentation state | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `boarding.save_restore` | Active boarding/combat presentation survives save/load | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| 🟨 Teilweise | `boarding.tactical_hex` | Ship and wreck boarding use the interactive hex encounter with AP movement, doors, directional cover, suppression, overwatch and melee disengagement | Hex-Movement, AP, Türen, Cover, Suppression und Melee sind vorhanden; volle Voidbound-Integration/Overwatch-Tiefe ist unvollständig. | offen |
| 🟨 Teilweise | `boarding.weapon_profiles` | Every current personal weapon has an explicit tactical profile; ranged weapons use distance spread and selected high-energy weapons can apply separate piercing effects | Boarding-Waffen haben taktische Profile; kompletter persönliche-Ausrüstung-Katalog aus Voidbound fehlt. | offen |

### save

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `save.autosave` | Local autosave remains available | Kein vollständiges Save-/Import-/Schema-System in Sojourn main. | offen |
| ⬜ Offen | `save.export_import` | Export/import roundtrip preserves critical state | Kein vollständiges Save-/Import-/Schema-System in Sojourn main. | offen |
| ⬜ Offen | `save.schema` | Only current save schema is accepted | Kein vollständiges Save-/Import-/Schema-System in Sojourn main. | offen |
| ⬜ Offen | `save.rollback` | Invalid/import storage failures do not overwrite live career | Kein vollständiges Save-/Import-/Schema-System in Sojourn main. | offen |
| ⬜ Offen | `save.fractional_time` | Fractional world time survives save/load exactly | Kein vollständiges Save-/Import-/Schema-System in Sojourn main. | offen |

### audio

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| 🟨 Teilweise | `audio.background_music` | Looping background music asset remains wired in index | Sojourn hat aktuell looping Deep-Space-Ambience statt Voidbounds Background-Music-Feature. | offen |
| ⬜ Offen | `audio.combat_sfx` | Laser/macro/shield/hull combat sounds remain mapped | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### banner

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `banner.editor` | Independent charter banner editor composes frame, content and symbol atlas layers | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `banner.house_identity` | Veylan/rogue and Mercator/chartist always resolve to the same house banner design | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `banner.canvas_runtime` | Final banners use the asynchronous canvas compositor in content-symbol-frame order | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `banner.persistence` | Custom layered banner/name and saved banner draft persist in player state | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### factions

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `factions.view` | Faction screen renders all sector factions and reputations | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### pirate

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `pirate.cash_tribute` | Pirate transit demands always offer an expensive Thrones buyout, including when no cargo is carried | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### ui

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `ui.quest_log` | Info contains a persistent Questlog with spoiler-aware current status and next-step guidance for Hugo and hidden-cargo storylines | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |
| ⬜ Offen | `ui.tavern_modal_controls` | Tavern rumor modal has no header close action; its staged bottom buttons are directly rebound after every render | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

### campaign

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `campaign.infrastructure` | Campaign-safe state, event hooks, quest/tavern providers, cargo/reward actions and persistent dynamic locations are exposed without concrete story coupling | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.loader_profiles` | Campaign packages are discovered through a manifest/loader boundary; production excludes opt-in test campaigns while the Mk-III profile remains manually launchable | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.missing_cargo_001` | Campaign 001 Fehlbestand exercises departure cargo loss, crew report, quest log, tavern investigation, dynamic marker, combat callback and rewards through CampaignAPI | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.missing_cargo_endings` | Campaign 001 resolves victory by kill/spare choice and defeat as explicit persistent outcomes without leaving combat or quest state hanging | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.missing_cargo_summary` | Campaign 001 restores stolen cargo on victory and presents a structured completion summary including rewards, losses and reputation | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.test_mk3_refit` | Optional test-only underdeck campaign installs Mk-III components into every available slot except the engine, which stays Mk I for power headroom | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.rogue_trader_expedition` | freier Händler expedition can scope the star map to a campaign-owned system, use campaign planet/frigate art, survive combat defeat locally and return to Helios-Mortis | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.three_headed_monkey` | Custom_11 can be swindled into the pink replacement ship; while that campaign visual remains equipped, civilian ships entering or sweeping through an enlarged proximity radius trigger one of eight cyclic dry VOX exchanges at 100% chance, using only CampaignAPI plus sanctioned function layers | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |
| ⬜ Offen | `campaign.hotplug` | Missing active campaign code is represented as unavailable while preserving save state, hiding orphan markers and allowing safe departure/reinstallation | Kein äquivalentes Sojourn-System auf main; Mechanik/Inhalt muss für Sojourn neu entschieden oder neu gestaltet werden. | offen |

### ui

| Status | Feature-ID | Voidbound-Feature | Sojourn-Bewertung | Entscheidung |
|---|---|---|---|---|
| ⬜ Offen | `ui.modal_inert_cleanup` | Blocking UI modals cannot leave the main content permanently inert after they close; tavern dialog renders in the global overlay layer | Kein vollständiges äquivalentes Verhalten in Sojourn main gefunden. | offen |

## Pflege-Regel

Wenn ein Voidbound-Feature nach Sojourn portiert, verändert oder bewusst verworfen wird:

1. Feature-ID unverändert lassen.
2. Status aktualisieren.
3. Unter **Entscheidung** `übernehmen`, `ändern`, `verwerfen` oder `später` eintragen.
4. Sojourn-Test/Modul als Grundlage prüfen, bevor ein Feature auf **✅ Umgesetzt** gesetzt wird.
5. Review-Log für jeden Feature-/Test-/Resource-PR ergänzen.
6. Matrix vor dem Merge erneut gegen den PR-Stand prüfen.

## Quellen

### Voidbound
- `tests/feature-catalog.cjs`
- `tests/FEATURE_MATRIX.md`
- `tests/README.md`
- Runtime unter `js/`
- Kampagnen unter `campaigns/`

### Project Sojourn
- `docs/NPC_AUTONOMY.md`
- `docs/VOIDBOUND_CREW_SKILL_RUNTIME.md`
- `docs/ARCHITECTURE.md`
- `docs/ECONOMY_PORT_PLAN.md`
- Runtime unter `src/`
- Regressionstests unter `tests/`

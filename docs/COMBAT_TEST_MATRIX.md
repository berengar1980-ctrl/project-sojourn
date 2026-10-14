# Harrowdrift – Kampf-Testmatrix

Stand: 2026-10-13. Ziel: Testverhalten und Lücken transparent halten. Ein bestandener Test ist **kein** Beweis für vollständige Pfad-/Balance- oder Branchabdeckung.

| Subsystem                        | Bestehende Regressionstests                                                                              | Neue Schwerpunktprüfungen                                    | Weiter zu testen                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Strategie und taktische Zustände | strategy-planner, doctrine-telemetry, tactical-diversity, contact-review                                 | Festhalten an Exchange-Aktion/Reaktion bis zum Ablauf        | Alle bedingten Planwechsel, asynchrone 4-/8-s-Takte unter Last                       |
| Initiative / Action-Reaction     | exchange-machine, exchange-roles, exchange-reactive-events, outcome                                      | Ablaufgrenzen 10/14 s; geometrische Initiative vs. Schaden   | Jede Action-Reaction-Kombination mit bewegten Zielen                                 |
| Flugphysik / RCS / Boost         | inertia, exchange-braking, rcs-demand, intercept, safety, roles                                          | End-to-End: endliche Koordinaten und Kartenbegrenzung        | Energie-/Impulsbudget pro Frame, zerstörte Antriebe, variable dt                     |
| Waffen / Feuerleitimpulse        | weapon-fire-control-arcs, line-of-sight, railgun-reserve, projectile-visual-collisions                   | Sperrzeit und Aufladung von Ladungen                         | Alle Waffenfamilien/Hardpoints in jedem Schusswinkel, Hindernisocclusion, Streuung   |
| Schaden / Schild / Subsysteme    | hull-damage-particles, subsystem-strategy, spatial-combat, shield-contact                                | Kampfende bei zerstörter Hülle                               | Rundenfehler, kritische Treffer, zerstörter Antrieb/Traktor unter simultanem Schaden |
| Flucht / Traktor                 | tractor-pulse, tractor-own-mines, tractor-asteroid-throw, tractor-interdiction                           | Fluchtdistanz, Ausgang und Traktor-Sperre bei Schildausfall  | Kombinierte Verfolgungs-/Fluchtmanöver und Traktorbedingungen                        |
| Minen / Asteroiden               | defensive-mines, tactical-mine-corridors, asteroid-impact, asteroid-motion, exchange-asteroid-navigation | Mehrfacher Seed-Durchlauf ohne ungültigen Simulationszustand | Dichtes Feld, Sackgassen, bewegte Hindernisse, Mine gegen Asteroid                   |
| Boarding / Greifhaken            | grapple-boarding, grapple-rope-physics                                                                   | —                                                            | Kampf-zu-Boarding-Übergang mit gleichzeitigen Trefferereignissen                     |
| Duell / NPC-Integration          | duel-presets, duel-telemetry, star-map-engagement, npc-aggression, spatial-combat                        | Seed-Determinismus in Alpha und normalem Kampf               | Viele Seeds über 45–60 s, Neuladen, Performance und Kampagnen-Einstieg               |

Die neuen Tests liegen in:

- `tests/combat/combat-logic-critical-contracts.test.cjs`
- `tests/combat/combat-logic-exchange-lifecycle.test.cjs`
- `tests/combat/combat-logic-end-to-end-invariants.test.cjs`

Die Testmatrix dokumentiert eine **Ausbaustufe**. Aussagen zu Prozentwerten der Testabdeckung erfordern instrumentierte Branch-/Line-Coverage. Die vorhandenen Tests werden weiterhin durch `npm test` ausgeführt.

## 2026-10-13 – kombinierte Gefechtsszenarien (PR-Erweiterung)

- `combat-combined-battle-replay`: Drei Seeds, simultan Laser/Torpedos/Minen, Asteroidenhindernis; deterministische Zustandsfolge und gültige Positionen/HP.
- `combat-combined-subsystem-damage`: Antrieb und Traktor zerstört, Trägheitsflug weiterhin vorhanden, keine sofortige Niederlage ohne Hüllenschaden.
- `combat-combined-long-duel-seeds`: Drei 48-Sekunden-Duelle, gleiche Seed-Ergebnisse und gültige Telemetrie über mehrere Strategiezyklen.

**Noch offen:** Erzwungene Treffersequenzen mit allen Waffenfamilien, Minenzündung gegen bewegte Asteroiden, automatisierter Browser-FPS-Test und vollständige Branch-Coverage. Die langen Duelle verwenden absichtlich unbewaffnete Setups und testen Zeit-/Seed-Stabilität, nicht Waffenbalance.

## 2026-10-13 – Kombinierte Treffer- und Hindernisinteraktionen

- `combat-interaction-mixed-hit-order`: aufeinanderfolgende Laser-/Torpedotreffer, Schild vor Hülle, eigenständige Trefferwirkungen.
- `combat-interaction-moving-rock-tractor-mine`: bewegter Asteroid tritt in/aus Schusslinie; Traktorwirkwurf bei gleichzeitig aktivem Minenobjekt ohne versehentlichen Verlust der Mine.

Offen: erzwungene Minenzündung durch bewegte Asteroiden und gemeinsamer Trefferzeitpunkt mehrerer Projektilarten im vollständigen Gefechtsloop. Diese Tests prüfen unabhängige Ereignispfade, nicht die noch nicht vorhandene Interaktion jedes denkbaren Objektpaars.

- `combat-interaction-engine-tractor-targeting`: gezielte Antriebs-/Traktorschäden, Schildpriorität, Flucht-Antriebsziel, Heck-/Frontwinkel, Zerstörung des Zielsystems und Hüllen-Fallback. Bereits vorhandene `combat-subsystem-strategy`-Tests bleiben bestehen.

## 2026-10-13 – Verifikation der nativen Kampfschadenswerte

- `combat-damage-migration-baseline.test.cjs` benutzt eingefrorene Legacy-Grundwerte und Tier-Multiplikatoren für 48 Waffentyp-/Stufenkombinationen und 18 Minenvarianten sowie drei Crew-/Crit-Kombinationen pro Waffe. Erwartung: gleiche effektive Hüllenschäden (Toleranz 1e-6) wie vor Entfernen des globalen Faktors.
- Der Raumkampf bezieht Schaden aus der festen Tabelle `combat-native-damage.ts`; die ursprünglichen Katalogprofile bleiben bestehen, damit andere Nutzer dieser Profile – insbesondere `mine-damage-service` – ihre bisherige Bedeutung behalten.
- Direkter Asteroidenwurf-Schaden ist absichtlich nicht konvertiert. Custom-Waffen und -Minen ohne Katalog-ID gelten als bereits nativ skaliert; sie brauchen bei Übernahme alter Rohwerte ausdrücklich eine Migration.
- **Noch zu bestätigen:** unveränderte Langzeitduelle/Seed-Verläufe sowie exakte Test-Fixtures, die `applyDamage` bislang direkt mit alten unskalierten Werten aufgerufen haben. Merge erst nach grünem CircleCI-Gate.

## 2026-10-13 – Taktische Intelligenz

Neue Regression für sofortige Neubewertung nach Antriebs-/Traktorausfall, Abstandsanpassung an manövrierunfähige Gegner, begrenztes Ausweichen bei driftenden Asteroiden und erweiterte Duelltelemetrie. Die fünf Entwicklungsziele sind als integrierte Verbesserungen begonnen: situative Reaktion, Subsystemstrategie, Distanzkontrolle, Asteroidenumfahrung und Kampfauswertung. **Noch nicht vollständig:** aktives Deckungssuchen und Minen-/Traktor-Köderpositionierung, quantitative Browser-FPS-Messung und umfassende simulierte Szenariotests der neuen Strategien.

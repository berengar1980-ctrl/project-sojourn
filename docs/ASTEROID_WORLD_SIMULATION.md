# Sojourn – Asteroiden-Weltsimulation (Issue #300, PR 1)

## Zuständigkeiten

- **`AsteroidFieldWorld`** (`src/systems/operations/asteroid-field-world.ts`) besitzt genau eine generierte `LocalSpaceInstance` je Mining-Ort und die zugehörigen NPC-Miner, Piraten und Drohnen. Ein Asteroid hat damit nur einen veränderbaren Erzvorrat.
- **Kampagnen-Tick** (`game-controller-field-world-bridge.ts`) aktualisiert auch Felder ohne Spieler. Lokale Miner benutzen denselben `NpcEconomyService.mineLocal` und vorhandene Mining-/Kollisionsregeln; Hintergrund-Piraten greifen über `StarMapEngagementService.engageNpcsInArena` an.
- **Lokale Karte** verwendet beim Eintritt dieselbe Instanz und dieselben NPC-Service-Objekte. `game-controller-scene-tick.ts` aktualisiert weiterhin die Spielerschiff-Physik und das Rendering, treibt aber nicht mehr unabhängig Miner, Piraten und Sicherheitsdrohnen an.
- **Sternkarte** bleibt Eigentümerin der NPC-Routen, Reise-/Kampfzustände und Wirtschaftsressourcen. Ein Schiff kann nicht gleichzeitig abstrakt Rohstoffe abbauen und lokal denselben Abbau simulieren.
- **Security/Fahndung** verarbeitet erfasste Kontakte aus dem jeweiligen Feld mit den vorhandenen rechtlichen Services. Rechtsstatus und Schuldzahlungen bleiben Gegenstand von PR 2.

## Simulationsstufen

Aktives Feld: direkte Updates mit einem begrenzten Frame-Delta (max. 0,08 s). Andere Felder: alle 0,25 s vier sichere Teilschritte (je 0,0625 s). Es werden keine Offscreen-Renderings erzeugt. Die Hintergrund-Kämpfe laufen im bestehenden strategischen Kampfservice, nicht in einer parallelen Schadensformel.

Die Welt beginnt mit deterministischen Feld-Seeds und einem dauerhaft gültigen Satz von Asteroiden. Beim Besuch werden weder NPCs noch Erzreserven neu generiert. Bei einem Kampf sind dieselben NPC-Kampfzustände für beide Ansichten maßgeblich.

## Abnahme und Grenzen

- Hintergrund-Mining muss auch ohne gemountete lokale Karte Erz fördern **und** dieselbe Menge aus echten Vorkommen entfernen.
- Piraten dürfen bei Spielerabwesenheit keinen unsichtbaren Spieler angreifen.
- Lokaler Wechsel darf keine zweite NPC-Simulation erzeugen.
- Drohnensichtungen und Kampfhandlungen müssen dieselben Live-NPC-Zustände benutzen.

**Bewusst separat:** Die genaue Rechts-Zustandsmaschine (PR 2) und atomare Career-Persistenz (PR 3) sind noch nicht implementiert. Bei Kampfteilnehmern werden aktuell strategische Zweierkämpfe verwendet; ein echter simultaner Dreierkampf ist nicht Bestandteil dieses PRs. Ein manueller Browsertest bleibt trotz grüner CI erforderlich.

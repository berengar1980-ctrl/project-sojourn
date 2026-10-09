# Project Sojourn — Ideen-Roadmap

**Stand:** 2026-10-10  
**Phase:** Konzept / Ideensammlung — **keine Implementierungsfreigabe**

Dieses Dokument sammelt **neue, Sojourn-eigene Ideen**. Es ist ausdrücklich **keine Aufgabenfreigabe zur Umsetzung** und ergänzt die bestehende [Voidbound-Feature-Parity-Matrix](VOIDBOUND_FEATURE_PARITY.md), statt sie zu ersetzen.

**Raumkampf-Feature-Matrix:** [SOJOURN_FEATURE_MATRIX.md](SOJOURN_FEATURE_MATRIX.md) — dort sind die zehn besprochenen Raumkampf-, Crew- und Werftkonzepte kompakt erfasst.

## Statussystem

| Status | Bedeutung |
|---|---|
| 💡 Idee | Gesammelt; Funktionsumfang und Gestaltung noch offen |
| 🧭 Konzept | Verhalten, Darstellung und Grenzen gemeinsam festgelegt |
| 📋 Geplant | Zur späteren Umsetzung freigegeben und priorisiert |
| 🚧 In Arbeit | Implementierung ausdrücklich beauftragt |
| ✅ Umgesetzt | Eingebaut und geprüft |
| ❌ Verworfen | Nicht für Sojourn vorgesehen |

## Ideenübersicht

| ID | Bereich | Idee | Status |
|---|---|---|---|
| SOJ-IDEA-001 | Raumkampf / Minen | Zeitgezündete seismische Bombe mit kreisförmiger Energiewelle | 💡 Idee |
| SOJ-IDEA-002 | Raumkampf / Spezialwaffen | Zeitverzerrungsbombe mit temporärer zeitlicher Entkopplung des eigenen Schiffs | 💡 Idee |
| SOJ-IDEA-003 | Raumkampf / Umgebung | Asteroiden durch Traktorstrahl als physische Waffen einsetzen | 💡 Idee |

## SOJ-IDEA-001 — Zeitgezündete seismische Bombe

**Vorbild für die Bildsprache:** Seismische Ladung von Slave One in *Star Wars*.  
**Einordnung:** Gewünschter **vierter Minentyp** neben Ionenmine, Hohlladungsmine und Jägermine.

**Grundidee:** Ein Schiff setzt die Bombe aus. Sie driftet im Raum und detoniert **nach einigen Sekunden**, nicht erst bei Annäherung eines Gegners. Als erster Richtwert wurden ungefähr **drei Sekunden** besprochen; der endgültige Zünder ist noch offen.

**Visuelle Wirkung (Top-down):**
- Kurzer, sehr heller Detonationsblitz.
- Ein **scharf abgegrenzter, kreisförmiger Energiering** breitet sich schnell nach außen aus — kein gewöhnlicher Feuerball.
- Der Ring trifft Schiffe, Wracks und insbesondere **Asteroiden**.
- An getroffenen Asteroiden entstehen Lichtblitze, Gesteinsausbrüche und sichtbare Bewegungsreaktionen.
- Kleine Asteroiden können weggeschleudert werden; größere können sich bewegen oder in Fragmente zerbrechen.
- Bewegte Brocken können weitere Asteroiden oder Schiffe treffen: mögliche **Kettenreaktionen** und eine dauerhaft veränderte Kampfumgebung.

**Spielerischer Reiz:** Das Manöver soll nicht nur direkten Flächenschaden verursachen, sondern das Schlachtfeld durch bewegte Hindernisse verändern — besonders wirkungsvoll in Asteroidenfeldern.

**Noch zu entscheiden:** Zünddauer, Ausbreitungsgeschwindigkeit, Ringreichweite, Intensität und Stärke der Asteroidenreaktionen, Kollisionsschaden, Schutz des eigenen Schiffs, Wirkung auf Schilde und Wracks.

## SOJ-IDEA-002 — Zeitverzerrungsbombe

**Inspiration:** Die erinnerte Spezialbombe aus *Privateer*/*Privateer 2* mit **Zeitverzerrung**. Die genaue historische Bezeichnung und Umsetzung im Originalspiel sind hier nicht als gesichert festgehalten.

**Grundidee:** Eine extrem starke Flächenexplosion. **Das eigene Schiff ist während der Explosion aufgrund einer zeitlichen Verschiebung nicht im normalen Zeitablauf präsent** und entgeht ihr dadurch. Nicht einfach nur „Bombe abwerfen und schnell wegfliegen“: Die Zeitverzerrung ist das zentrale Alleinstellungsmerkmal.

**Visuelle Wirkung (Top-down):**
- Das eigene Schiff wird für einen kurzen Moment sichtbar zeitlich entkoppelt (konkrete Darstellung noch offen).
- Eine gewaltige Explosion erfasst den umgebenden Raum, während das eigene Schiff zeitlich abwesend ist.
- Danach erscheint das Schiff wieder in der normalen Zeit; der Zustand des Schlachtfelds hat sich verändert.

**Noch zu entscheiden:** Technische/erzählerische Erklärung, Aktivierungsablauf, Zeitversatz, Wirkungsradius, Seltenheit, Kosten, Gegenmaßnahmen und ob andere Objekte ebenfalls zeitlich beeinflusst werden.

**Abgrenzung:** Kein bloßes Upgrade der seismischen Bombe; die **zeitliche Entkopplung** ist eine eigenständige Mechanik und ein eigenes visuelles Ereignis.

## SOJ-IDEA-003 — Asteroiden mit dem Traktorstrahl einsetzen

**Vorhandene Grundlage:** Traktorstrahlen existieren in Sojourn bereits als Schiffskomponenten. Ihre aktive Verwendung zum Schleudern/Abstoßen von Asteroiden im Raumkampf ist **eine Idee, kein bereits implementiertes Feature**.

**Grundidee:**
- Mining- und Bergungsschiffe können Asteroiden nicht nur sichern, sondern im Gefecht **ziehen, ablenken, abstoßen oder auf Gegner lenken**.
- Asteroiden besitzen Impuls; sie können Schiffe, Wracks und andere Brocken treffen.
- Mögliche ergänzende Anwendung: Traktorstrahl bei Manövern nutzen, indem das Schiff sich an großen Körpern entlangzieht.

**Visueller Reiz:** Ein Bergungsschiff kann einem bewaffneten Patrouillenschiff etwas entgegensetzen, ohne selbst schwere Geschütze tragen zu müssen.

**Noch zu entscheiden:** Zug-/Druckprinzip, Massen-/Reichweitenlimits, Sichtbarkeit des Strahls, Kollisionsverhalten, Schadensbalance und Verhältnis zur seismischen Bombe.

## Leitlinien für spätere Raumkampfkonzepte

- **Zuerst das Bild im Kopf:** Was sieht man aus der orthografischen 2D-Draufsicht?
- Waffen sollen sich **sichtbar unterschiedlich** verhalten, nicht nur andere Schadenswerte haben.
- Schiffe, Geschosse, Schilde, Trümmer und Asteroiden sollen nachvollziehbare räumliche Reaktionen zeigen.
- Die Ausrüstung prägt das Kampfverhalten; der Spieler muss nicht jeden Schuss und jedes Manöver selbst steuern.
- Beschädigte Schiffe können kampfunfähig werden und als Bergungsziele zurückbleiben.
- Die Ideensammlung ist offen; eine Priorisierung und Implementierung erfolgen erst nach ausdrücklicher Entscheidung.

---

**Abgrenzung zum Entwicklungsstand:** Diese drei Ideen sind **nicht umgesetzt**. Dokumentationsänderungen in dieser Roadmap dürfen nicht als Implementierungsauftrag oder als Erfüllung der Voidbound-Feature-Parity-Matrix verstanden werden.

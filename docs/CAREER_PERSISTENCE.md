# Career-Persistenz: sichere Grundlage (Issue #300, PR 3)

## Status

**Noch kein benutzbarer vollständiger Spielstand.** Diese erste Scheibe legt
den verbindlichen, versionierten und überprüfbaren Save-Container an. Es gibt
absichtlich **noch keinen Speichern-/Laden-Knopf**: Navigation, Crew, Cargo,
Marktdaten, laufende Kämpfe, Kampagnen-Receipts und viele weitere Besitzer
müssen zuerst zu einem einzigen konsistenten Restore zusammengeführt werden.
Ein nur teilweise ladbarer Spielstand würde irreversible Duplikate oder
verlorene Fortschritte erzeugen.

## Contract und atomarer Schreibvorgang

- `CareerSnapshot.version = 1` mit **14 verpflichtenden Teilzuständen**:
  `navigation, player, ships, crew, economy, npcs, operations, fields, claims,
legal, custody, combat, campaigns, world`. Das Auslassen eines Teilzustands
  wird verworfen.
- Der Datensatz enthält ausschließlich reines JSON. Laufzeitobjekte,
  Methoden, nicht-endliche Zahlen, zirkuläre Referenzen und unbekannte
  Strukturfelder werden **vor dem Schreiben** verworfen.
- Im `CareerSaveStore` ist der gesamte Snapshot **ein einziger**
  `storage.setItem()`-Aufruf. Browser-Storage schreibt diesen Schlüssel
  atomar; keine Folge von Teil-Keys und kein manuell reparierbarer Halbsave.
  Schlägt Validierung, Serialisierung oder Speicherplatz fehl, wird der
  bisherige gültige Datensatz nicht überschrieben.
- Formatkennung, Version, gespeicherte Snapshot-Payload und FNV-1a-Prüfsumme
  verhindern unbeabsichtigtes Laden von kaputten oder fremden Daten.
  Die Prüfsumme ist **keine kryptografische Signatur**.
- Die 12-MB-Grenze schützt vor maßlosen Save-Payloads.
- Alte unbekannte Versionen liefern `unsupported`; sie werden **nicht**
  erraten oder als neue Spielstände importiert. Eine echte Migrationskette
  kommt vor einer späteren Formatversion hinzu.

## Vorbereitete Fachadapter

`career-operational-registries.ts` benutzt die bestehenden
`AsteroidClaimRegistry.exportState()/restoreState()` und
`SectorLegalRegistry.exportState()/restoreState()`. Vor Export iteriert der
**autoritative** `AsteroidFieldWorld` über alle persistenten Felder und schreibt
Erzvorrat und Scanwissen ins Claim-Register. Beim Laden werden die Daten
auf JSON-Tauglichkeit, Vorfall-Limits, eindeutige IDs und plausible Werte
geprüft und in **neue Register** geladen. Erst eine spätere vollständige
Session-Komposition darf die neuen Register samt NPC-/Wirtschaftszuständen
als gültiges Spiel aktivieren.

`createControllerEconomy()` kann bereits fertig vorbereitete Rechts- und
Konzessionsregister übernehmen. Diese Option ist intern: Sie ist **keine**
Erlaubnis, nur zwei Register in ein laufendes Spiel hineinzuladen.

## Regressionstests

- Validierung der vollständigen Abschnittsliste und Detached Snapshots
- Unbekanntes Format, beschädigte JSON-Payload, falsche Prüfsumme
- Speicherplatzfehler ohne Verlust des letzten gültigen Stands
- Frische Session wird erst nach erfolgreicher Validierung aufgebaut
- Authentischer Asteroid mit verringerten Erzreserven, Konzession, Diebstahl,
  gefälschter Schiffskennung, offener Teilforderung und Haft
- Rehydratation nach Welt-Neuerzeugung und keine doppelte Vorfallsabrechnung
- Ungültige Zahlungs-/Förderbelege verhindern Restore, ohne aktiven Zustand
  zu verändern

## NPC-Sektor-Checkpoint (nächster Teil-PR)

`captureCareerNpcs` erfasst die autoritativen NPC-Objekte inklusive Sektorrouten,
Fracht, Treibstoff, Rumpfschäden und Kampfbewegung in einem unabhängigen Snapshot.
`stageCareerNpcs` prüft die Kennungen, Zielorte, aktiven Reise- und Kampfzustände
und kann daraus eine neue, vom Live-Spiel getrennte NPC-Liste vorbereiten.
Ungültige oder doppelte NPC-IDs, unplausible Ladungen und gebrochene Kampfziele
werden verworfen. Die Prüfung betrifft den NPC-Sektorzustand, **nicht** die
komplette NPC-Wirtschaft oder das lokale Asteroidenfeld.

Für vollständiges Save/Load fehlen weiter die zustandsführenden Nebenservices
(Populationsfonds, Markt/Wirtschaft, lokale Miner/Piraten/Drohnen, Kampagnen- und
Kampfautorität) und der atomare Aufbau der gesamten Karriere. Keine Save/Load-UI.

## NPC-Populationsfonds: gesicherte Nebenregister

Der `NpcPopulationService` kann nun den Versicherungsfonds und die Anzahl
bereits finanzierter Ersatzschiffe als versionierten Snapshot exportieren und
in einer **frischen** Serviceinstanz wiederherstellen. Offene Ersatztermine
liegen weiterhin an den NPC-Objekten aus PR #306. Beschädigte Zahlen und
unbekannte Versionen werden vor der Serviceerzeugung verworfen.

Das ist nur ein weiterer Teiladapter; Marktbestände, lokale Schiffe,
Wirtschaftskreisläufe und die atomare Zusammensetzung fehlen weiterhin.

## Lokale Piratenpositionen und Kampf-Rückkehrzustand

`LocalPirateTraffic.exportState()` erfasst Bewegungsposition, Kurs, Geschwindigkeit,
ausstehende Kampfkontakte und gespeicherte Rückkehrpositionen. Die neue
`LocalPirateTraffic.fromCheckpoint()` prüft Weltmaße, Seed, NPC-Referenzen,
Duplikate und Koordinaten und erzeugt ausschließlich eine neue Instanz.
So bleiben Bewegungszustände auch nach einem Kampf erhalten, sobald die
gesamte Karriere diese Daten konsistent mit den Sektor-NPCs lädt.

Noch offen sind lokale Miner, Sicherheitsdrohnen, Markt- und Kampfzustände,
sowie die atomare Zusammensetzung der gesamten Karriere. Keine Save/Load-UI.

## Sicherheitsdrohnen-Checkpoint

`AsteroidSecurityDrone.exportState()` sichert nun Position, aktuellen
Patrouillen-Wegpunkt, Betriebszustand und bereits erkannte Verstöße.
`AsteroidSecurityDrone.fromCheckpoint()` baut eine neue, unabhängige Drohne
auf und prüft Version, Scanradius, Patrouillengröße, Koordinaten und doppelte
Beobachtungskennungen. Der Beobachtungsbestand verhindert, dass derselbe
aktive Kontakt beim Laden als neue Entdeckung erscheint.

Die Drohnenzustände sind damit als Adapter vorbereitet, aber noch nicht
mit der vollständigen Career-Session, lokalen Minern, Wirtschafts- oder
Kampfzuständen verbunden. Die Save/Load-Oberfläche bleibt deaktiviert.

## Lokale Miner und Bergbauereignisse (PR #310)

`NpcLocalMiningService.exportState()` erfasst Schiffspositionen, Zielasteroiden,
Scanfortschritt, Förderzyklus, Rückkehrpositionen nach Kämpfen und die zugehörigen
Bergbauereignis-Controller. Letztere sichern laufende Ereignisse, Pausen,
Erholungszeit, Ereigniszähler und den deterministischen RNG-Fortschritt.
`createNpcLocalMiningService(options, checkpoint)` validiert vor dem Aufbau
und erstellt eine neue Instanz, ohne bestehende lokale Miner zu mutieren.

Der Erzbestand verbleibt in den bereits persistenten Asteroidenfeld-/Claim-Daten,
die Ladung im Sektor-NPC-Snapshot. Alle drei müssen beim späteren vollständigen
Career-Restore **aus demselben Save** geladen werden, sonst kann doppelter
Abbau auftreten. Noch kein atomarer Gesamtrestore und keine Save/Load-UI.

## Noch zu erledigen vor einer Freigabe

1. Für Navigation, Player/Cargo, Economy/Markets, NPC-Routen, Crew/Loadouts,
   aktive Feld-Minerschiffe/Piraten/Drohnen, Kampagne und aktive Kämpfe
   `capture`/Validierung/`prepareFreshSession` ergänzen.
2. Die ganze Session aus dem Save **neu aufbauen** und erst dann auf sie
   umschalten. Laufende Kampf- oder Haftszene darf nicht nur kosmetisch
   erscheinen; ihre Domainzustände müssen erhalten sein.
3. Feld-/NPC-/Wirtschafts-Invarianten und IDs nach Restore querprüfen.
4. UI für Save/Load einschließlich Fehlerbehandlung erst aktivieren, wenn
   kein verpflichtender Abschnitt mehr fehlt.
5. Browser-Tests mit echtem Neustart und Checkpoints vor/nach Raubbau,
   Fahndung, Begleichung und Kampagne plus 90-/180-/365-Tage-CI.

**Nicht als vollständige Career-Persistenz oder abgeschlossene Issue #300
kennzeichnen**, solange diese Punkte fehlen.

## Navigation checkpoint (next slice)

`NavigationService.exportState()` now captures the private runtime instead of the
renderer snapshot: position, heading, current route with distance and momentum,
point destinations, pursuit target, route profile and threat revision. A new
`createNavigationService(..., checkpoint)` stages an isolated navigation runtime;
invalid sector IDs, unknown route destinations and impossible progress are rejected
before any live service can be modified. The route preview cache is rebuilt.

This does **not** yet install a complete career session, restore external NPC
pursuit targets, synchronize world/campaign selection, or enable save/load UI.
It must be composed with the remaining career adapters and tested after a real
browser restart before Issue #300 can be closed.

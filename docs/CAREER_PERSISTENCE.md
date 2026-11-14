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

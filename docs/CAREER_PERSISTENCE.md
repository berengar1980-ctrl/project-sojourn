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

## Markt-Checkpoint (nach PR #310)

`captureCareerMarkets` erzeugt einen losgelösten Snapshot aller Marktbestände,
Nachfrage-, Produktions- und Preiswerte. `stageCareerMarkets` validiert die
vollständigen Markt-/Waren-IDs, die Struktur und die numerischen Werte, bevor
eine **frische** `EconomyMarketService`-Instanz zurückgegeben wird. Die
aktiven Marktobjekte werden bei Fehlern nicht verändert. Preise werden beim
Restore nicht neu berechnet, damit der gespeicherte Handelspreis bis zum
nächsten regulären Simulationsschritt erhalten bleibt.

Dies ist **nur** die Markt-Teilautorität. Wirtschaftsressourcen-Pools,
Import-/Verlustzähler, Handelsereignisse, ausstehende Geschäfte,
NPC-Handelsplanung und Markt-Intel müssen ebenfalls als konsistenter
Gesamtzustand gesichert werden. Noch keine Career-Save-Freigabe oder UI.

## Ressourcen-Pool-Checkpoint (Folgeschritt nach PR #311)

`EconomySimulationService.exportState()` erfasst Ressourcenziele, physische
Reserven, kumulierte Importe und dokumentierte Verluste zusammen mit dem
letzten Simulationstag und dem Zähler physischer Ressourcenentnahmen.
Ein versionierter Checkpoint wird vor dem Aufbau einer frischen
`EconomySimulationService`-Instanz streng gegen Warenkatalog und Seed
validiert. Wiederholtes `advanceDay` auf dem gespeicherten Tag darf die
Ressourcen nicht erneut verbuchen.

Dieser Adapter setzt voraus, dass Märkte, Player und NPC-Ladungen zum
**gleichen** Career-Snapshot gehören. Das wird hier noch nicht übergreifend
validiert; Handelsereignisse, offene Transaktionen und der gesamte
Career-Session-Restore bleiben offen. Keine Save/Load-UI.

## Architekturregel ab PR #318: Pflichtprüfung bei Feature-Änderungen

Jeder Branch mit Änderungen unter `src/` oder `resources/` muss in diesem Dokument
seine Auswirkungen auf den Career-Save nachprüfbar festhalten. Das gilt auch,
wenn keine zusätzlichen Save-Felder nötig sind: dann wird ausdrücklich
`keine Speicheränderung` mit Begründung protokolliert. Neue Domainmodule
unter `src/systems/` benötigen zusätzlich eine Zuordnung in
`docs/CAREER_PERSISTENCE_OWNERS.json`:

- `persisted`: autoritativer Zustand; Checkpoint-Adapter und Roundtrip-Test angeben.
- `derived`: ausschließlich aus gespeicherten Autoritäten rekonstruierbar; Begründung angeben.
- `transient`: bewusst nicht gespeicherter Zustand; Verlust beim Neustart begründen.

`scripts/check-career-persistence.cjs` läuft im Quick-/Full-Check und im
normalen Testlauf. Es verweigert neue unklassifizierte Domainmodule und
Branches ohne Save-Impact-Review. Bestehende Module sind zunächst nicht
vollständig im Registry inventarisiert; jede Änderung erfordert aber bereits
den Review. Die Prüfung beweist nicht automatisch korrekte Integration in
den Career-Snapshot: Für neue persistente Zustände bleiben Integrations- und
Restore-Tests zwingend.

### Persistence-Review (PR #318)

Architektur-/Qualitätsänderung, keine neue Gameplay-Autorität. Der bestehende
Career-Snapshot wird nicht verändert; **keine Speicheränderung**. Die neue
Prüfung erzwingt bei Folgefeatures den Save-Impact-Review und die explizite
Klassifikation neuer Domainmodule.

### Handelsereignisse und Marktmodifikatoren (Fortsetzung)

`MarketSituationService.exportState()` erfasst den zuletzt verarbeiteten Tag
und die noch aktiven Markt-Ereignisse mit Geltungsbereich und Warenmodifikatoren.
Der optionale Checkpoint beim Erzeugen eines neuen Services validiert
Häfen, Waren-IDs, eindeutige Ereignisse und Tagesgrenzen, ohne alte Tage
neu abzuspielen. Tests prüfen den Restore, deterministische Folgetage,
fehlende Aliase und ungültige Daten. Noch fehlt die wirtschaftsweite
atomare Session-Komposition, insbesondere Handelsaufträge/Transaktionen.

### Markt-Intel und historische Beobachtungen

`MarketIntelService.exportState()` sichert sowohl beobachtete Marktpreise
und -bestände als auch die begrenzte Historie, die für verzögerte Sensorberichte
benötigt wird. Beim Aufbau eines neuen Services werden Hafen-/Waren-IDs,
Tageswerte, Preise, Bestände und doppelte Referenzen vor Übernahme geprüft.
Der gespeicherte Kenntnisstand wird **nicht** aus Live-Märkten erneuert;
ansonsten würde Laden dem Spieler unverdiente Marktinformationen geben.
Die zugrunde liegende globale Career-Komposition bleibt offen.

### NPC-Handelszyklus und Tagesabrechnung

`NpcEconomyService.exportState()` hält den zuletzt verbuchten Wirtschaftstag
und die IDs der zugrunde liegenden NPC-Instanzen fest. Beim Neuaufbau wird
geprüft, dass alle NPCs aus dem passenden Sektorsnapshot stammen.
Der Restore startet weder die Marktkenntnis der NPCs neu noch berechnet er
bereits abgerechnete Betriebskosten/Produktionszyklen ein zweites Mal.
Die eigentlichen NPC-Handelspläne und Ladungen bleiben Teil der NPC-Zustände;
die gemeinsame atomare Composition mit Märkten und Ressourcen steht noch aus.

### Gemeinsame Wirtschaftsstaging-Gruppe

`career-economy-session.ts` setzt Marktbestände, Ressourcen-Pools,
Marktereignisse, Markt-Intel und NPC-Wirtschaftstag in einer isolierten
Wirtschafts-Servicegruppe zusammen. Ein defekter Teilcheckpoint führt zu
keiner Änderung an den bereits laufenden Wirtschaftsservices.
Der Player und die NPC-Liste müssen zuvor aus demselben Career-Snapshot
vorbereitet werden. Der Controller-Umschaltpunkt für eine vollständig
vorbereitete Career-Session ist **weiterhin nicht umgesetzt**; diese
Komposition allein ist daher noch kein nutzbarer Spielstand.

## Sektorhandel als gemeinsame Restore-Gruppe (nach PR #318)

`career-economy-integrity.ts` prüft vor dem Aufbau der Simulation die
Waren-/Marktkennungen, NPC-Fracht, Spielerfracht, autonome Handelsziele,
laufende Kauf-/Verkaufsaufträge, Nebenhandelspläne und NPC-Marktbeobachtungen.
Unbekannte Ressourcen und Handelsorte werden abgewiesen statt beim Laden
stillschweigend zurückgesetzt oder erneut ausgelöst zu werden.

`career-npc-economy-session.ts` führt den Sektor-NPC-Checkpoint mit den
Markt-, Pool-, Ereignis-, Intel- und NPC-Tagesabrechnungsständen zusammen.
Alle NPCs werden als neue Objekte validiert; diese Instanzen werden dann
auch im neuen Wirtschaftsdienst verwendet. Die ursprünglichen NPCs bleiben
selbst bei fehlerhaften Handelsaufträgen unverändert.

`career-commerce-session.ts` ergänzt die Spieler-Fracht und den Geldbeutel.
Der Spieler-Handelsservice wird erst erzeugt, nachdem die neue Marktinstanz
vorliegt. Ein anschließender Kauf verändert damit **denselben Markt**, den
auch die wiederhergestellte Wirtschaft und die NPC-Services benutzen.
Ein Regressionstest deckt den gemeinsamen Roundtrip, echte Kaufbuchung,
kaputte Handelsziele und fehlerhafte Spieler-Credits ab.

Dies ist noch **kein globaler Career-Swap**: Schiffsausrüstung, Crew, aktive
Felder, Recht, Haft, Kampf, Kampagnen und Welt müssen ebenfalls aus demselben
Snapshot aufbereitet und erst nach vollständiger Prüfung gemeinsam aktiviert
werden. Save/Load-UI bleibt gesperrt.

### Crew-Roster und Fortschritt (PR #319)

Der `CrewRosterService` kann mit `exportState()` Mitglieder einschließlich
Stations- und Kampffertigkeiten, Trainingsstunden, Verletzungen, Moral,
persönlicher Ausrüstung, Boarding-Ausrüstung sowie schiffsspezifischer
Stationsbesetzungen als versionierten Checkpoint erfassen.
`createCrewRosterService(profile, checkpoint)` validiert Identitäten,
Schiffs-/Stationskennungen, doppelte Zuordnungen und numerische Werte, bevor
es eine **neue** Roster-Instanz erzeugt. Fehler im Crew-Checkpoint verändern
nicht den bestehenden Roster. Dieser Adapter wird erst beim vollständigen
Career-Session-Staging mit Spieler/Schiffen installiert.

### Kampagnen-Receipts mit Aktivierungssperre (PR #319)

`career-campaign-session.ts` verwendet die vorhandenen versionierten
`CampaignSnapshot`- und `appliedActionIds`-Belege. Definitionen werden
beim Wiederaufbau geprüft; inkompatible oder fehlende Pakete verhindern die
Session-Vorbereitung. Vor dem globalen Session-Swap sperrt ein Action-Gate
sämtliche neuen Belohnungen und Spielweltaktionen. Erst nach erfolgreicher
Aktivierung dürfen neue Aktionen ausgeführt werden. Bereits quittierte
Belohnungen werden beim Restore nicht erneut angewendet. Das ist eine
vorbereitete Kampagnen-Teilautorität, noch keine Freigabe für einen
unvollständigen Spielstand.

## PR #319: Einheitliche 14-Domänen-Sitzung (Implementierungsstand)

**Neu implementiert (noch in Draft, ungeprüft):** Gemeinsamer Capture- und
Restore-Pfad (`career-full-session.ts`) für Navigation, Spieler (inklusive
Schmuggel, Handelsmandat und Ruf), Schiffe, Crew, Wirtschaft, NPCs, laufende
Blockaden/Patrouillen/Bergung, lokale Asteroidenfelder, Konzessionen, Recht,
Haft, Kampf, Kampagnen und dynamische Welt. `career-session-manager.ts`
verwendet den vorhandenen versionierten JSON-Store und installiert eine
vorbereitete Session erst nach vollständigem Build. Erneutes Laden eines
identischen Spielstands darf keine Buchungen oder Missionsbelohnungen
wiederholen.

**Wichtige Integrationsregeln:** Spielerhandel und Schiffe teilen denselben
Wallet; NPCs/Operationen teilen dieselben NPC-Instanzen, Markt- und
Ressourcenpool-Autoritäten. Erzbestände und Scanfortschritt werden vor den
lokalen Mining-Diensten rekonstruiert. Blockade-Kosten, Patrouillenprämien,
Notsignal-Belohnungen und Kampagnen-Aktionsbelege werden nicht erneut
vergeben. Der laufende Kampf sichert RNG-Fortschritt und interne
Physik-/Waffen-Zustände, nicht nur den Anzeige-Snapshot.

**Live-Controller-Anbindung im Draft:** `bootstrap.ts` kann einen geprüften
JSON-Spielstand vor dem Spielstart vollständig mit `prepareControllerCareer`
stagen. `createGameController` übernimmt dann diese Autoritäten für
Navigation, Markt, Spieler-Wallet, NPC-Sektor, Operations, Crew, Schiffe,
Asteroidenfelder, Kampagnen und laufendes Spieler-Raumgefecht, statt
jeweils neue Services zu erzeugen. Der Spielstand enthält das vollständige
Kapitänsprofil und den Restzähler des 180-Sekunden-Wirtschaftstags.

**Benutzeroberfläche im Draft:** Das Systemmenü bietet jetzt „Spielstand
speichern“; das Hauptmenü „Karriere fortsetzen“ bei vorhandenem,
struktur-validem Save. Im Spiel ist Speichern absichtlich auf den ruhenden
Orbit oder Hafen beschränkt und bei Flug, Tankstopp, Gefecht, taktischem
Boarding, Bergbau oder Wrackbergung gesperrt. Ungültige Spielstände verändern
keine laufende Session; ein vollständiger Browser-Neustart wird noch nicht
automatisiert getestet.

**Vor dem Merge offen:** Die reguläre CircleCI muss am endgültigen
Branch-Commit vollständig grün sein. Echte Browser-End-to-End-Tests müssen
Speichern, Neuladen und fortgesetzten NPC-/Missionsbetrieb überprüfen.
Insbesondere NPC-Schmuggel-Timer und lokale Randzustände sind noch auf
explizite Save-Abdeckung zu prüfen. Die backendseitige Sitzungsverwaltung
und der Browser-Neustart sind zwei unterschiedliche Integrationswege; die
UI bietet noch kein unterbrechungsfreies Laden in eine bereits aktive
Controller-Instanz.

**Gemeinsame Abnahme:** Die CircleCI-Fail-Diagnose führt nach einem roten
Qualitätsgate Formatierung, Lint, TypeScript, Dependency, Persistence-
Architekturprüfung, Tests und Build in einem Durchlauf weiter aus, damit
Fehler gesammelt statt schrittweise korrigiert werden können.

### Save/Load-Menü (PR nach #320)

**Keine Speicheränderung:** Die UI nutzt ausschließlich den vorhandenen lokalen
Career-Slot (`sojourn.career.v1`) und den bestehenden 14-Bereiche-Snapshot.
Das Hauptmenü stellt „Neues Spiel“, „Karriere fortsetzen“ und „Spiel laden“ bereit;
beide Ladeaktionen nutzen den bestehenden atomaren Staging-/Restore-Pfad.
Im Esc-Menü steht neben Speichern auch Laden. Das neue Spiel wird vollständig
validiert und vorbereitet, bevor die laufende Sitzung beendet wird. Vor Verlust
ungespeicherten Fortschritts wird ausdrücklich bestätigt. Mehrere Slots, ein
Datei-Import/Export und vollständige visuelle Browser-Neustarttests sind damit
**noch nicht** implementiert. Speichern bleibt auf ruhenden Orbit/Hafen
beschränkt.

### NPC-Orte außerhalb von Handelsmärkten (Save/Load-Bugfix)

**Keine Speicheränderung:** Die Economy-Integritätsprüfung unterscheidet
Weltorte für NPC-Positionen und Reiseziele von Standorten mit echten
Handelsmärkten. Sicherheitsdrohnen und andere NPCs an Asteroidenfeldern
werden beim Wiederherstellen nicht mehr als ungültige Wirtschaftsidentität
abgelehnt. Marktbeobachtungen werden weiterhin ausschließlich gegen
existierende Handelsmärkte validiert. Vorhandene Save-JSON-Daten bleiben
unverändert und werden nicht migriert.

### Bestätigungsdialoge im Systemmenü (UI-only, PR #323)

**Keine Speicheränderung:** Die bisherigen Browser-Bestätigungen für
„Spielstand laden“ und „Zum Hauptmenü“ werden durch Bestätigungsansichten
innerhalb des vorhandenen Systemmenüs ersetzt. Abbrechen führt weder den
Restore noch einen Session-Wechsel aus. Bestätigen ruft weiterhin dieselben
Controller-Callbacks auf; die atomare Staging-/Restore-Reihenfolge bleibt
unverändert. Save-Format, Slot, Domainservices und Laufzeit-Speichergrenzen
werden nicht verändert. Die Position und Bedienbarkeit der Auftragsoberfläche
werden unabhängig von der Persistenz überarbeitet.

### Wrackansprüche und wiederholte Bergung (PR nach #323)

Die vorhandenen 14 Career-Sektionen bleiben unverändert. Innerhalb der
Sektion `claims` wird optional der versionierte Datensatz `wreckClaims`
gespeichert. Er enthält Spieler- und NPC-Ansprüche mit Eigentümer und Ablauf,
sowie stabile Seeds, verbliebene Ressourcen, Scanstände und geborgene
Komponenten von Wrackfeldern. Ältere Saves ohne diesen Datensatz werden als
leeres Wrackregister eingelesen. Restore validiert die Registrierungen und
den Feldzustand vor dem atomaren Sitzungswechsel. Das System vergibt beim
Laden keine neuen Ansprüche oder Gebühren.

### Sternkarten-Eventfilter (UI-only, PR #325)

Die Kategorien Notsignal, Bergung und das Kampagnenjournal werden ausschließlich
in der Sternkartenoberfläche ein- oder ausgeblendet. Die Schiffsklasse bestimmt
lediglich die anfängliche Vorauswahl. Individuell gewählte Filter und Sortierung
werden als lokale UI-Präferenzen gespeichert und sind **kein Teil des Career-Snapshots**.
Die eigentlichen Ereignisse, Aufträge, Positionen, Weltzustände, NPCs und
Career-Restore-Abläufe bleiben unverändert. Ein nicht sichtbarer Listeneintrag
wird nicht aus der Simulation oder dem gespeicherten Spielstand entfernt.

### Eventliste: falsche Notsignale (UI-Korrektur)

Die Korrektur unterscheidet reine `missions: true`-Aktivitätsmetadaten einer Welt von tatsächlich vorhandenen Notfall- und Bergungsereignissen. Die Ereignisliste zeigt nur reale Wrack- und Notfallkontakte. Sie verändert weder den gespeicherten Weltzustand noch Event-Spawns, den Ankunftstrigger, Career-Slots oder den Restore-Ablauf. Vorhandene Spielstände bleiben unverändert lesbar.

Wenn ein wirkliches dynamisches Sektorsignal während des Anflugs abläuft oder durch NPCs erledigt wird, meldet die Ankunft nun ausdrücklich den erloschenen Kontakt. Diese Meldung ändert keine gespeicherten Event-IDs oder Statuswerte.

### Erweiterte Sternkarten-Ereignisfilter (UI-only)

Die Sternkarte liest bereits existierende, unveränderte Laufzeitzustände aus
Handelslagen, Konzessionsregistern, Patrouillenmandaten und Korsarenblockaden.
Ein Ereignisbericht startet keine zusätzliche Simulation und erstellt keinen
neuen Auftrag. Die Checkboxen, Sortierung und schiffsabhängigen Präferenzen
werden pro Schiffsklasse in der lokalen Browser-Speicherung gehalten, nicht
im Career-Snapshot. Ein erneutes Öffnen, ein Tick-Refresh oder ein Laden der
Webseite verändert die Auswahl nicht, soweit lokaler Speicher verfügbar ist.
Daher bleiben die 14 Career-Sektionen, Schema, Restore und NPC-Zustände
unverändert.

### Karten-Performance ohne Simulationsänderung (17. November 2026)

Die Sternkarte begrenzt aufwendige Markt- und Weltereignisberichte auf eine
Präsentationsfrequenz. Die Aktualisierungsraten der Canvas-Modelle für
Sternkarte, lokales Mining, Bergung und Kampf sind von den Simulationstakten
getrennt. Die Berechnung von Treibstoff-Zwischenstopps verwendet einen nur für
die einzelne Anfrage gültigen Teilstreckencache; eine laufende Reise startet
keine erneute Treibstoffprognose. Weder der persistierte Career-Snapshot noch
die Reiserouten, Ressourcen, NPC-Takte oder Kampfdaten werden in ihrem Schema
geändert. Auftragsbedienung bleibt auf Sternenkarte und Hafen begrenzt.

### Treibstoff-Routenoptimierung (17. November 2026, PR #329)

Vor der aufwendigen Berechnung einer möglichen Tankstopp-Teilstrecke prüft
`planFuelRoute` die minimale Luftlinienentfernung zwischen den tatsächlichen
An- und Abflugpositionen. Ist bereits dieser optimistische Treibstoffbedarf
nicht verfügbar, wird die Teilstrecke übersprungen. Die endgültige Planung
verwendet weiterhin die bisherigen Gefahrzonenrouten und Sicherheitsreserven.
Die Optimierung verändert weder das Career-Snapshot-Schema noch gespeicherte
Navigation, Treibstoffmengen, Reisefortschritt oder Restore-Semantik.

### Opt-in Browser-Performance-Diagnose (17. November 2026)

Mit `?perf=1` an der Spiel-URL werden ausschließlich im Arbeitsspeicher der
Browser-Sitzung Messwerte für Kartenrendering, Navigation, Treibstoffplanung,
Bergung und Kampf gesammelt. Das Diagnoseobjekt
`window.sojournPerf.report()` liefert aggregierte Dauerwerte, `.print()`
zeigt sie als Tabelle in der Browser-Konsole und `.reset()` setzt sie zurück.
Eine Long-Task-Beobachtung wird nur in unterstützten Browsern aktiviert.
Ohne URL-Parameter ist die Instrumentierung deaktiviert. Es werden keine
Messungen übertragen oder im Career-Spielstand gespeichert. Save/Load-Schema,
Simulationsfrequenzen und Gameplay bleiben unverändert.

### NPC-Neuplanung zu temporären Bergungszielen (17. November 2026)

Die NPC-Routen-Neuplanung prüft jetzt, ob das Reiseziel als regulärer
`WorldLocation` existiert. Temporäre Bergungs- oder Notsignal-IDs besitzen
zwar eigene Koordinaten, gehören aber nicht zu `world.locations` und dürfen
nicht an die Weltort-basierte Routenberechnung übergeben werden. In diesem Fall
bleibt die bereits begonnene NPC-Reise unverändert; eine Ausnahme während des
Simulations-Ticks wird vermieden. Save/Load-Format, NPC-Reisecheckpoint,
Treibstoffverbrauch und reguläre Piraten-Ausweichrouten bleiben unverändert.

### Career-Browser-Neustarttest (17. November 2026)

Ein separater Chromium-Test `scripts/browser-career-restart.cjs` prüft jetzt den
benutzerseitigen Weg über Charaktereditor, Spielstart, Systemmenü und den
bestehenden lokalen Career-Slot: im ruhenden Orbit speichern, das Dokument
vollständig neu laden, im Hauptmenü „Karriere fortsetzen“ wählen und die
neu gebildete Session erneut sichern. Version und alle 14 Pflichtsektionen,
Kapitän/Schiffsname, Wallet und Cargo, Schiffe, Rechtsakten, Ansprüche sowie
stabile NPC-Identitäten werden verglichen. Ein absichtlich beschädigter
localStorage-Eintrag muss beide Ladeaktionen im Hauptmenü deaktivieren.
Der Browser-Workflow `.github/workflows/career-browser-restart.yml` führt den
Test mit echtem Chromium bei relevanten Änderungen und manuell aus; bei
Fehlern wird ein Screenshot als CI-Artefakt angeboten.

Dieser Browser-Smoke ersetzt keine mehrtägige interaktive Spielsession und
prüft nicht automatisch sämtliche Einzelaktionen vor/nach jedem rechtlichen
Zustandsübergang. Mehrere Slots sowie Datei-Import/Export bleiben außerhalb
dieser Änderung. Das Save-Schema und der atomare Restore werden nicht geändert.

### NPC-Schmuggelzeitgeber im Career-Save (17. November 2026)

Die Zoll-/Schmuggelüberwachung verwendet nun optionale Zustandsfelder direkt
an den bestehenden Sektor-NPCs für die noch laufende Patrouillenprüfung, die
letzte tatsächlich erreichte Hafenposition und die verbleibende
Zoll-Abklingzeit. Da der Career-Save die autoritativen NPCs bereits gemeinsam
mit ihrem Inventar und Routenstatus speichert, werden diese Zeitgeber beim
Neustart nicht mehr zurückgesetzt. Beim Erzeugen des wiederhergestellten
Schmuggeldienstes wird außerdem der gespeicherte Wirtschaftstag als
Startwert verwendet, damit ein Laden nicht die bereits erfolgte tägliche
Verdachtsreduktion wiederholt. Ein Save ohne diese optionalen Felder bleibt
weiterhin lesbar. Die neuen Werte werden beim Stage auf Gültigkeit geprüft;
das bestehende versionierte 14-Sektionen-Schema bleibt unverändert.

### Laufende NPC-Bergung zu temporären Ereignis-IDs (17. November 2026)

Ein Browser-Neustarttest hat einen bestehenden Save-Abbruch während laufender
NPC-Bergung sichtbar gemacht. Ein Bergungsschiff kann zu einer temporären
`salvage-special-<Tag>-<ID>`- oder `salvage-distress-<Tag>-<ID>`-Position
reisen, die nicht in der regulären Weltort-Liste liegt. Die Career-NPC-Prüfung
lässt diese Kennung nun ausschließlich für den Bergungs-NPC mit übereinstimmender
`salvageEventId` zu; sie bleibt bei fremden/unverbundenen IDs strikt. Dies
gilt auch für die kurze Ankunftsphase am Ereignisort. Vorhandene atomare
Career-Sektionen, Treibstoffstände und geplante Routen werden nicht verändert.

### Initiale Sicherheitsdrohnen und Save-Validierung (17. November 2026)

Bei einem echten Chromium-Lauf ohne optionalen Medienbestand schlug das Speichern durch einen bereits vorhandenen Zustandsfehler fehl: Ein neu erzeugter Konzessions-Sicherheitsdrohnen-NPC erbte mit der kopierten Patrouillenvorlage deren Reise-, Kampf- und Orbitdaten. Die eigentliche lokale Drohne hat jedoch einen anderen Einsatzort, wodurch der NPC-Checkpoint die Aktivität zu Recht ablehnte. `registerSecurityDroneCombatants` entfernt nun diese geerbten temporären Bewegungszustände vor dem Einfügen der lokalen Drohne; die reguläre Validierung bleibt aktiv. Ein Regressionstest deckt den Fall ab, und der Browser-Neustarttest gibt bei einem Speicherfehler den sichtbaren Fehlertext aus.

Die aus der Patrouillenvorlage erzeugte lokale Konzessionsdrohne wird außerdem bei Fahndungs-Dispatches ausdrücklich ausgeschlossen: Für Meldungen dürfen nur echte Sektorpatrouillen zu anderen Orten fliegen, während die Drohne ihrem Feld zugeordnet bleibt. Der bestehende Offscreen-Rechtsintegrations-Test überprüft diese Trennung.

### Test-Schiffwechsler mit Mk-II-Ausstattung (18. November 2026)

Der ausdrücklich als Entwickler-Testfunktion gekennzeichnete Schiffwechsler
bestückt das ausgewählte Modell mit kompatiblen Mk-II-Komponenten, einer
Mk-III-Railgun am Bug und einem bedarfsgerechten Generator. Die Berechnung
hat keinen eigenen Laufzeitstatus: Die eingebauten Komponenten werden im
vorhandenen autoritativen `ShipLoadoutService` gespeichert. Dieser ist bereits
Teil der Career-Schiffssektion. Es entstehen weder neue Save-Felder noch
Versionsänderungen oder zusätzliche Belohnungen; reguläre Karriere- und
NPC-Startausrüstung bleiben unberührt. Der Mehrschiff-Regressionstest prüft
Hardpoint-Kompatibilität und ausreichende Energieversorgung.

### Wiederherstellung generierter Schiffssprites (18. November 2026)

Die 28 ursprünglich für Sojourn erstellten PNG-Sprites werden unverändert
als statische Medien unter ihren bisherigen Dateipfaden wieder bereitgestellt.
Es gibt keine Änderungen an der Schiffsauswahl, an Laufzeit- oder
Persistenzzuständen, Komponenten, Hardpoints, Datenmodellen oder
Career-Save-Schema. Der bestehende Fallback für fehlende Sprites bleibt erhalten.

### Developer-Testauswahl mit Hülle und Schild Mk III (18. November 2026)

Die ausschließlich im Entwickler-Schiffwechsler verwendete Komponentenbestückung
rüstet nun Hülle und Schild auf Mk III statt Mk II auf. Weitere Systeme bleiben
bei Mk II, der Bug erhält weiterhin die Mk-III-Railgun und der Generator
bleibt Mk III beziehungsweise ausreichend leistungsoptimiert. Dies ändert
weder die reguläre Starterausrüstung noch die NPC-Schiffe oder das Save-Schema.
Die bereits persistierte Komponentenbelegung bleibt autoritativ; ein erneuter
Test-Schiffswechsel ist reproduzierbar und wird für alle 28 Schiffe geprüft.

### Reisezielauswahl ohne langes Blockieren bei unmöglichen Tankrouten (18. November 2026)

Der Treibstoff-Routenplaner filtert offensichtlich unmögliche Reisen anhand
notwendiger geometrischer Treibstoff-/Geld-Untergrenzen sowie einer optimistischen
Tankstellen-Erreichbarkeitsprüfung, bevor er Gefahrzonenrouten berechnet.
Die verbleibende Suche priorisiert mittels zulässiger Luftlinienheuristik
(A*) erfolgversprechende Zwischenstopps. Kosten, tatsächliche Flugrouten,
Treibstoffverbrauch, Tarif und gespeicherte Navigationszustände bleiben
unverändert; die Filter dürfen eine tatsächlich erreichbare Reise nicht
ablehnen. Regressionstests prüfen insbesondere die Nichtausführung der
teuren Routenberechnung bei leeren Tanks.

### Sternkarten-Routenplanung und NPC-Bedrohungsaktualisierung (18. November 2026)

Die Gefahrzonenroutenplanung verwendet nun eine zulässige A*-Luftlinien-Untergrenze
und einen bereits gültigen Direktkurs als Kostengrenze. Kandidaten, die die
beste Route nicht mehr verbessern können, werden nicht mehr teuer auf
Gefahrenzonen abgetastet. Die Pfadkostenfunktion und die Tankstopp- und
Gefahrenregeln bleiben unverändert. Die Sternkarten-Treibstoffvorschau darf
bei ausschließlich beweglichen Bedrohungskontakten für maximal vier Sekunden
wiederverwendet werden. Beim tatsächlichen Flugstart wird eine neue Planung
mit dem aktuellen Bedrohungsstand erzwungen; Schiffswechsel, Tankstand,
Credits, Routenprofil oder Zielwechsel bleiben sofort cache-invalidierend.
Diese Maßnahmen ändern weder persistierte Routen noch das Savegame-Schema.

### Gefahrennebel-Atlas und Sternkarten-Diagnose (18. November 2026)

Die erste Sternkartenzeichnung darf beim Erzeugen des Gefahrennebel-Atlas
Pixel außerhalb der konservativen organischen Einflussgrenzen auslassen.
Dort ist der Farbwert mathematisch null: Die Berechnung der Wellendistortion,
Gefahrengradienten und Farbgewichte entfällt, während bestehende Nebelformen,
Farben und weiche Übergänge unverändert bleiben. Der Atlas und seine
Lebensdauer bleiben wie bisher gecacht. Opt-in-Messungen mit `?perf=1`
erfassen zusätzlich die Dauer der Abschnitte Hintergrund, Gefahrennebel,
Ortsymbole und NPC-Schiffe. Es entstehen keine Laufzeit-/Save-Felder,
keine Persistenzänderungen und keine Änderungen der Spielsimulation.

### Performance-Messung lokaler Karten und Gefahrennebel-Regionen (18. November 2026)

Beim Aufbau des bisherigen Gefahrennebel-Atlas werden nur die Regionen
auf organische Farbstärke geprüft, deren konservative unverworfene
Einflussgrenzen den Pixel tatsächlich enthalten. Das Raster und die
exakten Farbsamples bleiben unverändert; der vorhandene Objektpuffer wird
wiederverwendet, um unnötige Allokationen je Pixel zu vermeiden.
Die opt-in-Performance-Messung gliedert lokale Karten in Hintergrund,
Asteroiden-Hintergrundebene, echte Asteroiden, NPC-Schiffe und Spielerschiff.
Dies ändert weder die Regeln für Gefahrzonen noch die Simulation oder das
Persistenzformat.

### Gemeinsame Mining- und Bergungskarten für PvP (18. November 2026)

Die fünf bestehenden Duell-Kartenauswahlen nutzen denselben autoritativen
Mining- beziehungsweise Bergungsfeld-Generator wie die Kampagne. Nur die
optionalen Dichteparameter steuern die Anzahl generierter Objekte; für alle
regulären Karriereaufrufe bleibt das Standardverhalten exakt erhalten.
Eine gemeinsame Kampfarenen-Transformation übernimmt Position, Rotation,
Größe, Kollisionsradius, ID, Bewegungszustand und bei Wracks die 3D-Variante.
Die PvP-Auswahl verteilt oder skaliert nach dem Generieren keinerlei Objekte;
stattdessen werden sichere Startpositionen in der generierten Umgebung gesucht.
Auch Bergungskämpfe der Kampagne verwenden diesen Adapter für das tatsächlich
sichtbare Feld. Kampfphysik, Waffen und das bestehende taktische Kampf-HUD
bleiben dieselben. Spielstände und Persistenz-Schema ändern sich nicht.

### Eingebettete Mining-/Bergungskämpfe: Welt-Tick (PR #353)

**Keine Speicherformatänderung:** Die existierenden 14 Career-Sektionen,
Checkpoint-Versionen und Feld-IDs bleiben unverändert. Während des lokalen
1vs1 synchronisieren die Mining- und Bergungskarten die vom Kampfsystem
berechneten Positionen und Geschwindigkeiten ihrer physischen Objekte in die
bereits vorhandenen lokalen Feldzustände. Nicht am Duell beteiligte NPCs
laufen weiter; die beiden Duellschiffe werden dabei von der normalen
NPC-Bewegung ausgenommen. Kampfschaden, RNG und Duellzustand bleiben
weiterhin unter der bisherigen Combat-Autorität. Ein zusätzlicher
persistenter Koordinator oder ein neues Save-Feld wird nicht eingeführt.

**Restore-Risiko und Abnahme:** Die bereits bestehenden Feld-/NPC-Checkpoints
müssen die fortgeschriebenen Positionen und verbliebenen Wrackteile erfassen;
die bisherige Speicherung von aktiven Kämpfen und das Rückkehr-Synchronisieren
bleiben unverändert. Speicherung während einer aktiven lokalen Operation
bleibt entsprechend den vorhandenen Save-Gates gesperrt. Tests müssen
insbesondere zerstörte Feldobjekte, Duell-Rückkehrpositionen und eine erneute
Aufnahme der gewöhnlichen NPC-Arbeit nach Kampfende abdecken.

### Lokaler Pirat bleibt während eines Duells sichtbar (PR nach #353)

**Keine Speicheränderung:** Die lokale Piratenliste behält den aktiven
Duellgegner während des strategischen combatMovement-Zustands bei.
Die bisherige Kampf- und Rückkehrposition wird weiterhin mit den bestehenden
Checkpoint-Feldern erfasst; inaktive Kampfschiffe werden wie zuvor aus dem
Feld entfernt. Es gibt kein neues Save-Feld und keine neue Autorität.
Ein Regressionstest prüft die Sichtbarkeit und verhindert doppelte Bewegung.

### Kampfabschluss und lokale Gefechtsanzeigen (2026-11-18)

**Keine neuen Save-Felder:** Die Anzeige des Kampfergebnisses pausiert die laufende
Kampagnensimulation, bis der Spieler bestätigt. Eine kurze Begegnungssperre
nach dem Ergebnis verhindert unmittelbar neue Überfälle. Beide Flags sind
flüchtiger UI-/Sitzungszustand; abgeschlossene Gefechte bleiben wie bisher
über die bestehenden Schiffs- und NPC-Zustände gespeichert. Beim Laden werden
diese transienten Flags neu initialisiert. Die lokale Mining-/Bergungskarte
zeigt beim Gefecht dieselben Schild-, Hüllen-, Subsystem- und Waffenwerte
wie die eigenständige Raumkampfoberfläche. Keine Änderung am Save-Schema,
der 1vs1-Trefferberechnung, den Waffen oder der Arena-Persistenz.

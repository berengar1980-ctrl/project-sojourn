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

### Lokale Piratenkontakte bei Hintergrundgefechten (2026-11-18)

**Keine Änderung des Save-Schemas:** Ein im Asteroidenfeld vorhandener Pirat
bleibt bei NPC-gegen-NPC-Kämpfen und während seiner Erholungsphase als
lokales Schiff erhalten. Der bisherige version-1-Checkpoint kann die
bestehende Schiffsposition auch im strategischen Kampfzustand sichern.
Ein separates Rückkehr-Spawn an der Kartenkante entfällt für diese Fälle.
Die lokale NPC-Verwaltung verändert während eines fremdverwalteten Kampfs
nicht die Kampfposition. Piraten werden im lokalen Renderer als KORSAR
markiert. Kein Eingriff in die 1vs1-Physik oder den Save-Vertrag.

### Korsaren-Navigation und Kampfanzeige (2026-11-18)

**Save-Schema unverändert:** Lokale Korsaren behalten ihre Positionen und
Kampfzustände im bestehenden Checkpoint. Der neue flankierende Wegpunkt ist
bewusst nur flüchtiger Flugzustand: Er wird nach dem Laden aus den vorhandenen
Asteroiden und dem aktiven Ziel neu berechnet. Dadurch bleiben alte Spielstände
kompatibel. Die Kampagnenkarten zeichnen Strategie-/Manövertext und Burst-
Schubleiste mit denselben Funktionen wie der eigenständige PvP-/Duellmodus.
Die Kampfschaden- und Schildsimulation erhält keine separaten Implementierungen.

### Gemeinsame Duell-Effekte in den lokalen Karten (2026-11-18)

**Kein neues Save-Feld:** Eigenständiges Duell, Mining- und Bergungsduell
verwenden weiterhin denselben strategischen Kampfzustand. Der Renderer in
den lokalen Karten liest für RCS, Antrieb und Burst-Schub unmittelbar die
vorhandenen transienten Combat-Snapshot-Felder. Die Kampfstrahlen benutzen
den beim Abschuss gespeicherten Ursprung und die gleichen Effektdauern und
Waffenfamilien-Renderer wie das eigenständige Duell. Ein Miner im aktiven
Kampf zeichnet keinen zuvor laufenden Abbaulaser weiter. Außerhalb von
Kämpfen bleiben Bergbau-Laser und Traktoroperationen unverändert.

### PvP-Kartengröße und gemeinsame Kampfszene (2026-11-18)

**Kein neues Save-Feld oder Versionswechsel:** Neue PvP-, Mining- und
Bergungsfelder verwenden den zentralen PvP-Weltmaßstab 4200 × 2600.
Die Feldbreite und -höhe bereits gespeicherter lokaler Welten sind weiterhin
Teil ihrer existierenden Checkpoints und werden beim Laden nicht stillschweigend
überschrieben oder umskaliert. Solche älteren Felder können deshalb ihre
bisherigen Maße 4400 × 2570 behalten, bis eine neue Feldinstanz erzeugt wird.

Bei aktiven 1vs1-Kämpfen verwenden beide Karriere-Lokalansichten nun denselben
`FleetNativeCombatRenderer` wie der eigenständige PvP-Modus, mit demselben
Combat-Snapshot und ohne zusätzliche Nicht-Kampf-NPC-Zeichenebenen. Außerhalb
des Duells bleiben Mining-/Bergungsoperationen, NPC-Simulation und die
bestehende Karriere-Persistenz unverändert. Eine PvP-kompatible Kamera
projiziert die normalen lokalen Operationsebenen; weder Kamera-Pan noch
Zoom werden in einem neuen Save-Feld gespeichert.

### Lokale NPC-/Drohnenrouten und PvP-Hindernisdeckung (2026-11-18)

**Kein neues Save-Feld:** Lokale Miner, Bergungsschiffe und Sicherheitsdrohnen
benutzen für Hindernisumfahrung eine gemeinsame, flüchtige Wegpunktlogik.
Gewählte Umwege werden in einer WeakMap an das jeweilige aktive Schiffsobjekt
gebunden und nach einem Laden aus der aktuellen Position, Zielposition und
den vorhandenen Feldhindernissen erneut berechnet. Die Checkpoint-Strukturen
für NPCs und Drohnen bleiben unverändert. Die neue Piratengrafikauswahl
verwendet weiterhin die drei bestehenden Klassen-IDs und deren Datenfelder.
Kampfstrahlen bleiben unter der bisherigen zentralen PvP-Kampfautorität.

### NPC-Miner bei wiederholten Kämpfen (2026-11-18)

**Keine neue Save-Version und keine neuen Felder.** Minerschiffe werden während
eines NPC-Gefechts und der anschließenden Erholungsphase nicht mehr aus der
persistierten lokalen Feldliste entfernt. Die vorhandene Instanz bleibt erhalten;
Arbeit und Arbeitsstrahlen sind bis zur Freigabe pausiert. Kampfteilnehmer werden
unverändert vom PvP-Kampfkern bewegt und beim Ende in die lokale Pose
zurückgeführt. Zusätzliche zivile Schiffe werden während des Kampfs nur als
Darstellungsebene über dem nativen PvP-Renderer gezeigt, ohne eine eigene
Simulation zu starten. Alte Minerschiff-Checkpoints bleiben weiterhin lesbar.

### Gemeinsame NPC-Arbeit, Duellpositionen und Kollisionen (2026-11-19)

Keine neue Save-Version. NPC-gegen-NPC-Kämpfe melden die Positionen ihrer
Kampfteilnehmer während des Gefechts an das vorhandene lokale Feld. Der
Kampfkern bleibt die einzige Bewegungsautorität; die lokalen Schiffsobjekte
werden anhand seiner Snapshots aktualisiert. Dritte Schiffe werden dem aktiven
PvP-Kampfkern lediglich als **flüchtige** physische Kontakte übergeben, ohne
zusätzliche Combatants oder neue Checkpoint-Felder. Die bestehenden Schiff-IDs,
Economy- und NPC-Mining-Zustände bleiben unverändert. Visuelle Erzbrocken der
NPC-Miner sind ausschließlich Darstellung und verändern keine wirtschaftlichen
Abbau- oder Cargo-Werte.

### Lokale Korsaren-A*-Routen und echte NPC-Erzaufnahme (2026-11-19)

Die vorhandenen Version-1-Spielstände bleiben lesbar. Die aktiven A*-Wegpunkte
der Korsaren werden in einem optionalen `routeState` am Piratenschiff
checkpointiert; ältere Spielstände ohne diesen Eintrag berechnen den Weg neu.
Eine Erzaufnahme-Anzeige existiert nur nach **tatsächlich akzeptiertem**
NPC-Abbau: `oreCollection` enthält Ressource und Restlaufzeit. Auch dieses
Feld ist optional und rückwärtskompatibel. Es gibt keine künstlichen vier
Traktorzielobjekte mehr. Laufende NPC-gegen-NPC-Gefechte sind schon zuvor im
strategischen Kampfzustand vorhanden; ihre Snapshot-FX sind abgeleitete
Darstellung und erzeugen keine weitere Welt-/Kampfautorität.

### FleetCombat-Testlabor und freie PvP-Duelle (19. November 2026)

**Keine Änderung des Save-Schemas:** Im Hauptmenü öffnet die bisherige PvP-Aktion
zwei getrennte Test-Tabs. Der freie 1vs1-Pfad verwendet weiterhin unverändert
`StrategicCombatService`, bestehende Duellarenen, Karten-Seed, Crew- und
Waffenkonfigurationen. Nur die kuratierten Testgefechte samt fest verdrahteten
Preset-Seeds und Analyse-UI entfallen. Die pro Duell zufällige Kartengenerierung
mit Seed bleibt erforderlich und erhalten.

Der neue FleetCombat-Tab erzeugt ausschließlich flüchtige Vorschaukonfigurationen
(zwei Fraktionen, gewählte Schiffszahlen, Karte, zufällige Modelle,
hardpointkompatible Mk-I-Waffen und Mk-I-Minen, Mk-IV-Reaktor). Diese Daten
werden **nicht** in Karriere-Spielständen gespeichert und verändern keine
NPC- oder Spielerzustände. Eine Mehrschiff-Simulation, ihre Checkpoints,
dynamische Gefechtsbeitritte und Zustandsübergänge werden hier ausdrücklich
noch nicht eingeführt; der FleetCombat-Start bleibt deaktiviert. Die
Persistenzentscheidung für den späteren FleetCombat-Service erfolgt
gesondert, bevor dieser mit der Kampagne verbunden wird.

## Sicherheitsdrohne: Kollisions- und Patrouillenrouting (PR #366)

Die bestehende `AsteroidSecurityDrone` verwendet weiterhin den versionierten
`SecurityDroneCheckpoint` (Version 1). Die neuen dynamischen Hindernisse
(Miner, Piraten und Spielerschiff) sind ausschließlich aus den bereits
persistierten Schiffswelten abgeleitet und werden bei jedem Simulationsschritt
neu übergeben. Ihre Kontaktpositionen werden **nicht** im Drohnen-Checkpoint
gespeichert: **keine Speicheränderung**. Der gespeicherte Wegpunkt und die
Routenpunkte bleiben beim Restore erhalten; bei neuen Hindernissen wird eine
blockierte Teilroute neu geplant. Die physische Bystander-Liste während eines
Kampfs ist ebenfalls ein abgeleiteter Laufzeitzustand, keine neue Autorität.

Der bestehende Checkpoint-Roundtrip wird durch
`tests/operations/asteroid-security-drone.test.cjs` geprüft. Die Bergungs- und
Wrackgebietsdrohne ist in diesem PR noch nicht als eigenständige Autorität
integriert; deren Persistenzvertrag ist vor einer Implementierung separat zu
prüfen.

## Salvage security drone checkpoint (2026-11-19)

The salvage/wreck security patrol now uses the shared `AsteroidSecurityDrone`
route authority with stable, deterministic patrol markers independent of
lootable wrecks. Its current position, active route, next waypoint and
operational state are persisted inside the existing version-1
`WreckClaimRegistry.fields[].drone` optional field. The value is verified by
`stageSecurityDroneCheckpoint` during Career restore; earlier saved fields
without a drone remain loadable. Local ship positions and moving wreck
obstacles are derived anew from their existing field authorities and are
not duplicated into this checkpoint. The scene writes the drone checkpoint
when unmounted; career saving only occurs in port or orbital mode, after
that unmount. The regression test covers navigation and a detached
registry roundtrip.

### Sicherheitsdrohnen-Sprite und Rotation (PR #367)

Das neue transparente Drohnenbild liegt unter `public/drones/` und ersetzt
nur die frühere geometrische Zeichenroutine. Die selbstständige Rotation
(360° je drei Sekunden) wird aus der bereits vorhandenen Szenenzeit
berechnet und erzeugt keine neue autoritative Zustandsvariable. Auch die
Darstellungsgröße von 26 Bildschirmpixeln ist rein visuell: **keine
Speicheränderung**. Position, Patrouillenroute und Konzessionszustand nutzen
unverändert die bestehenden Drohnen-/Wrack-Checkpoints.

## Drohnen-Weltzustand und Hintergrundbetrieb (2026-11-19)

Besuchte Bergungs-/Wrackkarten verwenden jetzt eine gemeinsame Drohneninstanz
für geladene Szenen und den Kampagnen-Hintergrundtick. Außerhalb der Karte
wird deren Wegpunktzustand mit begrenzten Schritten weiterbewegt und über
`WreckClaimRegistry.rememberDrone` im bestehenden optionalen Checkpoint
`fields[].drone` gespeichert. Bereits vorhandene Spielstände ohne diese
Daten werden weiterhin geladen. Nur zuvor besuchte dauerhafte Wrackfelder
werden beim Wiederherstellen wieder für Hintergrundpatrouillen geladen;
kurzlebige Ereigniswracks bleiben von der Ereignisverwaltung abhängig.

Die Routenberechnung nutzt für Drohnen eine begrenzte Sichtbarkeitsgraph-Suche
anstelle der großflächigen fünffachen A*-Rasterabfrage. Ein erfolgloser
Anflugversuch wird vorübergehend zurückgestellt; dieser rein transiente
Retry-Timer wird nicht gespeichert. Das Checkpointformat bleibt Version 1.

Rechtliche Meldungen bei erkannten Versuchen unbefugter Bergung gehen über
`SectorLegalRegistry.reportOffense` und deren vorhandene Idempotenzkennung.
Die normale Sperre fremder Wrackansprüche bleibt bestehen. Piratenduelle
benutzen die bestehende strategische Kampfsimulation.

## Sicherheitsdrohne: Kampfpose und Darstellung (2026-11-19)

In aktiven PvP-/NPC-Kämpfen ist die Position aus dem autoritativen
`StrategicCombatSnapshot` maßgeblich. Der lokale Drohnenzustand übernimmt
Position und Ausrichtung dieses Kampfteilnehmers, statt die Patrouillenroute
parallel zu simulieren. Das Checkpointformat der Sicherheitsdrohne bleibt
Version 1. Die zoomabhängige Darstellung des GC-87-R8-Sprites, dessen
Dauerrotation und die Unterdrückung doppelter Kampf-Overlays sind rein visuell
und benötigen keine zusätzlichen Spielstanddaten.

## Sicherheitsdrohne: Mk-III-Ausrüstung und Trümmerkontakt (2026-11-19)

Sicherheitsdrohnen übernehmen beim Start neuer Karrieren und beim Laden
bestehender Karrieren ein kompatibles Mk-III-Waffen-Loadout (alle aktiven
Hardpoints) sowie Hülle Mk III und Schild Mk III. Bei der Migration
bestehender NPC-Zustände bleibt das bisherige Verhältnis von Hüllen-HP
zu maximalen HP erhalten; der Schiffszustand verwendet weiterhin die
bestehende Sektoren-NPC-Persistenz. Die Aktualisierung ändert kein
Checkpointformat.

Kleine, nicht routenblockierende Trümmer lösen nun echte lokale
Kollisionskontakte aus und erhalten eine kurzzeitige Abstoßgeschwindigkeit.
Die sichtbare Schildkontakt-Animation (`shieldContactSeconds`) wird nur
zur Laufzeit berechnet und nicht gespeichert. Die Drohnenrotation dauert
acht Sekunden und ist ebenfalls rein visuell. Die Hintergrundkampf-
Trefferhistorie ist ein temporärer Renderer-Cache, kein Spielstandzustand.

## Security drone visual timing and combat effect cleanup (2026-11-19)

The security drone now renders at 18 screen pixels at normal zoom, retaining
camera-relative scaling; its rotation period is 16 seconds. Shield-hit arcs
are generated solely from the current authoritative strategic-combat
`shieldImpacts` entries and naturally expire at the combat effect lifetime.
No extra visual or checkpoint state is persisted. Finished NPC/player duels
no longer paint frozen beam/projectile/tractor-tether snapshots, since their
simulation clock stops at the winner transition. The existing career
checkpoint format and movement/weapon authorities are unchanged.

## Mining impacts and visual destruction effects (PR #372)

The mining beam contact inset, camera-scaled sparks and transparent dust are
render-only adjustments. The existing simulation-owned mining target, resource
extraction, laser activation and cargo checkpoint values remain unchanged.

The damage particle timelines and multi-stage ship/drone breakup visuals use
current combat hull integrity, existing combat snapshots, and transient
renderer-local timestamps. They are neither new combat authorities nor saved
entities. No new persistence field, save migration or checkpoint version is
required. These visuals must not change the PvP/career combat rules.

## Kampfwracks und Bergungsfelder (PR #373)

Ein zerstörtes Schiff in einem aktiven Bergungsfeld erzeugt ein neues
`SalvageWreck` mit eigener ID, einer von drei neutralen 3D-Rumpfformen und
verwertbaren Ressourcen. Der Wrackgenerator speichert selbst keinen Zustand,
sondern ergänzt das autoritative `SalvageField.wrecks`-Array. Damit verwenden
Spieler-Bergung, NPC-Bergung und Kollisionen dieselbe Objektinstanz.

**Persistenzgrenze:** Die neuen Kampfwracks überleben die Rückkehr aus dem
eingebetteten Kampf im aktuell laufenden Feld. Ein kompletter Karriere-
Save/Reload oder das Neuerzeugen eines verlassenen Felds ist hiermit
noch nicht garantiert. Für einen vollständigen Restore muss die erzeugte
Wrackliste samt abgebauten Mengen, IDs, Positionen und Varianten in den
Feld-Checkpoint aufgenommen werden. NPC-gegen-NPC-Gefechte und Kämpfe in
Minenfeldern erhalten noch keine entsprechende autoritative Wrackablage.

## Kampfruinen aus Minenfeldern und NPC-Gefechten (PR #374)

Die Career-Feldautorität verwaltet jetzt pro Sektor-Einsatzort dauerhaft
`combatWrecksByLocation`. Auch ein NPC-gegen-NPC-Gefecht im Hintergrund sowie ein
Spielerkampf in einem Minenfeld oder auf der Sternkarte kann ein Wrack hinterlassen.
Die `SalvageWreck`-Objekte werden von der Bergungsszene wiederverwendet und enthalten
stabile Kennungen, 3D-Varianten, Positionen und verbliebene Rohstoffmengen.
Bei Verlassen einer Bergungsszene werden abgebaute oder entfernte Kampfwracks
mit der Feldautorität abgeglichen.

Der optionale Checkpoint-Abschnitt ist rückwärtskompatibel mit älteren Saves.
Beim Laden wird die Wrackliste je Ort vor der Freigabe geprüft und geklont;
invaliden Koordinaten, unbekannten Varianten und übergroßen Listen wird
der Restore verweigert. Bergungsschiffe können ein vorhandenes Wrackfeld
auch an zuvor reinen Bergbaustandorten betreten.

## PvP-Testnavigation und Vollbilddarstellung (PR #375)

Die Modus-Auswahlleiste `1vs1 · PvP / FleetCombat · Test` ist reine
Darstellungslogik des Startmenüs. Beim Beginn eines Duells wird sie
ausgeblendet, nach Rückkehr zur Konfiguration wieder eingeblendet.
Der Zustand ist absichtlich flüchtig und wird weder im Karriere-Checkpoint
noch im Kampfsimulator gespeichert. Die Größenberechnung des
Lobby-Containers berücksichtigt die globale Systemkonsole, ohne
Kampfzustände, persistierte Karrieredaten oder FleetCombat-Konfigurationen
zu verändern.

## Kampfwracks: gemeinsame Bewegung und Auswahl (PR #376)

Die pro Einsatzort gespeicherten Kampfwracks übernehmen nun auch außerhalb
der Bergungsszene dieselbe physikalische Drift und 3D-Drehung wie Wracks in
Bergungsfeldern. Die Feldautorität aktualisiert ihre Positionen und
`rotation3d`-Werte auf dem Karriere-Tick, sodass der Save-Checkpoint
unmittelbar die aktuellen Posen erfasst. Während eines aktiven
Bergungseinsatzes oder eines eingebetteten Kampfes wird der separate Tick
für diesen Ort unterdrückt; die jeweils aktive Szenenphysik bleibt allein
zuständig. Minenfeld-Klickauswahl und deren Anzeigekarte sind rein flüchtiger
UI-Zustand und erweitern die Save-Struktur nicht.

## Physische Piratenkontakte im lokalen Bergbaufeld

Die Schildkontaktauflösung erweitert lediglich den vorhandenen, pro Feld
gespeicherten Live-Zustand der Piratenschiffe und Miner. Nach physischem
Kontakt werden betroffene Piraten-Routen verworfen, damit keine alte
Wegpunktliste die Kollisionskorrektur rückgängig macht; Miner mit Kontakt
planen ebenfalls neu. Die bestehenden Karriere-Checkpoints erfassen Position
und Route bereits. Es gibt weder ein zusätzliches persistentes Feld noch
eine neue Save-Version. Während des laufenden Kampfes bleibt der
Kampfsimulator alleinige Autorität über seine Beteiligten.

## Sicherheitsdrohne: lokale Schildkontakte und Darstellungsgröße

Die physische Schildkontaktprüfung nach dem Patrouillentick verändert
lediglich die bereits gespeicherte Drohnenposition und verwirft bei
Kontakt eine alte Route; dies wird durch den bestehenden
Sicherheitsdrohnen-Checkpoint erfasst. Die optische Größe ist reine
UI-Konfiguration. Keine neue Version oder Felder im Karriere-Save;
die bisherigen Sicherheits- und Kampfzustände bleiben kompatibel.

## Parallele native 1vs1-Duelle im PvP-Test (PR #381)

Der neue Zweifraktions-Test im FleetCombat-Reiter verwendet zwei unveränderte
`StrategicCombatService`-Duelle auf einer einzigen, gemeinsam integrierten
Arena. Die Testkoordinator-Instanz `parallel-native-duels.ts` hält den
flüchtigen Zeitpunkt und die Bystander-/Kollisionssicht, integriert Asteroiden
nur einmal pro Tick und reicht Originalkampf-Snapshots an das separate
FleetCombat-Zuschauerpanel weiter. Dieses benutzt vorhandene Visual-Bausteine,
jedoch nicht den normalen 1vs1-Renderer. Keiner dieser Werte gelangt in den
Karriere-Speicherpfad.

Die Standard-1vs1-Engine behält das bisherige Checkpointformat und den
normalen eigenen Asteroiden-Tick; die neue Option `sharedArenaPhysics` ist
standardmäßig deaktiviert und wird ausschließlich durch den PvP-Koordinator
aktiviert. Keine Änderung am Save-Schema, keine Datenmigration.

Die ursprünglich gesperrte Erweiterung auf 2 gegen 1 wird jetzt zusammen
mit allen Kombinationen von 1 bis 5 Schiffen im PvP-Test angeboten.
Ein gemeinsamer Verteidiger darf unter keinen Umständen zwei
Bewegungs-/Waffen-/Persistenzautoritäten bekommen.

### Variables Testflottenverhältnis (1–5 je Fraktion)

Der PvP-Koordinator erzeugt für jedes Schiff genau einen simulationsführenden
Kampfteilnehmer. Reguläre 1vs1-Paarungen verwenden die unveränderte Duelllogik;
überzählige Angreifer verwenden denselben Planungs-, Bewegungs- und Waffenpfad,
aber referenzieren den echten Verteidiger aus der Paarung. Dessen Zustand
wird nicht unabhängig kopiert oder ein zweites Mal als AI-Schiff getickt.
Der Unterstützer-Tick (`native-duel-support-tick.ts`) ist ausschließlich
flüchtige PvP-Testlogik. Keiner dieser Laufzeitverweise wird gespeichert;
Speicherformat, Wiederherstellung und Karriere-Autorität bleiben unverändert.

### Flottenwracks und gemeinsam benutzter Fluchtpunkt (PvP-Test)

Bei nativen Mehrschiffgefechten gehört der Fluchtpunkt der gemeinsamen Karte,
nicht den einzelnen Duellen. Erfolgreich entkommene Schiffe werden in der
flüchtigen Flottenkoordination als abwesend geführt und nicht mehr gezeichnet
oder als Kollisionshindernisse übergeben. Für zerstörte Schiffe entsteht
genau ein echtes Wrack als driftendes `CombatVisualAsteroid` im gemeinsamen
PvP-Feld. Das native Wrackmodell, Schiffszerfalls-Effekte, Rauch und Feuer
verwenden bestehende Rendering-Bausteine. Die Kampagnenfelder und deren
Wrack-Persistenz werden dadurch nicht verändert; alle neuen Wracks bleiben
auf die nur vorübergehend existierende PvP-Testarena beschränkt.

### Schutz des regulären 1vs1-Modus (PR #381)

Die Dateien `strategic-combat-renderer.ts`,
`strategic-combat-panel.ts`, `combat-damage-visual.ts` und
`combat-wreck-destruction-renderer.ts` entsprechen wieder bytegenau
dem Stand von `main`. Die Mehrschiffansicht verwendet stattdessen
`fleet-native-combat-renderer.ts`, `fleet-native-combat-panel.ts`
und eigene Ergänzungen für sichtbare Wracks und Schadenspartikel.
Die normale 1vs1-UI verwendet weiterhin ausschließlich ihre bisherigen
Dateien. Ein Regressionstest überprüft sowohl die Originaldateien
als auch die getrennte Verdrahtung und den unveränderten Default-Pfad
von `createStrategicCombatService` (ohne Fleet-Parameter).

Der Kampfdienst selbst bietet ausschließlich optionale PvP-Fleet-Parameter
mit unverändertem Standardwert. Normale 1vs1-Duelle integrieren ihre
Asteroiden weiterhin selbst und erzeugen unverändert zwei eigene
Combatant-Instanzen; nur der neue Fleet-Koordinator aktiviert
die gemeinsame Arena-/Zielreferenz-Unterstützung. Das
Karriere-Speicherschema bleibt unverändert.

### Native 1v2-Fortsetzung ohne Doppelautorität

Im flüchtigen FleetCombat-Koordinator können zwei Angreifer dasselbe
live referenzierte Ziel angreifen. Scheidet in einer 1v2-/2v1-Gruppe
der erste Gegner aus, kann der ursprüngliche Dienst ausschließlich im
PvP-Fleet-Modus den überlebenden Original-Combatant gegen den nächsten
noch lebenden Gegner weitersteuern; dieser hat bereits einen eigenen
nativen Dienst und wird nie ein zweites Mal als KI/Antrieb/Cooldown getickt.
Auch Fluchten bleiben nach dem Zielwechsel im temporären Fleet-Zustand
vermerkt. Die reguläre 1vs1-Simulation nutzt den unveränderten Standardpfad,
während der optionale Einseitentick ausschließlich flüchtige Simulation ist.
Es entstehen keine neuen Karriere-Speicherfelder und keine Migration.

### Allgemeine Flottenzielzuweisung (PvP-Test)

Die flüchtige FleetCombat-Koordination verwendet eine stabile
Schiffsinstanz pro Teilnehmer und führt keine zweite Kampf-Engine ein.
Sobald ein Kampf durch Zerstörung oder Flucht endet, wählt das
freigewordene Schiff einen räumlich nahen laufenden Kampf. Ist dort
ein befreundetes Schiff durch einen zusätzlichen Angreifer im Nachteil,
kann dieser zusätzliche Angreifer durch die Umschaltung seiner
vorhandenen einseitigen KI-Zielreferenz abgefangen werden. Paarungen,
die weiterlaufen, behalten ihre ursprüngliche physikalische
und taktische Autorität; fremde Schiffe werden weder geklont noch
doppelt bewegt oder mit doppelten Cooldowns versorgt.

Zerstörte und entflohene Schiffe bleiben in der ursprünglichen
temporären Flottenregistrierung erfasst, auch nach einem Zielwechsel.
Die reguläre 1vs1-UI, Kampagnen-Speicherung und die Karriere-
Checkpoint-Schemata werden dadurch nicht erweitert.

### FleetCombat-Rollenmarkierungen ohne persistente Autorität (PR #382)

Die getrennte PvP-FleetCombat-Ansicht zeigt für jede aktive 1vs1-Paarung
eine gemeinsame Kennung `D1` bis `D5`. Einseitig simulierte zusätzliche
oder nachrückende Schiffe erhalten stattdessen `+1` bis `+5`.
Aus aktuellen Treiber- und Zielreferenzen werden ausschließlich flüchtige
Anzeigeverbindungen abgeleitet; dabei entstehen weder neue Schiffsinstanzen
noch zusätzliche Bewegungsschritte oder KI-Entscheidungen.

Die Zielverbindungen können im FleetCombat-Test ausgeblendet werden,
ohne Simulation oder gespeicherten Zustand zu verändern. Der neue reine
Projektionshelfer `native-fleet-engagements.ts` ist als `derived`
klassifiziert. Die originalen 1vs1-Anzeigen, sämtliche
Karriere-Checkpoint-Schemata und der Wiederherstellungsablauf bleiben
unverändert.

### Nachrücken zum neuen FleetCombat-Hauptduell und Anzeigemenü

Fällt in einem temporären 1vs1 plus Zusatzangreifern der Hauptgegner
durch Zerstörung oder Flucht aus, bevorzugt der verbleibende Pilot einen
bereits gegen ihn kämpfenden Zusatzangreifer. Die Zielreferenz des
Originaldienstes wird auf das bereits existierende Schiff umgelenkt.
Wenn beide unveränderten KI-Eigentümer sich gegenseitig anvisieren,
wird diese Verbindung als neues Hauptduell dargestellt. Die beiden
Kampfservices bleiben ausnahmslos einseitige Treiber – keine Kopien,
kein zusätzlicher Physik-/KI-/Cooldown-Tick.

Das kleine FleetCombat-Anzeigemenü speichert ausschließlich
Browserpräferenzen (Linien, Rollen, Schiffsnamen, Manöver,
Boostanzeige, Duellübersicht, HUD und Meldungen) unter
`sojourn.fleet-combat.display.v1`. Es verändert keine taktischen
Eingaben und kein Karriere-Speicherschema. Das reguläre 1vs1
behält seine unveränderte separate Kampfoberfläche.

### Dynamische FleetCombat-Koordination in PvP und Kampagne (PR #384)

Der gemeinsame Einstieg `dynamic-fleet-combat.ts` verwendet denselben
nativen `StrategicCombatService` für die originale 1vs1-KI und die
einseitig gesteuerten zusätzlichen Teilnehmer. `career-fleet-encounter.ts`
übernimmt im laufenden Kampagnengefecht nahe NPCs (Patrouillen, Piraten,
Sicherheitsdrohnen), sofern der kurzfristige `fleet-conflict-manager.ts`
einen gültigen Feindkontakt meldet. Die Zielzuweisung und das Kampfbild
sind unabhängig davon, ob das Gefecht aus PvP oder der Kampagne stammt.

Der Fleet-Koordinator, seine aktuellen Zielreferenzen, die
Konfliktbeziehungen und beobachteten Angriffe sind **flüchtige**
Encounter-Daten. Die dauerhaften NPC-Rumpfwerte verbleiben im
bestehenden `SectorNpcState`; neue wirtschaftliche oder rechtliche
Besitzdaten werden nicht angelegt.

**Wichtige Einschränkung:** Aktuell serialisiert der vorhandene
Karriere-Kampfcheckpoint ausschließlich das ursprüngliche 1vs1-Duell.
Zusätzlich beigetretene Flottenteilnehmer, ihre Zielverbindungen und
vorübergehenden Feindschaften sind beim Laden eines laufenden
Mehrparteiengefechts **nicht vollständig wiederherstellbar**.
Ein vollständiger atomarer Fleet-Karrierecheckpoint samt Validierung
und Restore-Test ist für Save/Load-Parität weiterhin erforderlich.

### Zeitversetzte FleetCombat-Testkonfiguration (PvP)

Die neue Testlabor-Oberfläche verwaltet temporäre Einsatzgruppen
(Spieler, zivile NPCs, zwei Piratengruppen, Sicherheitsdrohnen) und
deren Einrückzeitpunkt ausschließlich in einer laufenden Testsitzung.
Diese Testlabordaten erzeugen **keine** zusätzlichen Karriere-
Save-Felder, Kontakte, Ausrüstung oder Spielerfraktionsbeziehungen.
Der gemeinsam verwendete `fleet-conflict-manager.ts` bleibt nur
für die Dauer des Testgefechts zuständig; die frühere Einschränkung
für Save/Load laufender Mehrparteiengefechte in der Kampagne gilt weiter.

### FleetCombat: echte GC-87-Drohnen und wiederhergestellte Duellverbindungen (2026-11-22)

Der neue, zustandslose Helfer `security-drone-weapon-loadout.ts` wird vom
bestehenden Kampagnen-Ausrüstungsdienst und vom PvP-FleetCombat-Testlabor
gemeinsam verwendet. Er wählt kompatible **Mk-III-Waffen pro aktivem
Schiffshardpoint**. Die Kampagne behält ihre bisherigen Mk-III-Schild-,
Hüllen- und Reaktor-Upgrades; das Testlabor verwendet dieselben Stufen und
die bestehende GC-87-Grafik über die `security-drone:`-Kennung.

**Persistenzentscheidung:** Die Änderung fügt keine neuen Karriere-Save-Felder,
Besitzer, Fraktionen oder gespeicherten Kampfobjekte hinzu. Bestehende
`SectorNpcState.installedComponents` und `hullHp` bleiben die maßgeblichen
Speicherwerte. Die Anpassung der temporären Duell-Verbindungslinien betrifft
nur den berechneten FleetCombat-Snapshot und wird nicht gespeichert.
Laufende Mehrparteiengefechte bleiben hinsichtlich des zusätzlichen
Fleet-Zustands weiterhin nicht vollständig checkpoint-/restore-fähig.

### Einheitliche native Kampfphysik und NPC-Weltzustand (PR #387)

Die Kampagne besitzt weiterhin die maßgeblichen `SectorNpcState`- und
`combatMovement`-Daten. Der gemeinsame native FleetCombat-Akteur
übernimmt bei Kampfbeginn Position, Flugrichtung und Geschwindigkeit,
wird während des Kampfes nur einmal physisch simuliert und synchronisiert
seine tatsächliche Bewegung auf den bestehenden NPC-Zustand zurück.
Die Umrechnung zwischen strategischen Sektorkoordinaten und lokalen
Kampfkoordinaten bleibt als temporärer Offset beim Encounter, ohne
neues Speicherfeld oder konkurrierende Bewegungsinstanz.

Für das PvP-Testlabor werden temporäre NPC-Profile aus den vorhandenen
`createSectorNpcEconomyStates`-Vorlagen kopiert. Ihre lokalen Miner
verwenden den bestehenden `createNpcLocalMiningService`, die
Sicherheitsdrohnen die vorhandene `AsteroidSecurityDrone`, beide mit
dem gemeinsamen Feld-Routing. Diese Daten werden **nicht** in der
Karriere persistiert und greifen nicht auf deren Wirtschaft zu.

Die bereits dokumentierte Save/Load-Grenze bleibt bestehen:
Zusätzliche Mehrparteien-Flottenakteure, kurzfristige Feindschaften
und ihre Zuordnungen sind noch nicht vollständig durch das
Karriere-Kampfcheckpoint erfasst. Die Änderungen in diesem Branch
beheben **nicht** diese separate Persistenzlücke.

Das Fleet-Labor hält das erzeugte Asteroiden- oder Wrackfeld für die gesamte Sitzung.
Arbeitsdienste buchen Fracht und Abflug über dieselben NPC-Wirtschaftstransaktionen wie
in der Karriere. Feldbestände, Fracht und Kamera des Labors sind sitzungsgebunden.
Die Karriere verwendet weiterhin ihre bestehenden Feld- und Wirtschaftseigentümer.

Scheidet der Spieler aus einem laufenden Mehrparteiengefecht aus, behält die
Kampagne sein letztes Kampfergebnis für Hüllenschaden, Position und Rückkehr.
Das Ergebnis gilt bis zur Auflösung des Gefechts und wird bei einem Zielwechsel
des überlebenden Gegners nicht überschrieben. Dieser Zwischenstand ist nur im
laufenden Gefecht verfügbar.

Patrouillenschiffe und Piraten verwenden im lokalen Feld denselben Verkehrsdienst.
Bestehende Feld-Checkpoints können weiterhin geladen werden. Die Liste der
Verkehrsschiffe kann zusätzlich reguläre Patrouillen enthalten. Die Rolle und
das Piratenabzeichen stammen aus dem zugehörigen Sektor-NPC. Gespeicherte Miner
prüfen ihren Abstand zum aktuellen Asteroiden, bevor Scan oder Abbau weiterlaufen.
Die Testaufstellung verwendet die Kampagnen-Gefechtsverwaltung im isolierten Feld.

Das FleetCombat-Testlabor startet eine isolierte Kampagnensitzung mit vorgegebener
Feldkarte und NPC-Aufstellung. Nur der Zeitplan der Ankünfte und der ausgelöste
Testangriff gehören zur Lobby. Das Testlabor bietet keinen Schreibzugriff auf
den Karriere-Spielstand. Die Kampagnen-Feldverwaltung besitzt auch die lokalen
Posen durchfliegender Frachter und zusätzlicher Begleitdrohnen. Beide werden
wie Patrouillen im bestehenden Verkehrs-Checkpoint erfasst.

Nach einem Feldgefecht behalten überlebende Schiffe im Feld ihre Position und
Geschwindigkeit im vorhandenen Verkehrs-Checkpoint. Sektor-NPCs übernehmen
wieder ihre lokale Tätigkeit. Entkommene Schiffe und kampfunfähige Besatzungen
verwenden die bestehenden Reise- und Bergungsdaten. Der Feld-Seed bestimmt
den Fluchtpunkt. Zeugen und die Liste der während eines laufenden Gefechts
entkommenen Schiffe gehören zur flüchtigen Gefechtssitzung.

Beim Nahscan und Abbau regeln NPC-Miner ihren Abstand zum driftenden Ziel
aus den vorhandenen Feldpositionen. Der Verkehrs-Checkpoint speichert weiterhin
Ziel-ID, Position, Arbeitsphase und Scanfortschritt.

Der Beitritt zu einem laufenden NPC-Gefecht überträgt dessen Laufzeitbesitz an den Spieler. Beteiligte NPCs und ihre Hull-Werte bleiben dieselben Karriereobjekte. Das Speicherformat bleibt unverändert.

### NPC-Feldkollisionen und native Gefechtsdarstellung (PR #390)

Kleine, nicht routenblockierende Trümmer werden von lokalen NPC-Minern
über dieselbe kontaktbasierte Impulsregel wie bei den Sicherheitsdrohnen
beiseitegeschoben. Ihre bereits vorhandenen Positionen und
`physics.velocity` werden weiterhin vom `AsteroidFieldWorld`-Checkpoint
gespeichert; die neuen `field-debris-contact.ts` und `npc-local-mining-contacts.ts` besitzen keinen eigenen
Zustand. Große Asteroiden bleiben solide Routenhindernisse.

Während nativer NPC-Gefechte besitzt ausschließlich der native
Kampfakteur die Bewegung. Die lokalen Miner-Kollisionen lassen diesen
Akteur aus; die Feldansicht kann vorhandene Kampfposen anhand derselben
NPC-ID darstellen, selbst bei einer vorübergehenden Übergabe aus der
Verkehrsliste. Diese Sichtdaten und die optionalen `?perf=1`-Messwerte
werden nicht persistiert. Weder Schema noch Save-Version, NPC-Identität,
Fracht- oder Wirtschaftszustand wurden verändert. Die bekannte
Save/Load-Grenze für zusätzliche Teilnehmer laufender Fleet-Gefechte
besteht weiterhin.

### Wiederherstellung eines Zweikampfs im gemeinsamen Flottenkoordinator

Ein bestehender Karriere-Kampfcheckpoint (Version 1) stellt weiterhin
beide Akteure, Arena, Kampfzustand und Zufallsfolge wieder her. Der
Kampagneneinstieg übernimmt den wiederhergestellten Dienst mitsamt diesem
Zustand als erstes Paar in den Flottenkoordinator. Dieser besitzt fortan
den Asteroidentick und ordnet den Positionsabgleich sowie spätere Beitritte
wie bei einem neu begonnenen Gefecht zu. Der ursprüngliche Auslöser und
zusätzliche Flottenteilnehmer fehlen im bestehenden Checkpoint-Format.
Für alte Speicherstände gilt daher der Spieler als Auslöser für die
Verstärkungslogik. Das Speicherformat bleibt bei Version 1.

### Kontakte im Flottengefecht und Speichersperre

Der Flottenkoordinator führt Rumpfkorrekturen und Greifhakenimpulse
pro Schiffspaar zusammen. Kontaktbuchungen pro Tick und visuelle
Zeitachsen sind flüchtig. Der aktive Spieler kann während eines
Raum- oder Entergefechts keine Karriere speichern oder aus dem
Einstellungsmenü laden. Version 1 und das Einlesen älterer
Spielstände außerhalb eines Gefechts bleiben kompatibel.

### Gemeinsame Körperwelt bei Feldgefechten

Gleichzeitige Begegnungen am selben Ort und mit demselben Feld-Seed
teilen sich die beweglichen Körper. Die Koordination verhindert einen
zweiten Drift-Tick und spiegelt Treffer, Traktorentnahmen und Verkehrsimpulse
zurück ins Feld. Der Koordinator, die Liste entfernter Körper und seine
Tick-Markierung sind flüchtig und bleiben außerhalb des Save-Formats.
Außerhalb von Gefechten gelten die bestehenden Asteroiden- und Wrackdaten.

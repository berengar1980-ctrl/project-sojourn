# Rechtsregister und Fahndung – Issue #300, PR 2

## Fachliche Zustände

Das Register verwaltet Forderungen auf Basis der **unveränderlichen Schiff-ID**, nicht einer Transponderkennung:

1. **clear** – kein offener Betrag; keine Fahndung.
2. **demand** – bestätigter Verstoß, offene Forderung. Ohne Verweigerung oder Notruf besteht **noch kein Haftbefehl**.
3. **wanted** – die Forderung wurde verweigert bzw. per Notruf eskaliert. Nur jetzt führen Rechtsinstanzen Fahndung und Patrouillen zu echten Ortsmeldungen.
4. **custody** – identifiziertes Schiff wurde bei einer Direktorum-Institution in Haft genommen. Haftarbeit reduziert den Betrag über den gemeinsamen Zahlungsledger. Nach vollständiger Begleichung folgt **clear**.

Mehrere Verstöße können zusätzliche Forderungen ergeben. Die _eigene_ Kennung eines konkreten Vorfalls verhindert die doppelte Abrechnung. Zahlung setzt Geld vom Schuldner auf die wirklichen Gläubigerkonten um; Teilzahlungen bleiben korrekt gespeichert. Ein gefälschter Transponder kann die Erkennung erschweren, aber **keine** Forderung, Fahndung oder Haftung löschen.

## Wie die Drohne abrechnet

Das Claim-Register erfasst jedes tatsächlich geförderte, fremde Erzquantum inklusive Ressourcenwert. Nur bei **physischer Sensordetektion** wird der noch nicht abgerechnete Betrag als Vorfall übergeben: **150 % des tatsächlichen Rohstoffwerts**. Eine aktive Laseranzeige ohne tatsächliche Fördermenge erzeugt noch keine Strafe. Neue Förderung nach einer Abrechnung wird nur als _zusätzliches_ Quantum berechnet.

Spieler und NPCs verwenden dieselben Forderungen und dieselbe Abrechnungsfunktion. NPCs zahlen bei ausreichenden Credits und niedriger Aggressivität, ansonsten eskaliert das Ereignis. Der Spieler erhält eine fokussierbare In-Game-Auswahl zwischen Zahlung und Verweigerung; währenddessen pausiert der Spielfortschritt. Der frühere Browser-`confirm`-Dialog entfällt.

## Fahndung und Haft

Patrouillen erhalten nur bei bestätigten Meldungen einen **echten Reiseauftrag**. Sichtungen werden durch tatsächlich beobachtete Ankünfte, Route-Abflüge oder Drohnen-Notrufe ausgelöst. Wiederholte Meldungen vom selben Tag, Ort, Ereignistyp und Ziel werden unterdrückt.

Direktorums-Häfen vollstrecken bestätigte Fahndungen; andere rechtsgebundene Stationen melden Sichtungen, Piratenhäfen sind ausgenommen. Die Erkennung gefälschter Kennungen erfolgt mit eingeschränkten Erfolgschancen bzw. einer Tiefenprüfung. Auch während der zeitbeschleunigten Haft des Spielers werden NPC-Hafttage über denselben Tagestakt verrechnet.

## Grenzen und Folgearbeit

- Die neuen Register unterstützen weiterhin versionierte Snapshots, einschließlich Migration früherer ausstehender Fahndungen. **Vollständiges Career-Save/Load ist PR 3.**
- Der tatsächliche Patrouillen-Gameplay-Test (Abflug, Reise, Abfangen, Kampf) muss vor der abschließenden fachlichen Abnahme zusätzlich manuell kontrolliert werden.
- Ein simultaner Mehrparteien-Kampf ist kein Bestandteil dieses PRs. Drohnen und Patrouillen verwenden die vorhandenen strategischen Kämpfe.
- Verdächtige Kontakte ohne bestätigte Erzförderung erzeugen keine Rechnung; die detaillierte Sensor- und UI-Historie ist noch nicht Teil eines eigenen Ermittlungssystems.

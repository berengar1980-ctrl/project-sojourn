# Kampf-KI: verifizierte Stillstandsdiagnose vom 15.10.2026

## Grundlage

Die Diagnose verwendet die vom Nutzer in Codespaces erzeugte Datei `combat-stagnation-trace.json` (12 Läufe à maximal 90 Sekunden). Der Ausgangscode für die Kampfmechanik wurde auf diesem Branch bislang **nicht** verändert. Die vollständige vorangegangene Summary-Baseline liegt unter `docs/combat-baselines/main-pre-refactor-2026-10-15.json`.

## Befund: neun reguläre Läufe enden in einem Nahkontakt-Deadlock

In allen neun regulären Läufen werden wiederholt Abstände nahe 86–87 Metern erreicht. Dort bleiben die beiden Schiffe sehr langsam, obwohl ihre Antriebssubsysteme intakt sind. Die gewünschte Distanz und der tatsächlich erreichte Abstand widersprechen sich.

| Szenario | Seed | Beginn längerer gemeinsamer Langsamfahrt | Kontaktnahe 1-s-Traces im Diagnosefenster | Strategie A / B |
| --- | --- | --- | --- | --- |
| Front / Breitseite | 100 | 58,40 s | 17/17 | frontal / broadside |
| Front / Breitseite | 101 | 51,92 s | 12/17 | frontal / broadside |
| Front / Breitseite | 102 | 58,40 s | 17/17 | frontal / broadside |
| Schnell / Langsam | 100 | 24,24 s | 13/17 | frontal / broadside |
| Schnell / Langsam | 101 | 20,88 s | 12/17 | frontal / broadside |
| Schnell / Langsam | 102 | 24,24 s | 13/17 | frontal / broadside |
| Front / Front | 100 | 28,24 s | 12/17 | frontal / frontal |
| Front / Front | 101 | 26,72 s | 12/17 | frontal / frontal |
| Front / Front | 102 | 28,24 s | 12/17 | frontal / frontal |

**Interpretation:** Eine contact-nahe Trace-Stichprobe meint einen aufgezeichneten Sekundenpunkt mit Distanz von 85,5 bis 87,1 Metern, nicht einen ausdrücklich protokollierten Aufruf der Kollisionsroutine. Werte stammen aus den 17 einsekündigen Stichproben im jeweiligen Fenster. Sie sind nicht gleichbedeutend mit Gesamtzeit bei physischer Kollision.

### Konkretes Beispiel: Front/Front, Seed 100

- Bei 24 s: 140,86 m Abstand, Geschwindigkeiten 39,0 und 23,8 m/s.
- Bei 27 s: 112,40 m Abstand.
- Ab ungefähr 30 s: 87 m Abstand, beide nur 4,2 m/s.
- Bis mindestens 40 s: Distanz und Positionen bleiben praktisch unverändert.
- Beide Schiffe bleiben in `frontal / reach_range` bei Sollabstand **1054 m** und intaktem Hauptantrieb.

### Konkretes Beispiel: schnell/langsam, Seed 101

- Bei 19 s: 124,3 m Abstand und 57,1 / 25 m/s.
- Ab ungefähr 22 s: ungefähr 87 m und 11 / 4,8 m/s.
- Bis mindestens 32 s: 86–87 m mit häufig unter 15 m/s.
- Zielabstände: **1271 m** beim Frontschiff, **380,8 m** beim Breitseitenschiff.
- Die Schiffe bleiben in `reach_range`.

## Codebasierter Mechanismus

Der reguläre Steuerpfad hat eine nachvollziehbare, fehlsteuernde Rückkopplung:

1. `combat-range-posture.ts::combatRangePosture` will bei zu geringem Abstand zunächst **vom Gegner weg** steuern.
2. `strategic-combat-movement.ts::choosePlanDirection` überschreibt jedoch bei `strategy.focus === 'forward'` die Richtung bedingungslos mit `toward` (selbst wenn `range << desiredRange`). Damit wird bei Frontwaffen die notwendige Distanzvergrößerung aus Schritt 1 aufgehoben.
3. Im selben Modul trennt `resolveCombatantCollision` sich überlappende Schiffszentren unter 86 m und multipliziert dabei **alle vier Geschwindigkeitskomponenten mit 0,6**. Das geschieht erneut, wenn die Schiffe im nächsten Tick wieder ineinanderfahren.
4. `combat-inertial-thrust.ts::applyInertialThrust` versucht weiterhin, den gewünschten Bewegungsvektor zu erreichen; der nächste Kontakt kann diese Arbeit erneut dämpfen.
5. `combat-contact-review.ts::reviewShipContact` stößt bei realem Kontakt nach jeweils mindestens zwei Sekunden erneut eine Strategieprüfung an. Diese erzeugt neue `plan`-/`phase`-Logeinträge, obwohl die Doktrin über lange Strecken gleich bleibt.

**Kausale Einordnung:** Die Trace belegt die stabile 86–87-m-Nahkontaktsituation. Die Codeprüfung belegt den Richtungskonflikt und die wiederholbar mögliche 0,6-Dämpfung. Die Rückkopplung ist damit eine **stark gestützte technische Ursache**. Die tatsächliche Zahl einzelner Kollisionskorrekturen wurde bisher nicht instrumentiert; deswegen nicht behaupten, jede langsame Sekunde enthalte eine Kollision.

Der spezielle Exchange-Pfad (Seed 1001) zeigte in diesen drei Setups **keinen längeren gemeinsamen Stillstand** und keine 86-m-Nahkontaktphase. Er benutzt aber feste Choreografie und ist deshalb **kein** zu übernehmendes Zielsystem.

### Quantitativer Fingerabdruck der Kollisions-Rückkopplung

In Front/Front Seed 100 bleiben beide Geschwindigkeiten nach Annäherung an die Kontaktgrenze über viele Sekunden exakt bei **4,2 m/s**. Mit der vorhandenen Beschleunigung von 35 m/s² und einem festen Zeitschritt von 0,08 s erhält ein Schiff ohne Boost pro Tick bis zu 2,8 m/s Geschwindigkeit. Wird die Geschwindigkeit nach dem Antrieb in jedem Tick mit 0,6 gedämpft, gilt im stationären Fall `v = 0.6 * (v + 2.8)`, also **v = 4,2 m/s**. Das stimmt exakt mit dem gemessenen Plateau überein. Die gleichzeitig stabilen Positionen nahe 87 m passen zur wiederholten Positionskorrektur.

Das ist ein sehr starker kausaler Fingerabdruck für die Kollisionsrückkopplung in diesem konkreten Fall. Für andere Konstellationen mit periodischen Kontakten statt einem Kontakt in jedem Frame sind andere stationäre Geschwindigkeiten möglich; der Test ersetzt daher nicht eine direkte Kollisionsereignis-Zählung.

## Zweiter Befund: viele Plan-Logs bedeuten nicht viele Taktikwechsel

Bei Front/Front, Seed 100, wiederholt die normale KI während des Stillstands etwa alle zwei Sekunden `shield_breaker / frontal / reach_range`. Die Zahl der protokollierten Pläne kann daher nicht als Indikator für echte Manövervielfalt verwendet werden. Ein zukünftiger Test muss zwischen **Neubewertung**, **geänderter Entscheidung** und **erfolgreich beendeter Aktion** unterscheiden.

## Grenzen der bisherigen Messung

- `secondsNear86mContact` verwendete bisher `range <= 87`, wodurch Rundungsfehler exakt bei 87 m die Kontaktzeit deutlich unterschätzen können (beispielsweise Front/Front Seed 100 trotz 12/17 kontaktnahem Stichprobenpunkten im Fenster). Im Trace-Probe sollte eine kleine numerische Toleranz verwendet werden.
- `closePassCandidates` erkennt nur einen besonderen Wechsel der Distanztrends. Bei Exchange Front/Breitseite, Seed 1001, nimmt der Abstand von 161 m bei Sekunde 7 auf 205 m bei Sekunde 8 zu und die radiale Relativbewegung kehrt ihr Vorzeichen um. Die Null im bisherigen Passagenzähler ist damit **kein Beweis**, dass keine Passage stattgefunden hat.
- Alle zwölf 90-s-Läufe enden ohne Sieger. Schüsse und tatsächlicher Schaden sind derzeit nur im Ereignislog sichtbar; daraus folgt keine Aussage zu Waffenbalance oder einer notwendigen Änderung der Schadenswerte.
- Die beiden Seed-Werte 100 und 102 ergeben in vielen Konstellationen identische Summen. Dies belegt eingeschränkte Variation nur für diese Testaufstellung.

## Konsequenzen für die Neuentwicklung

**Nicht** lösen durch künstliche Mindestgeschwindigkeit, überstarken Schub oder willkürliche Ausweichimpulse. Dies würde nur den Effekt kaschieren und bestehende Antriebsmechaniken verändern.

Die neue **einheitliche** Flugentscheidung darf den Sinn der gewählten Kampfabsicht nicht durch eine unabhängige Frontwaffen-, Distanz-, Verfolgungs- oder Deckungsregel ersetzen. Physische Kollisionsimpulse bleiben erlaubt; es muss aber vermieden werden, dass zwei Piloten an einer Kollisionsgrenze dauerhaft gegeneinander schieben.

Als ersten verhaltensändernden Schritt einen einzigen gemeinsamen Bewegungs- und Manöverpfad festlegen und mit Front/Front, Front/Breitseite, Schnell/Langsam sowie Seed 1001 unter identischen Waffen-/Physikparametern nachmessen. Keine Aktion-Reaktion-Skripte, keine erzwungene Manöversequenz und keine Einführung zusätzlicher Schiffsfeatures.

Vor Merge: reproduzierbarer Nachweis, dass die 86-m-Stagnation nicht mehr systematisch auftritt, echte Manöverfortschritte statt bloßer Logeinträge, alle Spezialmechaniken und visuelle Abnahme. `main` nicht ohne Nutzerfreigabe verändern.

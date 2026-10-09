# Project Sojourn – Raumkampf-Feature-Matrix und Konzeptbeschreibung

**Stand:** 10. Oktober 2026  
**Phase:** Gemeinsam besprochene Designrichtung; **keine Implementierungsfreigabe**  
**Geltung:** Sojourn-eigene Ideen, unabhängig von der [Voidbound-Feature-Parity-Matrix](VOIDBOUND_FEATURE_PARITY.md). Die [Ideen-Roadmap](SOJOURN_ROADMAP.md) sammelt darüber hinaus weitere Konzepte.

**Leseregel:** Die Übersicht ist ein Inhaltsverzeichnis. **Die vollständige Spezifikation steht jeweils darunter.** Entscheidungen, Beispiele und ungeklärte Punkte sind ausdrücklich getrennt. Eine dokumentierte Idee ist keine Aussage darüber, dass der Spielcode sie bereits unterstützt.

## Übersicht

| ID | Feature | Kerngedanke | Status |
|---|---|---|---|
| SOJ-COMBAT-001 | Zwei unabhängige Kampf-KIs | Beide Schiffe versuchen, ihre eigene aus Ausrüstung und Situation abgeleitete Taktik durchzusetzen. | Konzept |
| SOJ-COMBAT-002 | Schusswinkel und Waffenmontage | Railgun vorne, starke Hüllenwaffen eher seitlich, schwächere Waffen rundum. | Konzept |
| SOJ-COMBAT-003 | Railgun als taktische Reserve | Hoher Hüllenschaden und lange Reichweite; Schuss gegebenenfalls für eine Flucht des Gegners aufheben. | Konzept |
| SOJ-COMBAT-004 | Breitseiten und Verfolgung | Seitenwaffen erzwingen andere Flugpositionen und kosten beim Verfolgen Zeit. | Konzept |
| SOJ-COMBAT-005 | Crew-Einfluss | Steuermann, Techniker, Waffenoffizier und Kampfstratege prägen konkrete Schiffsleistungen und KI-Entscheidungen. | Konzept |
| SOJ-COMBAT-006 | Umbau einzelner Schiffswerte in der Werft | Individuelle Abweichungen von den Grundwerten eines Schiffmodells: je Wert bis zu +15 % oder −15 %. | Konzept |
| SOJ-COMBAT-007 | Seismische Bombe als vierte Mine | Zeitzünder, kreisförmige Energiewelle und physische Asteroidenreaktionen. | Idee |
| SOJ-COMBAT-008 | Zeitverzerrungsbombe | Flächenexplosion; das eigene Schiff ist währenddessen zeitlich entkoppelt. | Idee |
| SOJ-COMBAT-009 | Traktorstrahl als Kampfmittel | Asteroiden gegen Gegner bewegen und eventuell für Manöver nutzen. | Idee |
| SOJ-COMBAT-010 | Physikalischer Positionskampf | Bewaffnung, Geschwindigkeit, Wendefähigkeit, Beschleunigung und Trägheit bestimmen den Verlauf. | Konzept |

---

## SOJ-COMBAT-001 – Zwei unabhängige Kampf-KIs

### Was wir wollen

Der Spieler steuert im Raumkampf nicht jeden Schuss und jedes Flugmanöver. Er legt die grundsätzliche Absicht fest, beispielsweise **kämpfen oder fliehen**, und gestaltet sein Schiff durch Ausrüstung, Crew und spätere Werftanpassungen. Die **Spieler-KI** führt die Taktik aus. Der gegnerische NPC hat **eine eigene KI**, eine eigene Ausrüstung, eigene Crewwerte und eigene Ziele.

Beide KIs beurteilen fortlaufend ihre Lage und versuchen gleichzeitig, **ihre jeweils bevorzugte Kampfposition** herzustellen. Es geht nicht darum, dass eine KI eine vorgegebene Choreografie abspielt. Das Ergebnis hängt davon ab, welche Taktik unter den tatsächlich gegebenen Bedingungen funktioniert.

### Konkretes Kampfbeispiel

- **Piratenschiff:** Schwere seitliche Hüllenkanonen, leichte Rundumgeschütze, mittlere Geschwindigkeit. Die KI will in die Reichweite der Seitenkanonen gelangen und eine Breitseite präsentieren.
- **Patrouillenschiff:** Schwere, nur nach vorn feuernde Railgun, leichte Rundumgeschütze, hohe Geschwindigkeit. Die KI will den Gegner vor dem Bug und möglichst außerhalb der Reichweite der Seitenkanonen halten.
- Beide Schiffe reagieren auf die Position und Kursänderungen des jeweils anderen. Ob die Piraten eine Breitseite erzwingen oder die Patrouille Abstand und Frontausrichtung halten kann, entscheidet sich im Kampf.

Die Spieler-KI soll **keine versteckten Vorteile** gegenüber der NPC-KI haben. Beide verwenden dieselben grundlegenden Regeln.

### Wichtig

Eine KI soll nicht ohne taktischen Grund vom Gegner wegfliegen, wenn sie **kämpfen** will. Abstand zu halten ist nur sinnvoll, wenn die eigene Waffe oder Lage davon profitiert; sonst soll sie eine günstige Angriffsposition suchen.

**Noch offen:** Die genaue Auswahl- und Wechselregel zwischen vorhandenen Taktiken. Es ist keine zusätzliche komplizierte Spielersteuerung beschlossen.

## SOJ-COMBAT-002 – Waffenaufhängung und tatsächliche Schusswinkel

### Was wir wollen

Nicht jede Waffe kann ungeachtet der Flugrichtung überallhin schießen. Die **Montage** und ihr begrenzter **Feuerwinkel** beeinflussen, wie die Kampf-KI das Schiff positionieren muss.

| Waffenposition | Gewünschte Wirkung | Konsequenz für das Schiff |
|---|---|---|
| **Front, enger Schusswinkel** | Vor allem schwere Railgun; viel Reichweite und hoher Einzelschaden | Der Bug muss zum Ziel zeigen. Gegner können versuchen, seitlich aus dem Schussfeld zu kommen. |
| **Seitlich, begrenzter Schusswinkel** | Vorzugsweise schwere Waffen mit hohem Hüllenschaden, z. B. schwere Autokanonen oder Plasmabatterien | Das Schiff muss Backbord oder Steuerbord zum Gegner drehen bzw. seitlich an ihm vorbeifliegen. |
| **Rundum, bis 360°** | Eher schwächere, flexible Waffen, z. B. leichte Impuls- oder Ionenlaser | Sie können auch während Wendemanövern oder bei ungünstiger Bugausrichtung weiterfeuern. |
| **Lenkwaffen** | Raketen korrigieren nach dem Start ihre Flugrichtung | Müssen nicht denselben festen seitlichen oder vorderen Feuerkegel wie starre Geschütze haben. |

Das ist **eine bevorzugte Designaufteilung, noch keine abschließende Zuordnung aller acht vorhandenen Waffenfamilien**. Die exakten Winkel (z. B. +/-30°) sind nicht entschieden.

### Warum diese Einschränkungen?

Große fest verbaute Waffen erhalten eine klare taktische Rolle; kleine bewegliche Geschütze bleiben flexibel. Dadurch lässt sich **am Verhalten des Schiffs erkennen, wie es bewaffnet ist**. Die schwere Seitenwaffe darf nicht einfach ohne Ausrichtungsnachteil genauso funktionieren wie ein Rundumturm.

## SOJ-COMBAT-003 – Railgun: schwerer Schuss, lange Reichweite, bewusstes Timing

### Was wir wollen

Die Railgun soll sich deutlich von einer schnell feuernden Kanone unterscheiden:

- **Sehr hoher Hüllenschaden pro Treffer**, vor allem bei bereits ausgefallenen Schilden.
- **Sehr hohe Reichweite**, größer als bei den gewöhnlichen Nah- und Mittelstreckenwaffen.
- **Sehr lange Auflade- bzw. Nachladezeit**; wenige entscheidende Schüsse statt Dauerfeuer.
- **Eng begrenzter Schusswinkel direkt nach vorne**: Das Schiff muss seinen Bug ausrichten.
- **Kein garantierter Treffer**. Reichweite, Ausrichtung, Gegnerbewegung und Hindernisse bleiben relevant.

### Weshalb nicht immer sofort feuern?

Das von uns besprochene Beispiel ist entscheidend:

1. Das gegnerische Schiff hat keine Schilde mehr.
2. Die Railgun könnte ihm mit einem Treffer **beispielsweise 30 % Hüllenschaden** zufügen. **30 % ist ein Beispiel, kein festgelegter Waffenwert.**
3. Wenn die KI sofort schießt, ist die Railgun danach lange nicht einsatzbereit.
4. Der angeschlagene Gegner entscheidet sich zur Flucht und gewinnt Abstand.
5. Alle anderen Waffen sind schließlich außer Reichweite. Die Railgun hätte den fliehenden Gegner noch treffen können, ist nun aber nicht geladen.

**Deshalb darf eine gute Kampf-KI einen geladenen Railgun-Schuss zurückhalten**, um ihn beim Fluchtversuch einzusetzen – idealerweise dann, wenn die übrigen Waffen nicht mehr reichen. So kann der Schuss die Flucht verhindern oder den Gegner kampfunfähig machen.

**Keine starre Endkampf-Regel:** Ist der Gegner akut gefährlich oder bietet sich eine außergewöhnlich gute Gelegenheit, darf die KI früher schießen. Auch beim Verfolgen muss das Schiff den engen Frontwinkel tatsächlich herstellen können.

**Noch offen:** Schadenswert, genaue Reichweite, Cooldown, Winkel, Aufladeeffekt, Geschossdarstellung und Regeln zur Entscheidung „jetzt feuern oder aufsparen“.

## SOJ-COMBAT-004 – Breitseitenkampf und Fluchtverfolgung

### Was wir wollen

Schwer bewaffnete Schiffe, insbesondere mögliche größere Piratenschiffe, sollen **Breitseiten** wie historische Kanonenschiffe einsetzen können: Sie drehen eine bewaffnete Schiffsseite zum Gegner und feuern aus einem begrenzten Seitenwinkel.

Ein Schiff mit schweren Seitenkanonen versucht daher, **quer oder parallel zum Gegner** in Schussposition zu gelangen. Ein Schiff mit Front-Railgun versucht dagegen, den **Bug** auf den Gegner auszurichten. Leichte Rundumgeschütze können bei beiden Schiffen währenddessen weiterfeuern.

### Die wichtige Konsequenz beim Fliehen

- Der Verteidiger verliert Schilde/Hülle und versucht zu entkommen.
- Der Angreifer kann mit Seitenwaffen noch feuern, **solange das Ziel in deren Winkel und Reichweite bleibt**.
- Entfernt sich das Ziel, muss der Angreifer eventuell **sein Schiff drehen und die Verfolgung mit dem Hauptantrieb aufnehmen**.
- Während dieses Wendemanövers kann er die schwere Seitenbewaffnung nicht oder nur eingeschränkt nutzen. Der Gegner gewinnt möglicherweise wertvollen Abstand.
- Eine nach vorne gerichtete Langstreckenwaffe ist beim Hinterherfliegen dagegen vorteilhaft, sofern sie geladen und richtig ausgerichtet ist.

Das ist ein **natürlicher Ausrüstungsnachteil** von Seitenkanonen und soll nicht durch künstliche KI-Benachteiligung simuliert werden.

**Noch offen:** Welche Schiffstypen schwere seitliche Waffen tragen können, Anzahl/Position der Geschütze, exakte Schusskegel und gegebenenfalls asymmetrische Bewaffnung auf Backbord/Steuerbord. Letzteres wurde als mögliche Erweiterung diskutiert, **nicht festgelegt**.

## SOJ-COMBAT-005 – Crewfähigkeiten mit konkretem Einfluss auf Raumkämpfe

### Was wir wollen

Ein identisch gebautes Schiff kann sich mit einer anderen Besatzung **spürbar anders** verhalten. Als Diskussionsgröße wurden **bis zu 30 % Veränderung einzelner geeigneter Leistungswerte** genannt. Das ist **keine pauschale +30-%-Verbesserung für alles**.

| Rolle | Konkrete Wirkung, die wir besprochen haben |
|---|---|
| **Steuermann** | Beeinflusst die **Wendegeschwindigkeit** des Schiffs. Eine gute Besatzung kann den Bug bzw. die bewaffnete Seite schneller neu ausrichten. |
| **Techniker** | Beeinflusst **Beschleunigung** und **Höchstgeschwindigkeit**. Damit ändern sich Einholen, Abstandhalten und Fluchtmöglichkeiten. |
| **Waffenoffizier** | Beeinflusst **Nachladezeiten** und **Treffergenauigkeit**. |
| **Kampfstratege** | Beeinflusst die **Qualität der taktischen Entscheidungen** der Kampf-KI, z. B. wann die Railgun abgefeuert oder zurückgehalten wird und welche Kampfposition anzustreben ist. |

Ein möglicher **direkter Schadensbonus** durch Crew wurde angesprochen, ist **nicht abschließend beschlossen**. Der besondere Nutzen des Kampfstrategen soll vor allem im **Verhalten der KI** liegen, nicht bloß in einem Schadensmultiplikator.

### Konkretes Beispiel

Zwei identisch bewaffnete Schiffe: Das eine hat einen ausgezeichneten Steuermann, das andere einen guten Strategen. Das erste kann sich schneller in den Front- oder Seitenwinkel drehen; das zweite kann besser entscheiden, **welcher Schuss jetzt nötig ist und welche Position sich lohnt**. Keines soll allein aufgrund einer einzigen Crewzahl automatisch gewinnen.

### Nicht vorgesehen

Keine zusätzlich erfundenen Werte wie „Präzision bei Flugmanövern“. Ein Crewbonus muss immer an einen **tatsächlichen, eindeutig definierten Spielwert oder eine klar prüfbare KI-Entscheidung** gekoppelt sein.

**Noch offen:** Exakte Prozentwerte und Kurven je Fähigkeit, Crew-Skalierung und das Zusammenwirken mit Umbauten in der Werft.

## SOJ-COMBAT-006 – Schiffswerft: konkrete Schiffswerte selbst verändern (jeweils bis zu +/-15 %)

### Grundidee

**Jeder Schiffstyp bzw. jedes Schiffsmodell hat eigene Grundwerte.** Ein Frachter, Miner, Bergungsschiff und Patrouillenschiff sollen sich also nicht nur durch ihren Namen oder ihre Waffen unterscheiden.

In der **Schiffswerft** soll der Spieler **einzelne Eigenschaften seines konkreten Schiffs** verändern können, statt für jede Variante ein anderes Schiff zu benötigen.

**Pro veränderbarem Wert soll eine Anpassung um bis zu 15 % nach oben oder bis zu 15 % nach unten möglich sein.** Die Prozentangabe bezieht sich auf den jeweiligen Grundwert des Schiffmodells. Die Idee ist, dass man **bewusst Stärken gegen Schwächen eintauschen** kann.

### Welche Schiffswerte sind gemeint?

| Veränderbarer Wert | Was er konkret im Spiel verändern soll |
|---|---|
| **Höchstgeschwindigkeit** | Wie schnell das Schiff maximal fliegen kann; relevant für Einholen, Distanzhalten und Flucht. |
| **Beschleunigung** | Wie schnell das Schiff Geschwindigkeit auf- oder abbaut bzw. nach Richtungswechseln wieder Fahrt gewinnt; relevant bei Positionswechseln. |
| **Wendegeschwindigkeit / Manövrierfähigkeit** | Wie schnell das Schiff seinen **Bug und damit seine Front- oder Seitenwaffen** in eine neue Richtung drehen kann. „Manövrierfähigkeit“ ist hier **kein zusätzlicher unbestimmter Fantasiewert**, sondern muss bei einer Umsetzung klar auf die realen Bewegungswerte abgebildet werden. |
| **Hüllenstärke / Hüllenpunkte** | Wie viel Hüllenschaden das Schiff aushält, bevor es kampfunfähig wird. |
| **Eventuell Schildstärke** | Wie viel Schildschaden das Schiff aushält; **nur als mögliche Ergänzung besprochen**, noch nicht als veränderbarer Werftwert beschlossen. |

Es sollen die **realen Simulationswerte** verändert werden, nicht nur angezeigte Zahlen. Die Schiffstypen **behalten ihre unterschiedlichen Ausgangsprofile**; Umbauten individualisieren ein bestimmtes Modell innerhalb dieser Grenzen.

### Beispiel für zwei Umbauten desselben Bergungsschiffs

**Variante A – schnell und wendig:**
- Höchstgeschwindigkeit **+15 %**
- Wendegeschwindigkeit **+15 %**
- Hüllenstärke **−15 %**

Dieses Schiff kann besser Abstand gewinnen und schwer bewaffneten Gegnern ausweichen, hält aber weniger Treffer aus.

**Variante B – widerstandsfähiger:**
- Eine bewusst geringere Höchstgeschwindigkeit, zum Beispiel **−15 %**
- Dafür eine entsprechend stärkere Hülle, beispielsweise **+15 %**

Dieses Schiff kann mehr Treffer einstecken, hat aber geringere Chancen, einen Gegner einzuholen oder zu entkommen.

**Die Varianten illustrieren die gewünschte Entscheidungsfreiheit und sind keine bereits definierte Umbau-Rezeptliste.**

### Was noch nicht entschieden ist

- **Ausgleichsregel:** Muss jede Erhöhung durch eine Verringerung eines anderen Wertes bezahlt werden? Wir haben das als **sinnvolle Balanceidee**, aber noch nicht als endgültiges Punktesystem festgelegt.
- **Welche Werte genau:** Geschwindigkeit, Beschleunigung, Wenden und Hülle sind die konkret besprochenen Kandidaten; Schilde bleiben optional.
- **Kosten und Grenzen:** Credits, Umbauzeiten, Anzahl veränderbarer Werte und mögliche Abhängigkeiten sind offen.
- **Zusammenspiel mit Crew:** Der Werftumbau und der Crewbonus verändern möglicherweise dieselbe Eigenschaft. Wie ihre Prozente kombiniert und begrenzt werden, muss noch entschieden werden.

**Wesentlich:** Das Ziel ist **eine echte Wahl zwischen schneller, wendiger und widerstandsfähiger**, nicht ein Upgrade-Knopf, der überall gleichzeitig +15 % gibt.

## SOJ-COMBAT-007 – Seismische Bombe: vierter Minentyp

### Was wir wollen

Neben den bestehenden **Ionen-, Hohlladungs- und Jägerminen** soll es als Idee eine **vierte, zeitgezündete Mine** geben. Die visuelle Inspiration ist die seismische Ladung von Slave One aus *Star Wars*.

Ein Schiff setzt die Bombe aus. Sie driftet und **detoniert nach einigen Sekunden** statt erst dann, wenn ein Gegner nahe genug ist. **Etwa drei Sekunden** wurden als anschaulicher Richtwert erwähnt, nicht festgelegt.

### Was beim Zünden sichtbar und physisch passieren soll

1. Sehr heller, kurzer Detonationsblitz.
2. Ein **scharf begrenzter kreisförmiger Energiering** rast aus der Detonationsstelle nach außen; **kein normaler Feuerball**.
3. Er erreicht Schiffe, Wracks und **Asteroiden**.
4. Asteroiden reagieren: Einschlagblitze, Gesteinsausbrüche; kleine Brocken werden weggeschleudert, größere können sich bewegen oder zerbrechen.
5. Bewegte Fragmente können **weitere Asteroiden oder Schiffe treffen** und dadurch Kettenreaktionen auslösen.

Die Bombe verändert somit die **räumlichen Bedingungen** des Gefechts und ist nicht bloß eine Mine mit höheren Schadenswerten.

**Noch offen:** Zeitzünder, Radius, Schadenswerte, Ausbreitungstempo, Impuls-/Gravitations-Erklärung im Vakuum, Stärke der Asteroidenreaktionen und Eigengefährdung. Der vierte Minentyp ist **noch nicht implementiert**.

## SOJ-COMBAT-008 – Zeitverzerrungsbombe

### Was wir wollen

Inspiriert von deiner Erinnerung an eine mächtige Bombe aus *Privateer* / *Privateer 2*. Die historische Originalbezeichnung oder exakte Originalmechanik ist **nicht als gesichert dokumentiert**; entscheidend ist **die von dir beschriebene Idee**:

- Das eigene Schiff wird **kurzzeitig aus dem normalen Zeitablauf verschoben bzw. zeitlich entkoppelt**.
- **Während dieser Zeit** findet im normalen Raum eine gewaltige Flächenexplosion statt.
- Das eigene Schiff **ist zum Zeitpunkt der Explosion nicht normal anwesend** und wird deshalb nicht von ihr erfasst.
- Danach kehrt es zurück und sieht die Folgen der Explosion.

**Wichtig: Es geht ausdrücklich nicht darum, eine Bombe abzuwerfen und mit Geschwindigkeit vor der Explosion davonzufliegen.** Die **Zeitverzerrung** ist der eigentliche Mechanismus und unterscheidet sie von der seismischen Bombe.

Die Wirkung soll spektakulär und klar von normalen Raketenexplosionen abgegrenzt sein.

**Noch offen:** genaue Art des Zeitversatzes, Wirkungsradius, Schadens- und Schutzregeln, Seltenheit, Kosten, Gegenmaßnahmen, optischer Ablauf und Balancing. Besonders zu prüfen: Eine zu leicht verfügbare unangreifbare Flächenwaffe könnte andere Bewaffnung entwerten.

## SOJ-COMBAT-009 – Asteroiden als Waffen mittels Traktorstrahl

### Was wir wollen

Vor allem **Mining- und Bergungsschiffe** haben Traktorstrahlen als naheliegende Ausrüstung. Sie sollen perspektivisch nicht nur zum Bergen bzw. Arbeiten, sondern **auch taktisch im Kampf** nutzbar sein.

- Einen Asteroiden **ziehen**, **ablenken** oder **abstoßen**.
- Einen Brocken gezielt **in den Flugweg eines Gegners** bringen oder gegen ihn bewegen.
- Der Asteroid bewegt sich räumlich weiter und kann **Schiffe, andere Asteroiden oder Wracks** treffen.
- Als weitere **noch offene Möglichkeit** kann sich ein Schiff mit dem Strahl an großen Körpern entlangziehen, um bestimmte Kurven oder Manöver zu unterstützen.

Das verleiht einem Miner oder Salvager eine Kampfmöglichkeit, die **nicht voraussetzt, dass er die gleiche schwere Bewaffnung wie ein Patrouillenschiff trägt**.

**Noch offen:** Realistische Zug- oder Druckwirkung, Massenlimits, Reichweite, Kollisionsschaden, Sichtbarkeit und Einsatzentscheidungen der KI. Der schon existierende Traktorstrahl bedeutet **nicht**, dass diese Asteroidenfunktion bereits umgesetzt ist.

## SOJ-COMBAT-010 – Kampfpositionen entstehen aus echter Schiffsphysik

### Was wir wollen

Die beiden Kampf-KIs kämpfen **nicht nur mit Schadenswerten gegeneinander**. Sie versuchen, ihre unterschiedlichen Waffen unter tatsächlichen Bewegungsbedingungen einsetzen zu können.

Berücksichtigt werden sollen:
- **Höchstgeschwindigkeit:** Wer kann den anderen einholen oder sich lösen?
- **Beschleunigung:** Wer erreicht den benötigten Kurs bzw. die nötige Geschwindigkeit schneller?
- **Wendegeschwindigkeit:** Wie schnell lässt sich der Bug oder eine bewaffnete Schiffseite ausrichten?
- **Trägheit:** Ein Raumschiff kann nach einem Drehen noch in die vorherige Richtung **weiterdriften**. Ausrichtung und Flugrichtung müssen nicht identisch sein.
- **Schusswinkel und Reichweiten:** Eine mächtige Waffe hilft nur, wenn der Gegner tatsächlich im Feuerbereich ist.
- **Hindernisse:** Asteroiden und Wracks können Bewegung und Feuer beeinflussen.

### Was daraus entstehen soll

- Ein schnelles Railgun-Schiff hält möglichst die Distanz und richtet seine Frontwaffe aus.
- Ein schweres Breitseitenschiff versucht, näher heranzukommen und seitlich Feuerwinkel zu gewinnen.
- Ein fliehendes Schiff versucht tatsächlich Abstand zu gewinnen; der Verfolger muss abwägen, ob er erst drehen oder noch feuern kann.
- Gute Crew und Werftumbauten ändern **die tatsächlichen Chancen, solche Positionen zu erreichen**, nicht bloß angezeigte Werte.

**Keine fest abgespielten Kampfchoreografien** und kein vorher bestimmtes Sieger-Schiff. Die Schiffsphysik muss für Spieler und NPC gleichermaßen gelten. Der Spieler muss dafür nicht jeden RCS-Impuls selbst steuern.

**Noch offen:** Genaues Bewegungsmodell, Priorisierung konkurrierender KI-Ziele, Schutz vor endlosem gegenseitigem Kreisen und das Verhalten in engen Asteroidenfeldern.

---

## Vorhandene Ausgangsbasis – nicht mit den neuen Ideen verwechseln

In Sojourn existieren bereits acht Waffenfamilien (**Impulslaser, Plasmabatterie, Lenkraketen, Ionenlaser, Ionenkanone, Autokanone, Railgun und HE-Sprengraketen**) sowie drei Minenfamilien (**Ionenmine, Hohlladungsmine, Jägermine**), jeweils mit Mk-Stufen. Ebenso gibt es bereits Schiffstypen mit unterschiedlichen Werten, eine automatische Raumkampf-KI und Traktorstrahlkomponenten.

**Die hier beschriebenen neuen Feuerwinkel, intelligenten Railgun-Zeitpunkte, individuellen Werft-Wertverschiebungen, Asteroidenmanipulationen und Spezialbomben sind dadurch nicht automatisch implementiert.**

## Festgehalten, aber weiterhin offen

1. **Konkrete Zahlen:** Exakte Railgun-Reichweite, Cooldown, Winkel und Hüllenschaden sowie alle anderen Feuerwinkel; Beispielwerte sind noch keine Balanceentscheidung.
2. **Werft-Balance:** Exakte Kopplung der **bis zu +15 % / −15 % pro Wert** und erlaubte Umbaukombinationen.
3. **Crew-Balance:** Welche Einzelwerte bis zu 30 % profitieren und wie sich Crew- und Werftboni gegenseitig beeinflussen.
4. **Taktik-KI:** Wann eine Railgun zurückgehalten wird, wann sie trotzdem früh feuert und wann ein KI-Schiff seine Positionierungsstrategie wechselt.
5. **Spezialwaffen:** Explosion, Reichweite, Asteroidenphysik und Risiken für die eigene Seite.

**Keine Gameplay-Implementierung oder Freigabe zum Merge durch dieses Dokument. Die nächste Phase beginnt nur auf ausdrücklichen Auftrag.**

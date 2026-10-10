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
| SOJ-COMBAT-009 | Traktorstrahl als Kampfmittel | Kleinere Asteroiden mit dem Traktorstrahl beschleunigen und gezielt gegen gegnerische Schiffe schleudern; eventuell für Manöver nutzen. | Idee |
| SOJ-COMBAT-010 | Physikalischer Positionskampf | Bewaffnung, Geschwindigkeit, Wendefähigkeit, Beschleunigung und Trägheit bestimmen den Verlauf. | Konzept |
| SOJ-COMBAT-011 | Greifhaken, Seilwinde und Traktor-Unterstützung | Nach erfolgreichem Haken bleibt die Trägheit erhalten; Seilspannung und Winde bringen die Schiffe zusammen, ein Traktorstrahl unterstützt. | Konzept / Phase 1 |
| SOJ-COMBAT-012 | KI wählt zwischen Hüllen- und Komponentenzielen | Bei ausgefallenen Schilden entscheidet die KI, ob sie die Hülle zerstört oder abhängig von Position, Schusswinkel und Kampfziel Antrieb bzw. Traktorstrahl ausschaltet. | Idee / nach Phase 1 |
| SOJ-COMBAT-013 | Taktische Reaktion auf entdeckte Minen | KI wägt ab, die Mine zu zerstören, auszuweichen oder einen Treffer in Kauf zu nehmen, um den Gegner weiter anzugreifen. | Idee / nach Phase 1 |

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

- **Kleinere Asteroiden** sind die bevorzugten Geschosse: Mit dem Traktorstrahl aufnehmen, ziehen bzw. beschleunigen und **gezielt auf das gegnerische Schiff schleudern**. Das ist nicht bloß ein kosmetischer Strahleffekt.
- Größere Asteroiden können gegebenenfalls **abgelenkt oder als Hindernisse verschoben** werden; ob sie sich überhaupt gezielt schleudern lassen, hängt von noch festzulegenden Grenzen für Masse und Traktorleistung ab.
- Nach dem Schleudern bewegt sich der kleinere Asteroid mit **eigener Geschwindigkeit und Trägheit** weiter. Er kann das gegnerische Schiff oder andere Hindernisse treffen. Ein Treffer soll über die reale Kollision wirken, nicht als sofortiger unsichtbarer Waffenschaden.
- **Die KI muss eine physikalisch geeignete Wurfbahn herstellen**: Asteroid erfassen, in eine geeignete Richtung beschleunigen und im richtigen Moment freigeben. Auch das gegnerische Schiff bewegt sich währenddessen weiter.
- Als weitere **noch offene Möglichkeit** kann sich ein Schiff mit dem Strahl an großen Körpern entlangziehen, um bestimmte Kurven oder Manöver zu unterstützen.

Das verleiht einem Miner oder Salvager eine Kampfmöglichkeit, die **nicht voraussetzt, dass er die gleiche schwere Bewaffnung wie ein Patrouillenschiff trägt**.

**Noch offen:** Zug- oder Druckwirkung, erreichbare Beschleunigung in Abhängigkeit von Asteroidenmasse und Traktorleistung, Freigabezeitpunkt, Reichweite, Kollisionsschaden, Sichtbarkeit, mögliche Rückwirkung auf das schießende Schiff sowie Einsatzentscheidungen der KI. Der schon existierende Traktorstrahl bedeutet **nicht**, dass diese Asteroidenfunktion bereits umgesetzt ist.

**Umsetzungszuordnung:** Als Erweiterung der **Objekt-/Kollisionsphysik** nach der grundlegenden Schiffsträgheit. Um die neuen Kampfmanöver glaubwürdig zu machen, müssten kleinere Asteroiden im lokalen Raumkampf als bewegliche physikalische Körper behandelt werden. Das ist mehr als die aktuell für Phase 1 begonnene Schiffsbewegungs- und Enterseilphysik und deshalb separat zu planen.

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

## SOJ-COMBAT-011 – Enterhaken, Seilwinde und unterstützender Traktorstrahl

### Was wir wollen

Das **bereits bestehende Entern mit Greifhaken** soll an die neue Flugphysik angepasst werden. Ein erfolgreicher Greifhaken ist die **mechanische Verbindung** der beiden Schiffe. Er darf nicht einfach beide Schiffe abrupt zum Stillstand bringen und das Ziel anschließend ohne nachvollziehbare Bewegung zum Angreifer verschieben.

Die Reihenfolge des Entervorgangs:

1. **Haken wird abgeschossen und trifft** den ungeschützten Gegner. Die bestehenden Bedingungen für Enterversuch, Schildzustand, Trefferchance und die Begrenzung auf einen Versuch bleiben erhalten.
2. **Seil wird verbunden und spannt sich.** Die Schiffe behalten zunächst ihre vorhandene Geschwindigkeit und Bewegungsrichtung. Wenn das Seil straff ist, wirkt die Zugkraft auf **beide Schiffe**, nicht nur auf das Ziel.
3. **Schiffe beeinflussen sich gegenseitig.** Bremst oder dreht eines der Schiffe, kann das andere durch seine Trägheit ausschwingen und hinterhergezogen werden. Es soll kein starres, sofortiges Nebeneinanderteleportieren geben.
4. **Seilwinde holt ein.** Die Verbindung wird schrittweise kürzer; die Schiffe kommen kontrolliert näher, bis der für den Enterkampf nötige Kopplungsabstand erreicht ist.
5. **Vorhandener Traktorstrahl unterstützt das Einholen.** Hat das angreifende Schiff einen nutzbaren Traktorstrahl, liefert er zusätzliche Zugkraft; bei ansonsten gleicher Lage erfolgt das Einholen schneller. **Der Traktorstrahl allein ersetzt nie den erfolgreichen Greifhaken.**

Der visuelle Greifhaken und das gespannte, metallische Seil bleiben an ihren jeweiligen Hardpoints verankert, auch während beide Schiffe sich drehen oder driften.

### Konsequenzen und Grenzen

- Die Lösung soll eine **einfache nachvollziehbare Seilspannungs-/Zugkraftsimulation** verwenden, nicht eine unnötig aufwendige Segment-für-Segment-Seilphysik.
- Spieler und NPCs verwenden **dieselbe Enterphysik** und dieselbe Traktor-Unterstützung, sofern die Ausrüstung vorhanden ist.
- Der Haken bleibt bei einem **Fehlschlag** ohne dauerhafte Verbindung und prallt wie bisher ab.
- Wenn ein Traktorstrahl nicht vorhanden oder außer Funktion ist, muss das **Einziehen per Seilwinde weiterhin funktionieren**.

**Noch offen:** Konkrete Winden-Zugkraft, Stärke der zusätzlichen Traktorunterstützung, Schwung-/Dämpfungsverhalten, Absicherung gegen Durchdringen von Asteroiden/Wracks und ob eine der beiden Parteien während des Einholens weiter aktiv steuern kann.

**Einordnung:** Dieser Punkt gehört zur **Phase 1 (Bewegungsphysik)**. Eine Aufnahme in die Matrix bedeutet **nicht**, dass die beschriebene vollständige Seilphysik bereits eingebaut wurde.

## SOJ-COMBAT-012 – KI-Zielwahl: Hülle zerstören oder gegnerische Komponenten ausschalten

### Was wir wollen

Die KI muss sich ausdrücklich zwischen **drei Zielabsichten** entscheiden: **(1) Hülle beschießen, um das Schiff kampfunfähig zu machen**, **(2) Antrieb angreifen, um das Ziel zu verlangsamen bzw. eine Flucht zu verhindern**, oder **(3) Traktorstrahl ausschalten, um dessen taktischen Einsatz zu unterbinden**. Angriffe auf einzelne Komponenten sind **erst nach Ausfall der gegnerischen Schilde** möglich. Bis dahin erfolgt die Bekämpfung wie bisher über die normalen Schutz- und Schadensregeln.

Die Entscheidung hängt von **eigener und gegnerischer Position, tatsächlichen Schusswinkeln der verfügbaren Waffen, erreichbarer Trefferzone, Reichweite, gegnerischem Verhalten und taktischem Ziel** ab. Die KI darf nicht blind bei jeder Gelegenheit auf eine Komponente schießen, wenn allgemeiner Hüllenschaden sinnvoller ist.

### Drei Zieloptionen – keine weiteren Komponentenziele

| Ziel | Wann/aus welcher Position | Beabsichtigter taktischer Effekt |
|---|---|---|
| **Hülle** | Normales Angriffsziel, insbesondere wenn ein schneller Abschuss möglich ist oder kein sinnvoll anvisierbarer Komponentenbereich erreicht wird. Vorhandene Schild- und Hüllenschadensregeln gelten weiter. | Gegner durch **Hüllenschaden kampfunfähig machen**; nicht nur seine Bewegung einschränken. |
| **Traktorstrahl** | **Nur bei ausgefallenen Schilden.** Keine zusätzliche pauschale Heckpflicht, aber die eigene Waffe muss Reichweite, **Schusswinkel und die tatsächlich erreichbare Komponenten-Trefferzone** erfüllen. | Den gegnerischen Traktorstrahl ausschalten bzw. seine Funktion beeinträchtigen, besonders wenn er die eigene Flucht verhindert oder beim Entern Zugkraft liefert. |
| **Hauptantrieb** | **Nur bei ausgefallenen Schilden** und wenn das Schiff die **hintere Trefferzone am gegnerischen Heck** aus einer geeigneten Position und mit passendem Waffen-Schusswinkel erreichen kann; besonders bei Verfolgung. | Antriebsleistung beeinträchtigen, um den Gegner zu bremsen, einzuholen oder eine Flucht zu verhindern. |

### KI-Entscheidungen anhand konkreter Kampfsituationen

**Beispiel A – Gegner versucht zu fliehen:** Seine Schilde sind unten. Ein verfolgendes Schiff gelangt in seinen hinteren Schussbereich. Statt ausschließlich die Hülle zu beschießen, kann die KI den **Antrieb als Ziel** auswählen, um den Gegner auszubremsen. Dafür muss sie selbst passend zum Heck positioniert sein; sie darf nicht aus einer beliebigen Richtung behaupten, einen Heckantrieb getroffen zu haben.

**Beispiel B – Railgun ist geladen:** Die eigene Railgun hat hohe Reichweite und lange Nachladezeit. Die KI kann abwägen, ob ein gezielter Schuss **auf den von hinten erreichbaren Antrieb** sinnvoller ist als ein normaler schwerer Hüllentreffer, wenn das Ziel flieht. Der Treffer ist nicht garantiert und die Railgun erhält dadurch keinen Sonderbonus, der nicht begründet ist. Das schließt an **SOJ-COMBAT-003** an: Ein Schuss kann für den kritischen Moment aufgehoben werden.

**Beispiel C – Traktorstrahl verhindert Flucht oder unterstützt gegnerisches Entern:** Die KI darf den **Traktorstrahl gezielt bekämpfen**, sobald die Schilde unten sind, ohne erst hinter den Gegner fliegen zu müssen. Die normalen Waffenreichweiten und Waffen-Schusswinkel gelten trotzdem. Ob ein bereits verbundenes Enterseil bestehen bleibt, ist davon getrennt: **Traktorstrahl und Enterhaken sind unterschiedliche Systeme**.

**Beispiel D – Gegner kämpft einfach weiter:** Wenn der Gegner bereits angeschlagen ist und die eigene Feuerkraft ihn kampfunfähig machen kann, wählt die KI **Hülle zerstören**. Sie verschwendet dann nicht erst ihre Railgun-Ladung auf einen taktisch unwichtigen Traktorstrahl.

**Beispiel E – Ungünstiger Anflugwinkel:** Der Gegner flieht, aber das eigene Schiff befindet sich vor ihm oder seitlich und kann seine hintere Antriebs-Trefferzone nicht erreichen. Dann ist **kein gezielter Antriebsschuss** möglich. Die KI kann den Angriffswinkel ändern, ein anderes zulässiges Ziel beschießen oder zunächst die Hülle bekämpfen.

### Klare Grenzen für die erste Ausbaustufe

- **Noch nicht auf Waffen oder Enterhaken zielen.** Diese Komponentenziele bleiben ausdrücklich für eine spätere Erweiterung reserviert.
- **Keine garantierte sofortige Abschaltung durch einen beliebigen Treffer.** Wie gezielter Schaden, Schutz/Komponentenhaltbarkeit und Auswirkungen auf laufende Aktionen berechnet werden, ist noch zu spezifizieren.
- Spieler-KI und NPC-KI erhalten dieselben Möglichkeiten; die Wahl richtet sich nach Situation, eigener Bewaffnung, relativer Position und taktischem Ziel.
- **Hüllenbeschuss bleibt eine gleichberechtigte, oft bevorzugte Entscheidung**; Komponentenbeschuss ist kein automatisches Upgrade der normalen Zielwahl.
- Ein Angriff auf eine Komponente ist **nicht erlaubt**, wenn der tatsächliche eigene Feuerkegel bzw. die erreichbare Trefferzone nicht passt – auch dann nicht, wenn die KI die Komponente taktisch gern ausschalten würde.

**Noch offen:** Genaue Trefferzonen/Hardpoints, Regeln für Genauigkeit und Fehlschüsse, Komponentenschaden und Reparierbarkeit, Auswirkungen eines beschädigten statt zerstörten Antriebs, ob gezielte Treffer auch Hüllenschaden erzeugen und wie schnell ein Antriebsausfall die bereits vorhandene Trägheit abbaut. **Insbesondere darf ein Antriebsausfall nicht automatisch die vorhandene Geschwindigkeit auf null setzen**, wenn wir echte Trägheit wollen.

**Umsetzungsreihenfolge:** Nach stabiler **Phase 1**, im Zuge von **Waffenschusswinkeln/KI-Zielwahl** und einem klaren Modell für Komponentenschäden. Derzeit **Idee**, keine direkte Implementierungsfreigabe.

## SOJ-COMBAT-013 – Kampf-KI reagiert auf erkannte feindliche Minen

### Was wir wollen

**Wird eine gegnerische Mine als Gefahr erkannt**, soll die jeweilige Kampf-KI aktiv zwischen **drei sinnvollen Reaktionen** abwägen. Keine pauschale Regel „jede Mine sofort zerstören“ und kein automatischer Ausweichbefehl, der den Angriff immer unterbricht.

1. **Mine beschießen:** Die KI richtet eine geeignete Waffe auf die Mine, **sofern sie in Reichweite und Schusswinkel liegt** und vor der möglichen Auslösung rechtzeitig getroffen werden kann. Der Schuss fehlt dann möglicherweise im Kampf gegen das gegnerische Schiff.
2. **Mine umfliegen:** Die KI passt ihre Flugbahn so an, dass sie außerhalb der Gefahrenzone bleibt. Das kann Zeit kosten, die Bewaffnung kurz ungünstig ausrichten oder dem Gegner eine Flucht ermöglichen.
3. **Schaden bewusst riskieren:** Die KI fliegt ihren Angriffskurs weiter und beschießt das feindliche Schiff, wenn das Ausweichen oder Bekämpfen der Mine taktisch nachteiliger erscheint als der voraussichtliche Minenschaden.

### Entscheidende Faktoren der KI

- **Minenkontakt:** Nur **erkannte** Gefahren können gezielt bekämpft oder planmäßig umflogen werden. Die vorhandene Sensor- und Minenerkennung bleibt relevant; eine verborgene Mine löst nicht plötzlich „hellseherische“ Abwehr aus.
- **Voraussichtliche Gefahr:** Entfernung, eigener Kurs, Auslösebereich und verfügbare Reaktionszeit sowie soweit bekannt der Minentyp.
- **Eigener Zustand:** Verbleibende Schilde/Hülle. Dasselbe Risiko kann für ein intaktes Schiff vertretbar, für ein beschädigtes Schiff aber tödlich sein.
- **Eigene Möglichkeiten:** Verfügbare Waffen, deren Schusswinkel, Reichweite, Nachladezeit und die erforderliche Kursänderung für ein Ausweichmanöver.
- **Aktuelle Taktik:** Bei einer **Flucht** sollte der Weg zum Ausgang vorrangig bleiben; beim **Angriff** kann es sinnvoll sein, ein gewisses Risiko für einen entscheidenden Treffer einzugehen.

### Beispiele

**Beispiel A – Sichere Abwehr:** Die Mine liegt auf dem geplanten Kurs, ist erkannt und befindet sich in Reichweite eines geeigneten, einsatzbereiten Geschützes. Die KI kann sie zerstören, statt ein kostspieliges Ausweichmanöver zu fliegen.

**Beispiel B – Hoher strategischer Preis des Ausweichens:** Der Gegner ist beinahe kampfunfähig oder kurz davor zu entkommen. Das eigene Schiff hat noch ausreichend Schutz. Die KI darf **bewusst das Minenrisiko akzeptieren**, um weiter auf den Gegner zu feuern.

**Beispiel C – Bedrohte Flucht:** Das eigene Schiff ist schwer beschädigt, eine Mine blockiert die Route zum Ausgang. Ein Ausweichmanöver kann besser sein als der riskante Versuch, während der Flucht erst die Mine abzuschießen.

### Was erst vor der Umsetzung festgelegt werden muss

- **Beschießbarkeit:** Welche Waffentypen Minen tatsächlich treffen können, welche Treffer-/Schadensregeln gelten, wie Zielwahl und Schusswinkel berücksichtigt werden.
- **Zerstörung:** Wird eine beschossene Mine entschärft, zerstört oder **vorzeitig zur Explosion gebracht**? Eine Explosion in Schiffsnähe könnte das Abschießen gefährlicher machen. Das ist **noch offen**, kein bereits beschlossener Effekt.
- **Minenarten:** Unterschiedliche Reaktion auf Ionen-, Hohlladungs-, Jäger- und die vorgeschlagene seismische Zeitmine (SOJ-COMBAT-007), sobald letztere umgesetzt wird.
- **Priorisierung:** Die drei Handlungen müssen vergleichbar sein, ohne die KI in ständige Kurswechsel, Zielwechsel oder sinnloses Schießen zu treiben.

**Umsetzungsreihenfolge:** Nach den Grundlagen für **KI-Zielwahl**, **Schusswinkel**, **Minenerkennung** und **beschießbare Minen**. Der vorhandene Minen-Ausweichmechanismus ist **nicht gleichbedeutend mit dieser vollständigen Entscheidung zwischen Schießen, Ausweichen und Risiko**. Die Erweiterung soll für Spieler-KI und NPC-KI gleichermaßen gelten.

## Vorhandene Ausgangsbasis – nicht mit den neuen Ideen verwechseln

In Sojourn existieren bereits acht Waffenfamilien (**Impulslaser, Plasmabatterie, Lenkraketen, Ionenlaser, Ionenkanone, Autokanone, Railgun und HE-Sprengraketen**) sowie drei Minenfamilien (**Ionenmine, Hohlladungsmine, Jägermine**), jeweils mit Mk-Stufen. Ebenso gibt es bereits Schiffstypen mit unterschiedlichen Werten, eine automatische Raumkampf-KI und Traktorstrahlkomponenten.

**Die hier beschriebenen neuen Feuerwinkel, intelligenten Railgun-Zeitpunkte, individuellen Werft-Wertverschiebungen, Asteroidenmanipulationen und Spezialbomben sind dadurch nicht automatisch implementiert.**

## Festgehalten, aber weiterhin offen

1. **Konkrete Zahlen:** Exakte Railgun-Reichweite, Cooldown, Winkel und Hüllenschaden sowie alle anderen Feuerwinkel; Beispielwerte sind noch keine Balanceentscheidung.
2. **Werft-Balance:** Exakte Kopplung der **bis zu +15 % / −15 % pro Wert** und erlaubte Umbaukombinationen.
3. **Crew-Balance:** Welche Einzelwerte bis zu 30 % profitieren und wie sich Crew- und Werftboni gegenseitig beeinflussen.
4. **Taktik-KI:** Wann eine Railgun zurückgehalten wird, wann sie trotzdem früh feuert und wann ein KI-Schiff seine Positionierungsstrategie wechselt.
5. **Spezialwaffen:** Explosion, Reichweite, **Masse und Flugbahn kleiner mit Traktorstrahl geschleuderter Asteroiden**, Kollisionsschaden, allgemeine Asteroidenphysik und Risiken für die eigene Seite.
6. **KI-Zielwahl:** Regeln für die Entscheidung zwischen **Hülle zerstören, Antrieb treffen und Traktorstrahl ausschalten**; Beschädigungsmodell, konkrete Trefferzonen, Waffenschusswinkel, Treffergenauigkeit und Verhalten des Schiffs bei Antriebsausfall.
7. **Minen-KI:** Wann Abschießen statt Ausweichen sinnvoll ist, welche Waffen Minen treffen können und ob Beschuss eine Mine vorzeitig detonieren lässt.
8. **Enterhaken-Physik:** Stärke von Seilwinde und Traktor-Unterstützung sowie das Verhalten bei Schiffsmanövern und Hindernissen.

**Keine Gameplay-Implementierung oder Freigabe zum Merge durch dieses Dokument. Die nächste Phase beginnt nur auf ausdrücklichen Auftrag.**

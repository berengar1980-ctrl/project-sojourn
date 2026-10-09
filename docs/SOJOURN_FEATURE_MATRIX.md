# Project Sojourn — Feature-Matrix: Raumkampf

**Bereich:** Raumkampf / Schiffsindividualisierung  
**Status:** Abgestimmte Designideen, **keine Implementierungsfreigabe**  
**Stand:** 2026-10-10

Diese Matrix sammelt **Sojourn-eigene** Raumkampfideen. Sie ist von der [Voidbound-Feature-Parity-Matrix](VOIDBOUND_FEATURE_PARITY.md) unabhängig und ergänzt die [Sojourn-Ideen-Roadmap](SOJOURN_ROADMAP.md).

**Kennzeichnung:** 🧭 = als Konzept aufgenommen, noch nicht zur Umsetzung beauftragt. Bereits vorhandene Grundlagen (z. B. Kampf-KI, Waffen, Schiffswerte, Traktorstrahl) sind **nicht** gleichbedeutend mit einer Umsetzung der hier beschriebenen Erweiterungen.

| ID | Feature | Gewünschtes Verhalten | Status |
|---|---|---|---|
| `SOJ-COMBAT-001` | **Zwei eigenständige Kampf-KIs** | Spieler- und NPC-Schiff verfolgen jeweils eine eigene Taktik und reagieren aufeinander. Welche Taktik aufgeht, ergibt sich aus Ausrüstung, Crew, Position und Schiffsphysik. Keine privilegierte Spieler-KI. | 🧭 |
| `SOJ-COMBAT-002` | **Waffen-Schusswinkel** | Leichte Waffen können rundum (360°) wirken; schwere Hüllenwaffen vorzugsweise seitlich; die Railgun hat einen begrenzten Frontwinkel. Lenkwaffen können nach dem Start selbstständig steuern. | 🧭 |
| `SOJ-COMBAT-003` | **Railgun als taktische Langstreckenwaffe** | Hoher Hüllenschaden, hohe Reichweite, lange Nachladezeit, Schuss nur im Frontwinkel. Die KI *kann* einen geladenen Schuss für einen fliehenden Gegner zurückhalten, statt immer sofort zu feuern; bei unmittelbarer Gefahr darf sie früher schießen. Kein garantierter Treffer. | 🧭 |
| `SOJ-COMBAT-004` | **Breitseiten und Verfolgung** | Schiffe mit schweren Seitenwaffen versuchen, diese dem Gegner zuzuwenden. Zur Verfolgung eines fliehenden Schiffs müssen sie gegebenenfalls drehen und verlieren dabei Zeit oder Schusswinkel. Keine grundlosen Rückzugsmanöver beim Angriff. | 🧭 |
| `SOJ-COMBAT-005` | **Crew beeinflusst den Raumkampf** | Steuermann: Wendegeschwindigkeit. Techniker: Beschleunigung und Geschwindigkeit. Waffenoffizier: Nachladezeit und Treffergenauigkeit. Kampfstratege: Qualität der taktischen KI-Entscheidungen. Einfluss einzelner Werte **bis etwa 30 %** als Zielgröße. | 🧭 |
| `SOJ-COMBAT-006` | **Individuelle Schiffswerft-Anpassungen** | Unterschiedliche Grundwerte je Schiffstyp. In der Werft Werte wie Höchstgeschwindigkeit, Beschleunigung, Wendegeschwindigkeit und Hüllenstärke pro Wert um **bis zu ±15 %** anpassen, um unterschiedliche Schiffsbauten desselben Modells zu ermöglichen. | 🧭 |
| `SOJ-COMBAT-007` | **Seismische Bombe / vierter Minentyp** | Zeitverzögert detonierende Mine nach dem Vorbild der Slave-One-Seismikladung: scharfer, kreisförmiger Energiering. Er beeinflusst Asteroiden; bewegte oder zerbrochene Brocken können weitere Kollisionen und Kettenreaktionen auslösen. | 🧭 |
| `SOJ-COMBAT-008` | **Zeitverzerrungsbombe** | Mächtige Flächenexplosion; das eigene Schiff ist während der Detonation durch eine kurze **zeitliche Entkopplung** nicht im normalen Zeitablauf und entgeht so der Explosion. Nicht bloß eine Bombe, von der es wegfliegt. | 🧭 |
| `SOJ-COMBAT-009` | **Traktorstrahl als Kampfwerkzeug** | Asteroiden ziehen, ablenken oder abstoßen, um Gegner mit Brocken zu treffen; mögliche Nutzung zum Manövrieren um große Objekte. | 🧭 |
| `SOJ-COMBAT-010` | **Physikgetragener Taktikkampf** | Beschleunigung, Trägheit, Höchstgeschwindigkeit, Wendegeschwindigkeit, Waffenreichweite und tatsächliche Schusswinkel bestimmen, welche der beiden KIs ihre Kampfposition durchsetzen kann. Die Ausrüstung prägt den Kampfstil, ohne manuelle Steuerung jedes Schusses. | 🧭 |

## Noch nicht entschieden

- **Waffen:** Exakte Reichweiten, Cooldowns, Schaden, Schusskegel und welche bestehenden Waffen konkret seitlich bzw. rundum montiert werden können.
- **Crew:** Exakte Bonuskurven und Zusammenwirken mit Schiffswerft-Anpassungen; ein möglicher direkter Schadensbonus für den Kampfstrategen ist **nicht beschlossen**.
- **Schiffswerft:** Welche Werte tatsächlich veränderbar sind, ob jede Steigerung eine Senkung an anderer Stelle erfordert, und ob Anpassungen Kosten verursachen.
- **Spezialbomben und Traktorstrahl:** Reichweiten, Zünder, Interaktionen mit Asteroiden, Wirksamkeit und Balance.

**Verbindliche Trennung:** Diese Liste ist eine **Ideen-/Konzeptmatrix**, keine Beschreibung bereits abgeschlossener Features. Umsetzung und Merge ausschließlich nach ausdrücklichem Auftrag.

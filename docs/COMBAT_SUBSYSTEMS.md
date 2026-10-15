# Raumkampf: Strategie und anvisierbare Subsysteme

Die Raumkampf-AI auf beiden Seiten entscheidet weiter alle **8 Sekunden**, mit einem Versatz von **4 Sekunden**. Neue Pläne ersetzen bestehende nur bei ausreichendem strategischem Vorteil. Kurskorrektur, Schadensereignisse und Feuerleitung laufen zwischen den Reviews kontinuierlich.

## Ziele und Lebenspunkte

- **Hülle**: Standardziel aus allen Richtungen. Sobald die Hüllen-HP auf 0 fallen, endet der Kampf mit einer Niederlage.
- **Haupttriebwerk**: Besitzt anfangs gleich viele HP wie die Hülle, kann aber **nur von der Seite oder aus dem Hecksektor** getroffen werden. Ein Schiff ohne intakten Hauptantrieb kann weder vorwärts noch rückwärts beschleunigen, behält aber seine bisherige Trägheit und kann mit **RCS weiterhin rotieren**. Haupttriebwerks-VFX entfallen.
- **Traktorstrahl**: Besitzt bei Schiffen mit Traktormodul anfangs gleich viele HP wie die Hülle, kann aus allen Richtungen getroffen werden. Ein zerstörter Traktorstrahl kann weder halten noch eine Enterseil-Winde unterstützen. Ohne Traktormodul startet dieser Status bei 0.
- **Schild**: Schützt alle darunterliegenden Komponenten. Solange Schild-HP übrig sind, wird weder Hülle noch eine anvisierte Komponente direkt beschädigt.

Für direkte Beschädigung einer Komponente wird deren eigener HP-Pool reduziert, nicht gleichzeitig die Hülle. Ein bereits ausgefallenes Ziel führt zu Hüllenschaden als Rückfallziel.

## Flucht und Interdiktion

Wenn das Gegnerschiff flieht und noch einen intakten Hauptantrieb besitzt, ist dessen Antrieb das priorisierte Ziel. Solange kein gültiger Seiten-/Heckwinkel besteht, bleibt ein gültiger Hüllenschuss möglich; die fehlende Antriebssicht blockiert nicht die gesamte Feuerleitung. Bei Geschossen und Raketen zählt die Trefferseite auch am tatsächlichen Einschlag. Ein intakter Traktor kann einen schildlosen fliehenden Gegner auf Reichweite festhalten; ein fliehendes Schiff kann bei naher Verfolgung Verteidigungsminen abwerfen.

## Hardpoints und Reichweiten

Die Strategie bewertet eingebaute Waffen und ihre tatsächlichen Montagepositionen getrennt nach Front, Backbord, Steuerbord und Rundumturm. Sie berücksichtigt Schaden gegen die aktuelle Schild- oder Hüllenschicht, Nachladezeit, Reichweite, Wendigkeit und Geschwindigkeit. Die Steuerung richtet das Schiff entsprechend der gewählten Seite aus. Die vorher festgelegten, JSON-gesteuerten Zulassungsregeln für Hardpoints bleiben verbindlich.

Die HP-Pools sind zunächst gleich groß, damit sich die Mechanik ohne zusätzliche Balancefaktoren testen lässt. Präzisere Trefferzonen, Reparatur, spezielle Verwundbarkeiten und Crew-Fähigkeiten sind mögliche Folgeschritte.

Die Zuständigkeiten der Flugsteuerung und die Langzeitsimulationen sind in `COMBAT_FLIGHT_ARCHITECTURE.md` beschrieben.

# Waffenhardpoints – JSON als verbindliche Konfiguration

Der Hardpoint-Editor wird mit `npm run hardpoints:edit` geöffnet. Für jedes Schiffsmodell gibt es eine eigene Datei unter `src/data/ships/<schiff-id>.hardpoints.json`.

## Bearbeitung

Im Editor das Schiff und **Waffen-Slots** auswählen. Ein Slot kann auf dem Sprite verschoben werden. Rechts lassen sich ID, Position, Mündungsbreite, Render-Layer, **Schussrichtung** (Bug, Backbord, Steuerbord), maximaler **Feuerwinkel** (1–360°) sowie **zulässige Waffen-Montageklassen und Waffenfamilien** bearbeiten. Der gezeichnete Sektor zeigt den eingestellten Slot-Winkel.

Die Montageklasse der Waffe (Front, Breitseite, Rundumturm oder Lenkwaffe) stammt aus dem Komponenten-Katalog. Ein Slot kann mehrere Klassen erlauben, aber keine nicht freigegebene Klasse aufnehmen. Der tatsächlich nutzbare Winkel ist das Minimum aus dem Waffenprofil und der Slot-Begrenzung. Die Grundausrichtung des Slots ist nur für Winkel **unter 360°** für die Zielabdeckung entscheidend.

**Anzeigebezeichnungen (Duell, Kampagne und Editor):** Bugwaffe (60°), Backbordwaffe (90°), Steuerbordwaffe (90°), Geschützturm (360° Feuerwinkel) und, wo vorhanden, Lenkwaffenwerfer (360° Zielerfassung). Die Anzeige leitet die Funktion aus `allowedMounts` und den Winkel aus `arcDegrees` ab. `facing: "forward"` bleibt für Geschützturm und Lenkwaffenwerfer als technische Grundausrichtung erhalten; es bedeutet bei 360° **keine reine Bugwaffe**. Die Anzeige ändert weder Einbaubeschränkungen noch die Kampfgeometrie.

Beispiel eines Eintrags:

```json
{
  "id": "port-cannon-01",
  "slotIndex": 0,
  "x": 140,
  "y": 45,
  "width": 6,
  "layer": "above",
  "facing": "port",
  "arcDegrees": 90,
  "allowedMounts": ["broadside"],
  "allowedFamilies": ["autocannon", "ion_cannon"]
}
```

Die neue Standardbelegung aller 28 Modelle besitzt sechs Slots: Bug 0 und 5 (Railgun oder Front Repeater), Backbord 1, Steuerbord 2 und Universal 3 und 4. Beide Universalplätze erlauben unabhängig voneinander Turmwaffen (Pulse/Ion Laser) oder Lenkwaffen (Guided/HE Missile), bei 360° Zielabdeckung. Die bisherigen Slots 0 bis 4 behalten ihre Indizes; Slot 5 ergänzt die zweite Bugwaffe. Das verhindert eine Verschiebung bestehender Ausrüstungslisten.

Die Slot-Reihenfolge legt den Index im Ausrüstungsbildschirm fest. **Anzahl und Platzierung der `weaponMounts` in der JSON bestimmen die verfügbaren Waffenplätze**; es werden keine zusätzlichen Slots automatisch erzeugt. Das gilt für Spieler und NPCs.

## Werft und Gefecht

Der Werftmarkt für das gerade aktive Schiff bietet nur Waffen an, die in mindestens einen Slot passen. Beim tatsächlichen Einbau erfolgt nochmals eine einzelne Slotprüfung. Bereits im Inventar vorhandene inkompatible Waffen können nicht in einen unpassenden Slot eingebaut werden. Im Raumkampf wird die Position vom Schiffspivot in Weltkoordinaten umgesetzt; bei jeder Schussabgabe gelten Montage, Richtung, maximaler Winkel und Waffenreichweite.

**Abwärtskompatibilität:** Bereits vorhandene Schiffsdateien haben `weaponMounts`, aber noch keine `allowedMounts` und keine `arcDegrees`. Ohne diese optionalen Angaben (`allowedMounts`, `allowedFamilies` und `arcDegrees`) bleiben bisherige Waffentypen vorerst zulässig, und nur der Waffenprofilwinkel begrenzt das Feuer. Erst das Bearbeiten und Speichern einer Slot-Konfiguration aktiviert die individuelle Einschränkung. So können die 28 Schiffvarianten nacheinander kalibriert werden, ohne ihre bestehende Ausrüstung sofort unbrauchbar zu machen.

Die nachträgliche Bearbeitung eines Schiffsmodells beeinflusst alle Schiffe dieses Modells, weil das JSON zum Modell gehört, nicht zum einzelnen Besitzstand.

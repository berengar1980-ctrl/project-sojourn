# Waffenhardpoints – JSON als verbindliche Konfiguration

Der Hardpoint-Editor wird mit `npm run hardpoints:edit` geöffnet. Für jedes Schiffsmodell gibt es eine eigene Datei unter `src/data/ships/<schiff-id>.hardpoints.json`.

## Bearbeitung

Im Editor das Schiff und **Waffen-Slots** auswählen. Ein Slot kann auf dem Sprite verschoben werden. Rechts lassen sich ID, Position, Mündungsbreite, Render-Layer, **Schussrichtung** (Bug, Backbord, Steuerbord), maximaler **Feuerwinkel** (1–360°) sowie **zulässige Waffen-Montageklassen und Waffenfamilien** bearbeiten. Der gezeichnete Sektor zeigt den eingestellten Slot-Winkel.

Die Montageklasse der Waffe (Front, Breitseite, Rundumturm oder Lenkwaffe) stammt aus dem Komponenten-Katalog. Ein Slot kann mehrere Klassen erlauben, aber keine nicht freigegebene Klasse aufnehmen. Der tatsächlich nutzbare Winkel ist das Minimum aus dem Waffenprofil und der Slot-Begrenzung. Die Schussrichtung des Slots gilt für **alle** Waffenklassen.

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

Die Slot-Reihenfolge legt den Index im Ausrüstungsbildschirm fest. **Anzahl und Platzierung der `weaponMounts` in der JSON bestimmen die verfügbaren Waffenplätze**; es werden keine zusätzlichen Slots automatisch erzeugt. Das gilt für Spieler und NPCs.

## Werft und Gefecht

Der Werftmarkt für das gerade aktive Schiff bietet nur Waffen an, die in mindestens einen Slot passen. Beim tatsächlichen Einbau erfolgt nochmals eine einzelne Slotprüfung. Bereits im Inventar vorhandene inkompatible Waffen können nicht in einen unpassenden Slot eingebaut werden. Im Raumkampf wird die Position vom Schiffspivot in Weltkoordinaten umgesetzt; bei jeder Schussabgabe gelten Montage, Richtung, maximaler Winkel und Waffenreichweite.

**Abwärtskompatibilität:** Bereits vorhandene Schiffsdateien haben `weaponMounts`, aber noch keine `allowedMounts` und keine `arcDegrees`. Ohne diese optionalen Angaben (`allowedMounts`, `allowedFamilies` und `arcDegrees`) bleiben bisherige Waffentypen vorerst zulässig, und nur der Waffenprofilwinkel begrenzt das Feuer. Erst das Bearbeiten und Speichern einer Slot-Konfiguration aktiviert die individuelle Einschränkung. So können die 28 Schiffvarianten nacheinander kalibriert werden, ohne ihre bestehende Ausrüstung sofort unbrauchbar zu machen.

Die nachträgliche Bearbeitung eines Schiffsmodells beeinflusst alle Schiffe dieses Modells, weil das JSON zum Modell gehört, nicht zum einzelnen Besitzstand.

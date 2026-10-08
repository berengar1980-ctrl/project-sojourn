import type {
  SalvageComponentCandidate,
  SalvageField,
  SalvageWreck,
  SectorSalvageEvent,
} from '../../core/salvage-types';
import type { ShipComponentType } from '../../core/ship-types';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { createSpecialSalvageComponentId, getShipComponent } from '../ships/ship-component-service';

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomFrom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function componentType(event: SectorSalvageEvent, random: () => number): ShipComponentType {
  if (event.wreckKind === 'miner') return random() < 0.72 ? 'mining' : 'engine';
  if (event.wreckKind === 'salvager') return random() < 0.72 ? 'salvage' : 'sensor';
  if (event.wreckKind === 'patrol') return random() < 0.62 ? 'weapon' : 'shield';
  return random() < 0.65 ? 'engine' : 'sensor';
}

export function sectorSalvageEventComponent(
  event: SectorSalvageEvent
): SalvageComponentCandidate | null {
  if (!event.specialComponent && !event.salvageRights) return null;
  const random = randomFrom(event.fieldSeed ^ hash(event.id));
  const type = componentType(event, random);
  const tier = Math.max(1, Math.min(6, 1 + Math.floor(random() * 3)));
  const bases = (SHIP_COMPONENT_CATALOG[type] ?? [])
    .filter((component) => component.tier <= tier && !component.baseId)
    .sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  const base = bases[bases.length - 1];
  if (!base) return null;

  let componentId = base.id;
  if (event.specialComponent) {
    const damage = type === 'weapon' && random() < 0.42;
    const modifier = damage ? 'damage' : 'efficiency';
    const pct = damage ? 3 + Math.floor(random() * 8) : 5 + Math.floor(random() * 11);
    componentId = createSpecialSalvageComponentId(type, base.id, modifier, pct) ?? base.id;
  }
  const definition = getShipComponent(type, componentId) ?? base;
  return {
    type,
    componentId,
    recoveryDifficulty: event.specialComponent
      ? 72 + definition.tier * 5
      : 48 + definition.tier * 7,
    cargoTons: 8 + definition.tier * 4,
  };
}

export function generateSectorSalvageEventField(event: SectorSalvageEvent): SalvageField {
  const random = randomFrom(event.fieldSeed);
  const width = 3200;
  const height = 1900;
  const component = sectorSalvageEventComponent(event);
  const quality = event.specialComponent ? 3 : event.salvageRights ? 2 : 1;
  const wreck: SalvageWreck = {
    id: `event-wreck-${event.id}`,
    name:
      event.type === 'distress-rescue'
        ? 'Havarist'
        : event.specialComponent
          ? 'Seltenes Bergungswrack'
          : 'Wrack',
    kind: event.wreckKind,
    quality,
    position: { x: width * 0.55, y: height * 0.5 },
    radius: 58 + random() * 24,
    rotation: random() * Math.PI * 2,
    integrity: Math.round(48 + random() * 42),
    resources:
      event.type === 'distress-rescue' && !event.salvageRights
        ? []
        : [
            {
              resourceId: 'ship-parts',
              initialAmount: 12 + quality * 5,
              remainingAmount: 12 + quality * 5,
            },
            {
              resourceId: 'electronics',
              initialAmount: 7 + quality * 4,
              remainingAmount: 7 + quality * 4,
            },
          ],
    component,
    componentStatus: component ? 'available' : 'none',
    inspected: event.type === 'distress-rescue',
  };
  return {
    id: `sector-event-field-${event.id}`,
    sourceLocationId: event.id,
    seed: event.fieldSeed,
    width,
    height,
    wrecks: [wreck],
  };
}

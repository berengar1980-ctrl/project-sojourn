import { getShipsByRole } from '../ships';
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
  const choices: Record<SalvageWreck['kind'], readonly ShipComponentType[]> = {
    miner: ['mining', 'mining', 'engine', 'cargo', 'reactor', 'sensor'],
    salvager: ['salvage', 'salvage', 'sensor', 'cargo', 'hull', 'reactor'],
    patrol: ['weapon', 'weapon', 'mine', 'shield', 'hull', 'reactor'],
    freighter: ['cargo', 'cargo', 'engine', 'shield', 'sensor', 'hull'],
  };
  const types = choices[event.wreckKind];
  return types[Math.floor(random() * types.length)] ?? 'engine';
}

export function sectorSalvageEventComponent(
  event: SectorSalvageEvent
): SalvageComponentCandidate | null {
  if (!event.specialComponent && !event.salvageRights) return null;
  const random = randomFrom(event.fieldSeed ^ hash(event.id));
  const type = componentType(event, random);
  const tier = 1 + Math.floor(random() * 6);
  const bases = (SHIP_COMPONENT_CATALOG[type] ?? []).filter(
    (component) => component.tier === tier && !component.baseId
  );
  const base = bases[Math.floor(random() * bases.length)];
  if (!base) return null;

  let componentId = base.id;
  // A component may have no bonus; otherwise it has one 1–25% modifier.
  if (random() < 0.5) {
    const modifier = random() < 0.5 && base.power > 0 ? 'efficiency' : 'performance';
    const pct = 1 + Math.floor(random() * 25);
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
  const role =
    event.wreckKind === 'salvager'
      ? 'salvage'
      : event.wreckKind === 'miner'
        ? 'mining'
        : event.wreckKind === 'patrol'
          ? 'patrol'
          : 'freighter';
  const candidates = getShipsByRole(role);
  const ship = candidates[(event.fieldSeed >>> 0) % candidates.length];
  const distressRadius = (ship?.nominalLengthMeters ?? 80) * 0.38;
  const wreck: SalvageWreck = {
    id: `event-wreck-${event.id}`,
    name:
      event.type === 'distress-rescue'
        ? 'Havarist'
        : event.specialComponent
          ? 'Seltener Frachtcontainer'
          : 'Bergungscontainer',
    kind: event.wreckKind,
    quality,
    position: { x: width * 0.55, y: height * 0.5 },
    radius: event.type === 'distress-rescue' ? distressRadius : 58 + random() * 24,
    rotation: random() * Math.PI * 2,
    ...(event.type !== 'distress-rescue'
      ? {
          containerVariant: (['standard', 'damaged', 'tank'] as const)[
            Math.floor(random() * 3)
          ],
          driftVelocity: { x: 2.6, y: -1.4 },
          rotation3d: { x: 0.22, y: 0.3, z: random() * Math.PI * 2 },
          spin3d: { x: 0.08, y: 0.06, z: 0.04 },
        }
      : {}),
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

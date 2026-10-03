import type { ShipDefinition, ShipRole } from '../../core/ship-types';
import { miningShips } from '../../data/ships/mining-ships';

const definitions: readonly ShipDefinition[] = [...miningShips];

export function getShipDefinition(id: string): ShipDefinition | null {
  return definitions.find((definition) => definition.id === id) ?? null;
}

export function getShipsByRole(role: ShipRole): readonly ShipDefinition[] {
  return definitions.filter((definition) => definition.role === role);
}

export function getAllShipDefinitions(): readonly ShipDefinition[] {
  return definitions;
}

import type { ResolvedShipGameplayStats, ShipDefinition, ShipRole } from '../../core/ship-types';
import { freighterVariantShips } from '../../data/ships/freighter-variant-ships';
import { minerVariantShips } from '../../data/ships/miner-variant-ships';
import { patrolVariantShips } from '../../data/ships/patrol-variant-ships';
import { salvageVariantShips } from '../../data/ships/salvage-variant-ships';
import { resolveShipGameplayStats } from './ship-stats';

const definitions: readonly ShipDefinition[] = [
  ...patrolVariantShips,
  ...minerVariantShips,
  ...salvageVariantShips,
  ...freighterVariantShips,
];

export function getShipDefinition(id: string): ShipDefinition | null {
  return definitions.find((definition) => definition.id === id) ?? null;
}

export function getShipGameplayStats(id: string): ResolvedShipGameplayStats | null {
  const definition = getShipDefinition(id);
  return definition ? resolveShipGameplayStats(definition) : null;
}

export function getShipsByRole(role: ShipRole): readonly ShipDefinition[] {
  return definitions.filter((definition) => definition.role === role);
}

export function getAllShipDefinitions(): readonly ShipDefinition[] {
  return definitions;
}

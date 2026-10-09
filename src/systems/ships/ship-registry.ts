import type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipHardpoint,
  ShipHardpoints,
  ShipRole,
} from '../../core/ship-types';
import { freighterVariantShips } from '../../data/ships/freighter-variant-ships';
import { minerVariantShips } from '../../data/ships/miner-variant-ships';
import { patrolVariantShips } from '../../data/ships/patrol-variant-ships';
import { salvageVariantShips } from '../../data/ships/salvage-variant-ships';
import { resolveShipGameplayStats } from './ship-stats';

function ensureUtilityHardpoints(definition: ShipDefinition): ShipDefinition {
  const points: ShipHardpoints = definition.sprite.hardpoints;
  const mount: ShipHardpoint = {
    id: 'utility-grapple',
    x: Math.max(0, Math.min(points.sourceWidth, points.pivot.x + points.sourceWidth * 0.24)),
    y: points.pivot.y,
    width: 3,
    layer: 'above',
  };
  const grappleMount: ShipHardpoint = {
    ...mount,
    id: 'utility-grapple',
    x: Math.max(0, Math.min(points.sourceWidth, points.pivot.x - points.sourceWidth * 0.24)),
  };
  return {
    ...definition,
    sprite: {
      ...definition.sprite,
      hardpoints: {
        ...points,
        tractorBeams: points.tractorBeams?.length
          ? points.tractorBeams
          : [{ ...mount, id: 'utility-tractor' }],
        grapplingHooks: points.grapplingHooks?.length ? points.grapplingHooks : [grappleMount],
      },
    },
  };
}

const definitions: readonly ShipDefinition[] = [
  ...patrolVariantShips,
  ...minerVariantShips,
  ...salvageVariantShips,
  ...freighterVariantShips,
].map(ensureUtilityHardpoints);

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

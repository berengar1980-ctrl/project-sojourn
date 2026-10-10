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
    layer: 'below',
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
        weaponMounts: points.weaponMounts?.length
          ? points.weaponMounts
          : Array.from(
              { length: definition.role === 'patrol' ? 3 : definition.role === 'freighter' ? 2 : 1 },
              (_, index) => ({
                id: 'weapon-slot-' + (index + 1),
                slotIndex: index,
                x: Math.round(points.sourceWidth * (index === 2 ? 0.83 : 0.62)),
                y: Math.round(points.sourceHeight * (index === 0 ? 0.26 : index === 1 ? 0.74 : 0.5)),
                width: 6,
                facing: (index === 0 ? 'port' : index === 1 ? 'starboard' : 'forward') as
                  'port' | 'starboard' | 'forward',
                layer: 'above' as const,
              })
            ),
        grapplingHooks: points.grapplingHooks?.length
          ? points.grapplingHooks.map((point) => ({ ...point, layer: 'below' as const }))
          : [grappleMount],
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

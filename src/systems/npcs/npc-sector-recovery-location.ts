import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { nearestLocation } from './npc-sector-routing';

/** Select a safe recovery berth, preferring shipyards for civilian casualties. */
export function npcRecoveryLocation(
  world: WorldMap,
  npc: SectorNpcState,
  position: WorldPoint
): string | null {
  if (npc.pirate) {
    const homeId = npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
    if (world.locations.some((location) => location.id === homeId)) return homeId;
  }

  const candidates = world.locations
    .filter(
      (location) =>
        location.activities.shipyard || location.activities.dock || location.activities.refuel
    )
    .map((location) => ({
      id: location.id,
      priority: location.activities.shipyard ? 0 : location.activities.dock ? 1 : 2,
      distance: Math.hypot(location.position.x - position.x, location.position.y - position.y),
    }))
    .sort(
      (first, second) => first.priority - second.priority || first.distance - second.distance
    );
  return candidates[0]?.id ?? nearestLocation(world, position);
}

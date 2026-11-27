import type { DistressActionResult, SectorSalvageEvent } from '../../core/salvage-types';
import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';

export { createXorshiftRandom as randomFrom } from '../../core/seeded-random';

export function clampPoint(world: WorldMap, point: WorldPoint): WorldPoint {
  return {
    x: Math.max(180, Math.min(world.width - 180, point.x)),
    y: Math.max(180, Math.min(world.height - 180, point.y)),
  };
}

export function eventPosition(
  world: WorldMap,
  origin: WorldPoint,
  random: () => number
): WorldPoint {
  const angle = random() * Math.PI * 2;
  const distance = 520 + random() * 980;
  return clampPoint(world, {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  });
}

export function cloneEvent(event: SectorSalvageEvent): SectorSalvageEvent {
  return { ...event, position: { ...event.position } };
}

export function nearestTowFacility(
  world: WorldMap,
  event: SectorSalvageEvent
): WorldLocation | null {
  return (
    world.locations
      .filter(
        (location) =>
          location.activities.shipyard || location.activities.dock || location.activities.refuel
      )
      .map((location) => ({
        location,
        distance: Math.hypot(
          location.position.x - event.position.x,
          location.position.y - event.position.y
        ),
      }))
      .sort((first, second) => first.distance - second.distance)[0]?.location ?? null
  );
}

export function emptyResult(text: string, success = false): DistressActionResult {
  return {
    success,
    text,
    boardingRequired: false,
    salvageRights: false,
    rewardCredits: 0,
    towDestinationId: null,
    workHours: 0,
  };
}

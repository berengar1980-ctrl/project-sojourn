import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';

export interface RoutePlan {
  readonly fromId: string;
  readonly toId: string;
  readonly points: readonly WorldPoint[];
  readonly distance: number;
  readonly dangerLevel: 0 | 1 | 2 | 3;
}

function findLocation(world: WorldMap, id: string): WorldLocation {
  const location = world.locations.find((candidate) => candidate.id === id);
  if (!location) {
    throw new Error(`Unknown world location: ${id}`);
  }
  return location;
}

function distanceBetween(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function planRoute(world: WorldMap, fromId: string, toId: string): RoutePlan {
  const from = findLocation(world, fromId);
  const to = findLocation(world, toId);

  return {
    fromId,
    toId,
    points: [from.position, to.position],
    distance: distanceBetween(from.position, to.position),
    dangerLevel: Math.max(from.dangerLevel, to.dangerLevel) as 0 | 1 | 2 | 3,
  };
}

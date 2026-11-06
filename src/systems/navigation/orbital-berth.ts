import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';

function safeRadius(location: WorldLocation): number {
  return Number.isFinite(location.radius) ? Math.max(0, location.radius) : 0;
}

/** Compact world-space traffic lane, shared by player and civilian NPC ships. */
export function orbitalLaneRadius(location: WorldLocation): number {
  const radius = safeRadius(location);
  if (location.kind === 'asteroid-field') return Math.max(34, radius * 0.45 + 16);
  if (location.kind === 'wreck') return Math.max(24, radius + 13);
  if (location.kind === 'station') return Math.max(34, radius + 18);
  if (location.kind === 'moon') return Math.max(31, radius + 18);
  return Math.max(48, radius + 24);
}

function clearance(world: WorldMap, locationId: string, point: WorldPoint): number {
  let gap = Math.min(point.x, point.y, world.width - point.x, world.height - point.y);
  if (world.star) {
    gap = Math.min(
      gap,
      Math.hypot(point.x - world.star.position.x, point.y - world.star.position.y) -
        world.star.radius -
        10
    );
  }
  for (const neighbor of world.locations) {
    if (neighbor.id === locationId) continue;
    gap = Math.min(
      gap,
      Math.hypot(point.x - neighbor.position.x, point.y - neighbor.position.y) -
        safeRadius(neighbor) -
        12
    );
  }
  return gap;
}

/** The player starts and docks beside a planet/station, never at its centre. */
export function navigationOrbitalBerth(world: WorldMap, locationId: string): WorldPoint {
  const location = world.locations.find((entry) => entry.id === locationId);
  if (!location) throw new Error('Unknown navigation location: ' + locationId);
  if (!Number.isFinite(location.radius)) return { ...location.position };
  const radius = orbitalLaneRadius(location);
  let best = { ...location.position };
  let bestClearance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < 16; index += 1) {
    const angle = (index * Math.PI) / 8 - Math.PI / 3;
    const point = {
      x: location.position.x + Math.cos(angle) * radius,
      y: location.position.y + Math.sin(angle) * radius,
    };
    const distance = clearance(world, locationId, point);
    if (distance > bestClearance) {
      best = point;
      bestClearance = distance;
    }
    if (distance > 28) break;
  }
  return best;
}

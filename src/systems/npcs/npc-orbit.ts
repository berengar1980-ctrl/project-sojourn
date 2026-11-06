import type { NpcOrbitState, SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint, WorldLocation } from '../../core/world-types';
import { orbitalLaneRadius } from '../navigation/orbital-berth';
import { hashId } from './npc-sector-routing';

const FULL_CIRCLE = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ANGLE_OFFSETS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI];
const LANE_OFFSETS = [0, 14, 28, 42];
const berthCache = new WeakMap<WorldMap, Map<string, NpcOrbitState>>();

function position(center: WorldPoint, radius: number, angle: number): WorldPoint {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function clearance(
  world: WorldMap,
  location: WorldLocation,
  point: WorldPoint,
  assigned: readonly WorldPoint[]
): number {
  let gap = Math.min(point.x, point.y, world.width - point.x, world.height - point.y);
  if (world.star) {
    gap = Math.min(
      gap,
      Math.hypot(point.x - world.star.position.x, point.y - world.star.position.y) -
        world.star.radius -
        10
    );
  }
  for (const other of world.locations) {
    if (other.id === location.id) continue;
    gap = Math.min(
      gap,
      Math.hypot(point.x - other.position.x, point.y - other.position.y) -
        (Number.isFinite(other.radius) ? other.radius : 0) -
        12
    );
  }
  for (const other of assigned) {
    gap = Math.min(gap, Math.hypot(point.x - other.x, point.y - other.y) - 18);
  }
  return gap;
}

function storedBerths(world: WorldMap): Map<string, NpcOrbitState> {
  let existing = berthCache.get(world);
  if (!existing) {
    existing = new Map();
    berthCache.set(world, existing);
  }
  return existing;
}

function buildBerth(
  world: WorldMap,
  location: WorldLocation,
  npcId: string,
  assigned: readonly WorldPoint[]
): NpcOrbitState {
  const radius = orbitalLaneRadius(location);
  const startingAngle =
    ((hashId(location.id + ':traffic') % 10000) / 10000) * FULL_CIRCLE +
    (hashId(npcId) % 99) * GOLDEN_ANGLE;
  let bestAngle = startingAngle;
  let bestRadius = radius;
  let bestGap = Number.NEGATIVE_INFINITY;
  for (const radial of LANE_OFFSETS) {
    for (const offset of ANGLE_OFFSETS) {
      const candidateRadius = radius + radial;
      const candidateAngle = startingAngle + offset;
      const gap = clearance(
        world,
        location,
        position(location.position, candidateRadius, candidateAngle),
        assigned
      );
      if (gap > bestGap) {
        bestGap = gap;
        bestAngle = candidateAngle;
        bestRadius = candidateRadius;
      }
      if (gap >= 18) {
        return {
          locationId: location.id,
          center: { ...location.position },
          radius: candidateRadius,
          angleRadians: candidateAngle,
          anchorAngleRadians: candidateAngle,
          driftSeconds: 0,
        };
      }
    }
  }
  return {
    locationId: location.id,
    center: { ...location.position },
    radius: bestRadius,
    angleRadians: bestAngle,
    anchorAngleRadians: bestAngle,
    driftSeconds: 0,
  };
}

/**
 * Reserve berths only for ships genuinely stationed at a location.
 * The earlier implementation reserved all 33 ships at every planet, forcing
 * most ships into implausibly distant, otherwise empty parking lanes.
 */
export function prepareNpcOrbitBerths(world: WorldMap, npcs: readonly SectorNpcState[]): void {
  berthCache.set(world, new Map());
  for (const npc of [...npcs].sort((a, b) => a.id.localeCompare(b.id))) {
    npc.orbit = npcOrbitStateFor(world, npc, npc.locationId);
  }
}

export function npcOrbitStateFor(
  world: WorldMap,
  npc: SectorNpcState,
  locationId: string
): NpcOrbitState {
  const location = world.locations.find((entry) => entry.id === locationId);
  if (!location) {
    return {
      locationId,
      center: npc.orbit?.center ?? { x: 0, y: 0 },
      radius: 0,
      angleRadians: 0,
    };
  }
  if (!Number.isFinite(location.radius)) {
    return {
      locationId,
      center: { ...location.position },
      radius: 0,
      angleRadians: 0,
    };
  }

  const cache = storedBerths(world);
  const key = locationId + ':' + npc.id;
  const cached = cache.get(key);
  if (cached) return { ...cached };
  const assigned = [...cache.values()]
    .filter((entry) => entry.locationId === locationId)
    .map((entry) => position(entry.center, entry.radius, entry.anchorAngleRadians ?? 0));
  const berth = buildBerth(world, location, npc.id, assigned);
  cache.set(key, berth);
  return { ...berth };
}

export function npcOrbitPosition(world: WorldMap, npc: SectorNpcState): WorldPoint {
  if (!npc.orbit || npc.orbit.locationId !== npc.locationId) {
    npc.orbit = npcOrbitStateFor(world, npc, npc.locationId);
  }
  const orbit = npc.orbit;
  return {
    x: Math.max(0, Math.min(world.width, orbit.center.x + orbit.radius * Math.cos(orbit.angleRadians))),
    y: Math.max(0, Math.min(world.height, orbit.center.y + orbit.radius * Math.sin(orbit.angleRadians))),
  };
}

export function npcOrbitDestination(
  world: WorldMap,
  npc: SectorNpcState,
  locationId: string
): WorldPoint {
  if (locationId === npc.locationId) return npcOrbitPosition(world, npc);
  const berth = npcOrbitStateFor(world, npc, locationId);
  return position(berth.center, berth.radius, berth.angleRadians);
}

export function npcOrbitHeading(world: WorldMap, npc: SectorNpcState): number {
  npcOrbitPosition(world, npc);
  return (npc.orbit?.angleRadians ?? 0) + Math.PI * 0.5;
}

export function advanceNpcOrbit(world: WorldMap, npc: SectorNpcState, seconds: number): void {
  npcOrbitPosition(world, npc);
  if (!npc.orbit || npc.orbit.radius <= 0 || seconds <= 0) return;
  const period = 220 + (hashId(npc.id + ':orbit-period') % 151);
  const elapsed = (npc.orbit.driftSeconds ?? 0) + seconds;
  const anchor = npc.orbit.anchorAngleRadians ?? npc.orbit.angleRadians;
  npc.orbit.driftSeconds = elapsed;
  npc.orbit.anchorAngleRadians = anchor;
  npc.orbit.angleRadians = anchor + Math.sin((elapsed / period) * FULL_CIRCLE) * 0.03;
}

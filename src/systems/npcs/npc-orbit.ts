import type { NpcOrbitState, SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint, WorldLocation } from '../../core/world-types';
import { hashId } from './npc-sector-routing';

const FULL_CIRCLE = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CLEARANCE = 72;
const RADIAL_OFFSETS = [0, 42, 84, 126, 168, 210];
const ANGLE_VARIANTS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.65, -1.65, 2.1, -2.1, Math.PI];
const berthCache = new WeakMap<WorldMap, Map<string, NpcOrbitState>>();

function orbitRadius(kind: string, bodyRadius: number, lane: number): number {
  if (kind === 'asteroid-field') return Math.max(84, bodyRadius * 0.55 + 36) + lane * 42;
  if (kind === 'wreck') return Math.max(70, bodyRadius + 30) + lane * 42;
  if (kind === 'station') return Math.max(82, bodyRadius + 44) + lane * 42;
  if (kind === 'moon') return Math.max(70, bodyRadius + 35) + lane * 42;
  return Math.max(90, bodyRadius + 52) + lane * 42;
}

function berthSlot(id: string): number {
  const civilian = /^npc-(\d+)$/.exec(id);
  if (civilian) return Number(civilian[1]) - 1;
  const pirate = /^pirate-(\d+)$/.exec(id);
  if (pirate) return 24 + Number(pirate[1]) - 1;
  return hashId(id) % 67;
}

function standardId(slot: number): string | null {
  if (slot >= 0 && slot < 24) return 'npc-' + String(slot + 1).padStart(2, '0');
  if (slot >= 24 && slot < 33) return 'pirate-' + String(slot - 23).padStart(2, '0');
  return null;
}

function berthPoint(center: WorldPoint, radius: number, angle: number): WorldPoint {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

/** Clearance to other space bodies AND all already assigned ship holding slots. */
function berthClearance(
  world: WorldMap,
  ownerId: string,
  point: WorldPoint,
  assigned: readonly WorldPoint[]
): number {
  let clear = Math.min(
    point.x - 32,
    point.y - 32,
    world.width - point.x - 32,
    world.height - point.y - 32
  );
  const starDistance = Math.hypot(point.x - world.star.position.x, point.y - world.star.position.y);
  clear = Math.min(clear, starDistance - world.star.radius - 45);
  for (const body of world.locations) {
    if (body.id === ownerId) continue;
    const safety = Math.max(38, (Number.isFinite(body.radius) ? body.radius : 0) + 34);
    clear = Math.min(
      clear,
      Math.hypot(point.x - body.position.x, point.y - body.position.y) - safety
    );
  }
  for (const berth of assigned) {
    clear = Math.min(clear, Math.hypot(point.x - berth.x, point.y - berth.y) - 24);
  }
  return clear;
}

function makeBerth(
  world: WorldMap,
  location: WorldLocation,
  id: string,
  assigned: readonly WorldPoint[]
): NpcOrbitState {
  const slot = berthSlot(id);
  const baseRadius = orbitRadius(location.kind, location.radius, slot % 5);
  const phase = ((hashId(location.id + ':berth-phase') % 10000) / 10000) * FULL_CIRCLE;
  const startingAngle = phase + slot * GOLDEN_ANGLE;
  let chosenRadius = baseRadius;
  let chosenAngle = startingAngle;
  let bestClearance = Number.NEGATIVE_INFINITY;

  for (const radial of RADIAL_OFFSETS) {
    for (const offset of ANGLE_VARIANTS) {
      const radius = baseRadius + radial;
      const angle = startingAngle + offset;
      const clearance = berthClearance(
        world,
        location.id,
        berthPoint(location.position, radius, angle),
        assigned
      );
      if (clearance > bestClearance) {
        bestClearance = clearance;
        chosenAngle = angle;
        chosenRadius = radius;
      }
      if (clearance >= CLEARANCE) {
        return {
          locationId: location.id,
          center: { ...location.position },
          radius,
          angleRadians: angle,
          anchorAngleRadians: angle,
          driftSeconds: 0,
        };
      }
    }
  }

  return {
    locationId: location.id,
    center: { ...location.position },
    radius: chosenRadius,
    angleRadians: chosenAngle,
    anchorAngleRadians: chosenAngle,
    driftSeconds: 0,
  };
}

/** Slots are built in stable captain-ID order, independent of active traffic. */
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

  let cache = berthCache.get(world);
  if (!cache) {
    cache = new Map();
    berthCache.set(world, cache);
  }
  const key = locationId + ':' + npc.id;
  const cached = cache.get(key);
  if (cached) return { ...cached };

  const slot = berthSlot(npc.id);
  const canonical = standardId(slot) === npc.id;
  const assigned: WorldPoint[] = [];
  if (canonical) {
    for (let index = 0; index <= slot; index += 1) {
      const id = standardId(index);
      if (!id) continue;
      const nextKey = locationId + ':' + id;
      let berth = cache.get(nextKey);
      if (!berth) {
        berth = makeBerth(world, location, id, assigned);
        cache.set(nextKey, berth);
      }
      assigned.push(berthPoint(berth.center, berth.radius, berth.anchorAngleRadians ?? 0));
    }
    return { ...cache.get(key)! };
  }
  const berth = makeBerth(world, location, npc.id, assigned);
  cache.set(key, berth);
  return { ...berth };
}

function positionOf(world: WorldMap, orbit: NpcOrbitState): WorldPoint {
  return {
    x: Math.max(
      0,
      Math.min(world.width, orbit.center.x + orbit.radius * Math.cos(orbit.angleRadians))
    ),
    y: Math.max(
      0,
      Math.min(world.height, orbit.center.y + orbit.radius * Math.sin(orbit.angleRadians))
    ),
  };
}

export function npcOrbitPosition(world: WorldMap, npc: SectorNpcState): WorldPoint {
  if (!npc.orbit || npc.orbit.locationId !== npc.locationId) {
    npc.orbit = npcOrbitStateFor(world, npc, npc.locationId);
  }
  return positionOf(world, npc.orbit);
}

/** Destination berth is computed without touching a captain's current orbit. */
export function npcOrbitDestination(
  world: WorldMap,
  npc: SectorNpcState,
  locationId: string
): WorldPoint {
  if (locationId === npc.locationId) return npcOrbitPosition(world, npc);
  return positionOf(world, npcOrbitStateFor(world, npc, locationId));
}

function orbitDirection(npc: SectorNpcState): number {
  return hashId(npc.id + ':orbit-direction') % 2 === 0 ? 1 : -1;
}

export function npcOrbitHeading(world: WorldMap, npc: SectorNpcState): number {
  npcOrbitPosition(world, npc);
  return (npc.orbit?.angleRadians ?? 0) + orbitDirection(npc) * Math.PI * 0.5;
}

/** Limited orbital movement avoids crossing nearby moons, stations and berths. */
export function advanceNpcOrbit(world: WorldMap, npc: SectorNpcState, seconds: number): void {
  npcOrbitPosition(world, npc);
  if (!npc.orbit || npc.orbit.radius <= 0 || seconds <= 0) return;
  const period = 220 + (hashId(npc.id + ':orbit-period') % 151);
  const elapsed = (npc.orbit.driftSeconds ?? 0) + seconds;
  const anchor = npc.orbit.anchorAngleRadians ?? npc.orbit.angleRadians;
  npc.orbit.driftSeconds = elapsed;
  npc.orbit.anchorAngleRadians = anchor;
  npc.orbit.angleRadians =
    anchor + orbitDirection(npc) * Math.sin((elapsed / period) * FULL_CIRCLE) * 0.075;
}

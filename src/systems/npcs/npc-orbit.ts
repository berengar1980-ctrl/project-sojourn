import type { NpcOrbitState, SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { hashId } from './npc-sector-routing';

const FULL_CIRCLE = Math.PI * 2;

function orbitRadius(kind: string, bodyRadius: number, lane: number): number {
  if (kind === 'asteroid-field') return Math.max(22, bodyRadius * 0.3) + lane * 9;
  if (kind === 'wreck') return Math.max(20, bodyRadius * 0.8) + lane * 9;
  if (kind === 'station') return Math.max(29, bodyRadius + 18) + lane * 11;
  if (kind === 'moon') return Math.max(26, bodyRadius + 19) + lane * 9;
  return Math.max(54, bodyRadius + 31) + lane * 12;
}

/** Stable orbital berth for a particular captain at a particular world location. */
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
  const lane = hashId(npc.id + ':' + locationId + ':lane') % 4;
  return {
    locationId,
    center: { ...location.position },
    // Incomplete/synthetic locations have no meaningful body size: use their center.
    // Never let missing radius metadata create NaN travel and fuel quotations.
    radius: Number.isFinite(location.radius) ? orbitRadius(location.kind, location.radius, lane) : 0,
    angleRadians: ((hashId(npc.id + ':' + locationId + ':angle') % 10000) / 10000) * FULL_CIRCLE,
  };
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

/** Destination berth is computed without touching an NPC's current orbit. */
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

/** Only docked/working NPCs drift in their local orbital traffic lanes. */
export function advanceNpcOrbit(world: WorldMap, npc: SectorNpcState, seconds: number): void {
  npcOrbitPosition(world, npc);
  if (!npc.orbit || npc.orbit.radius <= 0 || seconds <= 0) return;
  const period = 200 + (hashId(npc.id + ':orbit-period') % 151);
  npc.orbit.angleRadians =
    (npc.orbit.angleRadians +
      (orbitDirection(npc) * FULL_CIRCLE * seconds) / period +
      FULL_CIRCLE) %
    FULL_CIRCLE;
}

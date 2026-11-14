import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';
import { cloneCareerJson } from './career-save-contract';

export interface CareerNpcCheckpoint {
  readonly version: 1;
  readonly worldId: string;
  readonly npcs: readonly SectorNpcState[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function number(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function position(value: unknown): boolean {
  return record(value) && number(value.x, -Infinity) && number(value.y, -Infinity);
}

function location(world: WorldMap, id: unknown): boolean {
  return typeof id === 'string' && world.locations.some((item) => item.id === id);
}

function cargo(value: unknown): boolean {
  return (
    record(value) &&
    Object.values(value).every((quantity) => number(quantity) && Number.isInteger(quantity))
  );
}

function travel(value: unknown, world: WorldMap): boolean {
  if (value === undefined) return true;
  if (!record(value) || !location(world, value.finalTargetId)) return false;
  if (!location(world, value.targetLocationId) || !Array.isArray(value.routePoints)) return false;
  if (value.routePoints.length < 2 || value.routePoints.length > 128) return false;
  if (!value.routePoints.every(position)) return false;
  if (!number(value.routeDistance) || !number(value.distanceTravelled)) return false;
  if (value.distanceTravelled > value.routeDistance || !number(value.fuelRequired)) return false;
  if (!['fast', 'balanced', 'safe'].includes(value.profile as string)) return false;
  if (!Array.isArray(value.refuelStops) || !value.refuelStops.every((id) => location(world, id))) {
    return false;
  }
  return true;
}

function movement(value: unknown, ids: ReadonlySet<string>): boolean {
  if (value === undefined) return true;
  if (!record(value) || !['pursue', 'flee', 'engaged'].includes(value.mode as string)) {
    return false;
  }
  if (value.targetKind !== 'player' && value.targetKind !== 'npc') return false;
  if (value.targetKind === 'npc' && !ids.has(value.targetId as string)) return false;
  return (
    typeof value.targetId === 'string' &&
    value.targetId.length > 0 &&
    position(value.position) &&
    number(value.headingRadians, -Infinity) &&
    number(value.speed)
  );
}

function orbit(value: unknown, world: WorldMap): boolean {
  if (value === undefined) return true;
  return (
    record(value) &&
    location(world, value.locationId) &&
    position(value.center) &&
    number(value.radius) &&
    number(value.angleRadians, -Infinity)
  );
}

function validNpc(
  value: unknown,
  world: WorldMap,
  ids: ReadonlySet<string>
): value is SectorNpcState {
  if (!record(value)) return false;
  if (!location(world, value.locationId) || !location(world, value.homePortId ?? value.locationId)) {
    return false;
  }
  if (typeof value.id !== 'string' || !value.id || typeof value.shipId !== 'string') return false;
  if (!['freighter', 'miner', 'salvager', 'patrol', 'pirate'].includes(value.job as string)) {
    return false;
  }
  if (!number(value.credits) || !number(value.fuel) || !number(value.fuelCapacity)) return false;
  if (!number(value.hullHp) || !number(value.hullMaxHp) || !cargo(value.cargo)) return false;
  if (value.fuel > value.fuelCapacity || value.hullHp > value.hullMaxHp) return false;
  if (!travel(value.travel, world) || !movement(value.combatMovement, ids)) return false;
  if (value.travel !== undefined && value.combatMovement !== undefined) return false;
  if (!orbit(value.orbit, world)) return false;
  if (record(value.orbit) && value.orbit.locationId !== value.locationId) return false;
  if (value.combatRecoverySeconds !== undefined && !number(value.combatRecoverySeconds)) {
    return false;
  }
  return true;
}

/** A detached snapshot of the authoritative sector NPC objects, not render projections. */
export function captureCareerNpcs(world: WorldMap, npcs: readonly SectorNpcState[]): CareerNpcCheckpoint {
  const detached = cloneCareerJson({ version: 1 as const, worldId: world.id, npcs });
  stageCareerNpcs(world, detached);
  return detached;
}

/** Validate cross-NPC references before returning a new, independent array. */
export function stageCareerNpcs(world: WorldMap, candidate: unknown): SectorNpcState[] {
  const snapshot = cloneCareerJson(candidate);
  if (!record(snapshot) || snapshot.version !== 1 || snapshot.worldId !== world.id) {
    throw new Error('Unbekannter NPC-Spielstand oder falsches Sternsystem.');
  }
  if (!Array.isArray(snapshot.npcs) || snapshot.npcs.length > 10000) {
    throw new Error('Ungültige NPC-Liste.');
  }
  const ids = new Set<string>();
  for (const npc of snapshot.npcs) {
    if (!record(npc) || typeof npc.id !== 'string' || !npc.id || ids.has(npc.id)) {
      throw new Error('Doppelte oder fehlende NPC-Kennung.');
    }
    ids.add(npc.id);
  }
  if (!snapshot.npcs.every((npc) => validNpc(npc, world, ids))) {
    throw new Error('Beschädigte NPC-Route, Ladung oder Kampfzuordnung.');
  }
  return snapshot.npcs as SectorNpcState[];
}

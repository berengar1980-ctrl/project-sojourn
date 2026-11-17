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

function salvageEventTarget(npc: Record<string, unknown>, id: unknown): boolean {
  return (
    npc.job === 'salvager' &&
    typeof id === 'string' &&
    id === npc.salvageEventId &&
    /^salvage-(?:special|distress)-[0-9]+-[0-9]+$/.test(id)
  );
}

function npcLocation(world: WorldMap, npc: Record<string, unknown>, id: unknown): boolean {
  return location(world, id) || salvageEventTarget(npc, id);
}

function cargo(value: unknown): boolean {
  return (
    record(value) &&
    Object.values(value).every((quantity) => number(quantity) && Number.isInteger(quantity))
  );
}

function travel(value: unknown, world: WorldMap, npc: Record<string, unknown>): boolean {
  if (value === undefined) return true;
  if (!record(value) || !npcLocation(world, npc, value.finalTargetId)) return false;
  if (!npcLocation(world, npc, value.targetLocationId) || !Array.isArray(value.routePoints)) {
    return false;
  }
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

function orbit(value: unknown, world: WorldMap, npc: Record<string, unknown>): boolean {
  if (value === undefined) return true;
  return (
    record(value) &&
    npcLocation(world, npc, value.locationId) &&
    position(value.center) &&
    number(value.radius) &&
    number(value.angleRadians, -Infinity)
  );
}

function validNpcIdentity(value: Record<string, unknown>, world: WorldMap): boolean {
  if (!npcLocation(world, value, value.locationId)) return false;
  if (!location(world, value.homePortId ?? value.locationId)) return false;
  if (typeof value.id !== 'string' || !value.id || typeof value.shipId !== 'string') {
    return false;
  }
  return ['freighter', 'miner', 'salvager', 'patrol', 'pirate'].includes(value.job as string);
}

function validNpcFinances(value: Record<string, unknown>): boolean {
  return (
    number(value.credits) &&
    number(value.fuel) &&
    number(value.fuelCapacity) &&
    number(value.hullHp) &&
    number(value.hullMaxHp) &&
    cargo(value.cargo) &&
    value.fuel <= value.fuelCapacity &&
    value.hullHp <= value.hullMaxHp
  );
}

function validNpcActivity(
  value: Record<string, unknown>,
  world: WorldMap,
  ids: ReadonlySet<string>
): boolean {
  if (!travel(value.travel, world, value) || !movement(value.combatMovement, ids)) return false;
  if (value.travel !== undefined && value.combatMovement !== undefined) return false;
  if (!orbit(value.orbit, world, value)) return false;
  if (record(value.orbit) && value.orbit.locationId !== value.locationId) return false;
  if (value.combatRecoverySeconds !== undefined && !number(value.combatRecoverySeconds)) {
    return false;
  }
  if (
    value.smugglingPatrolElapsedSeconds !== undefined &&
    !number(value.smugglingPatrolElapsedSeconds)
  )
    return false;
  if (
    value.smugglingInspectionCooldownSeconds !== undefined &&
    !number(value.smugglingInspectionCooldownSeconds)
  )
    return false;
  if (
    value.smugglingLastArrivalId !== undefined &&
    value.smugglingLastArrivalId !== '' &&
    !location(world, value.smugglingLastArrivalId)
  )
    return false;
  return true;
}

function validNpc(
  value: unknown,
  world: WorldMap,
  ids: ReadonlySet<string>
): value is SectorNpcState {
  return (
    record(value) &&
    validNpcIdentity(value, world) &&
    validNpcFinances(value) &&
    validNpcActivity(value, world, ids)
  );
}

function describeInvalidNpc(value: unknown, world: WorldMap): string {
  if (!record(value)) return 'record';
  const reason = !validNpcIdentity(value, world)
    ? 'identity'
    : !validNpcFinances(value)
      ? 'finances'
      : 'activity';
  const id = typeof value.id === 'string' ? value.id : '?';
  const destination = record(value.travel) ? String(value.travel.targetLocationId ?? '') : '';
  return id + ': ' + reason + (destination ? ' → ' + destination : '');
}

/** A detached snapshot of the authoritative sector NPC objects, not render projections. */
export function captureCareerNpcs(
  world: WorldMap,
  npcs: readonly SectorNpcState[]
): CareerNpcCheckpoint {
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
  const invalid = snapshot.npcs.find((npc) => !validNpc(npc, world, ids));
  if (invalid) {
    throw new Error('Beschädigte NPC-Route, Ladung oder Kampfzuordnung. NPC ' + describeInvalidNpc(invalid, world));
  }
  return snapshot.npcs as SectorNpcState[];
}

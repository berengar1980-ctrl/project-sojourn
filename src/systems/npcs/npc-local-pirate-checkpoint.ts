import { localArmedTraffic } from './npc-combat-ai';
import type { FieldRouteState } from '../navigation/field-ship-routing';
import type { WorldPoint } from '../../core/world-types';
import type { SectorNpcState } from '../../core/npc-types';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface LocalPirateCheckpointShip {
  readonly npcId: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly awaitingCombat: boolean;
  readonly routeState?: FieldRouteState;
}

export interface LocalPirateCheckpoint {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly ships: readonly LocalPirateCheckpointShip[];
  readonly combatReturns: readonly (readonly [string, WorldPoint])[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, min = -Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function validPosition(value: unknown, width: number, height: number): boolean {
  if (!record(value)) return false;
  if (!finite(value.x, 0) || !finite(value.y, 0)) return false;
  return value.x <= width && value.y <= height;
}

function validRoute(value: unknown, width: number, height: number): boolean {
  if (!record(value) || !validPosition(value.target, width, height)) return false;
  if (!Array.isArray(value.points) || value.points.length === 0) return false;
  if (value.points.length > 500) return false;
  if (!Number.isInteger(value.index) || !finite(value.index, 0)) return false;
  if (value.index >= value.points.length) return false;
  return value.points.every((point: unknown) => validPosition(point, width, height));
}

function validShip(value: unknown, width: number, height: number): boolean {
  if (!record(value)) return false;
  if (typeof value.npcId !== 'string' || !value.npcId) return false;
  if (!validPosition(value.position, width, height)) return false;
  if (!finite(value.headingRadians) || !finite(value.speed, 0)) return false;
  if (typeof value.awaitingCombat !== 'boolean') return false;
  return value.routeState === undefined || validRoute(value.routeState, width, height);
}

function validEntries(snapshot: LocalPirateCheckpoint, npcs: readonly SectorNpcState[]): boolean {
  const known = new Map(npcs.filter(localArmedTraffic).map((npc) => [npc.id, npc]));
  const seen = new Set<string>();
  for (const ship of snapshot.ships) {
    const npc = known.get(ship.npcId);
    if (!npc || npc.hullHp <= 0 || npc.travel || seen.has(ship.npcId)) {
      return false;
    }
    seen.add(ship.npcId);
  }
  for (const [id] of snapshot.combatReturns) {
    const npc = known.get(id);
    if (!npc || seen.has(id) || (!npc.combatMovement && !npc.combatRecoverySeconds)) {
      return false;
    }
    seen.add(id);
  }
  return true;
}

function validCombatReturn(entry: unknown, width: number, height: number): boolean {
  if (!Array.isArray(entry) || entry.length !== 2) return false;
  return typeof entry[0] === 'string' && validPosition(entry[1], width, height);
}

export function validLocalTrafficSceneData(
  value: Record<string, unknown>,
  width: number,
  height: number
): boolean {
  if (!Array.isArray(value.ships) || !Array.isArray(value.combatReturns)) return false;
  if (value.ships.length > 1000 || value.combatReturns.length > 1000) return false;
  if (!value.ships.every((ship) => validShip(ship, width, height))) return false;
  return value.combatReturns.every((entry) => validCombatReturn(entry, width, height));
}

/** Stage a detached local pirate scene; never patch a currently active field. */
export function stageLocalPirateCheckpoint(
  candidate: unknown,
  width: number,
  height: number,
  seed: number,
  npcs: readonly SectorNpcState[]
): LocalPirateCheckpoint {
  const value = cloneCareerJson(candidate);
  if (!record(value) || value.version !== 1) {
    throw new Error('Falsche Version oder Asteroidenkarte im Piraten-Spielstand.');
  }
  if (value.width !== width || value.height !== height || value.seed !== seed) {
    throw new Error('Falsche Version oder Asteroidenkarte im Piraten-Spielstand.');
  }
  if (!validLocalTrafficSceneData(value, width, height)) {
    throw new Error('Beschädigte lokale Piratenzustände.');
  }
  const snapshot = value as unknown as LocalPirateCheckpoint;
  if (!validEntries(snapshot, npcs)) {
    throw new Error('Widersprüchliche oder doppelte Piraten-Kennungen.');
  }
  return snapshot;
}

import type { LocalMinerCheckpoint, NpcLocalMiningOptions } from './npc-mining-targets';
import { stageMiningEventCheckpoint } from '../local-space/mining-event-checkpoint';
import { cloneCareerJson } from '../persistence/career-save-contract';
import { hashId } from './npc-mining-targets';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function point(value: unknown, width: number, height: number): boolean {
  if (!record(value) || !finite(value.x) || !finite(value.y)) return false;
  return value.x <= width && value.y <= height;
}

function validOreCollection(value: unknown): boolean {
  if (!record(value)) return false;
  if (typeof value.resourceId !== 'string' || !value.resourceId) return false;
  const duration = value.durationSeconds;
  const remaining = value.remainingSeconds;
  if (!finite(duration, 0.01) || duration > 10) return false;
  return finite(remaining) && remaining <= duration;
}

function validTarget(ship: Record<string, unknown>, options: NpcLocalMiningOptions): boolean {
  if (ship.targetAsteroidId === null) {
    return ['entering', 'approaching', 'exiting'].includes(ship.phase as string);
  }
  return (
    typeof ship.targetAsteroidId === 'string' &&
    options.getAsteroids().some((asteroid) => asteroid.id === ship.targetAsteroidId)
  );
}

function validShip(value: unknown, options: NpcLocalMiningOptions): boolean {
  if (!record(value) || typeof value.npcId !== 'string') return false;
  const npc = options.miners.find((item) => item.id === value.npcId);
  if (!npc || npc.job !== 'miner' || npc.locationId !== options.locationId) return false;
  if (value.shipId !== npc.shipId || value.name !== npc.name) return false;
  if (!point(value.position, options.width, options.height)) return false;
  if (!point(value.entryPoint, options.width, options.height)) return false;
  if (!point(value.exitPoint, options.width, options.height)) return false;
  if (!finite(value.headingRadians, -Infinity) || !finite(value.speed)) return false;
  if (
    !['entering', 'approaching', 'scanning', 'mining', 'exiting'].includes(value.phase as string)
  ) {
    return false;
  }
  if (!finite(value.scanProgress) || value.scanProgress > 1) return false;
  if (!finite(value.miningAccumulator) || typeof value.laserActive !== 'boolean') return false;
  if (value.oreCollection !== undefined && !validOreCollection(value.oreCollection)) return false;
  return validTarget(value, options);
}

function validCombatReturns(
  entries: unknown[],
  options: NpcLocalMiningOptions,
  occupied: Set<string>
): boolean {
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      return false;
    }
    if (!point(entry[1], options.width, options.height) || occupied.has(entry[0])) {
      return false;
    }
    const npc = options.miners.find((item) => item.id === entry[0]);
    if (!npc || (!npc.combatMovement && !npc.combatRecoverySeconds)) return false;
    occupied.add(entry[0]);
  }
  return true;
}

function validEvents(entries: unknown[], options: NpcLocalMiningOptions): boolean {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      return false;
    }
    if (seen.has(entry[0]) || !options.miners.some((npc) => npc.id === entry[0])) return false;
    stageMiningEventCheckpoint(entry[1], hashId(options.locationId + ':' + entry[0]));
    seen.add(entry[0]);
  }
  return seen.size === options.miners.length;
}

/** Validate all local mining owners before allocating any restored runtime. */
export function stageLocalMinerCheckpoint(
  candidate: unknown,
  options: NpcLocalMiningOptions
): LocalMinerCheckpoint {
  const value = cloneCareerJson(candidate);
  if (!record(value) || value.version !== 1 || value.locationId !== options.locationId) {
    throw new Error('Unbekannter oder falscher Miner-Spielstand.');
  }
  if (value.seed !== (options.seed ?? 0) || value.width !== options.width) {
    throw new Error('Miner-Spielstand passt nicht zum Asteroidenfeld.');
  }
  if (value.height !== options.height) {
    throw new Error('Miner-Spielstand passt nicht zum Feld.');
  }
  if (!Array.isArray(value.ships) || !Array.isArray(value.combatReturns)) {
    throw new Error('Beschädigte lokale Miner-Liste.');
  }
  if (!Array.isArray(value.events) || value.ships.length > 1000) {
    throw new Error('Beschädigte Miner-Ereignisse.');
  }
  const occupied = new Set<string>();
  for (const ship of value.ships) {
    if (!validShip(ship, options) || occupied.has(ship.npcId)) {
      throw new Error('Ungültiges Minerschiff oder doppelter NPC.');
    }
    occupied.add(ship.npcId);
  }
  if (!validCombatReturns(value.combatReturns, options, occupied)) {
    throw new Error('Ungültige Miner-Kampfrückkehr.');
  }
  if (!validEvents(value.events, options)) {
    throw new Error('Ungültige Miner-Ereignisregister.');
  }
  return value as unknown as LocalMinerCheckpoint;
}

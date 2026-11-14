import type { MiningEventState, MiningEventType } from '../../core/local-space-types';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface MiningEventSession {
  readonly initialOre: number;
  readonly triggerProgress: number;
  readonly scheduled: boolean;
  readonly primaryResourceId: string;
  readonly type: MiningEventType;
  readonly rolls: readonly number[];
  readonly id: string;
  triggered: boolean;
}

export interface MiningEventCheckpoint {
  readonly version: 1;
  readonly seed: number;
  readonly draws: number;
  readonly sessionCounter: number;
  readonly session: MiningEventSession | null;
  readonly pending: MiningEventState | null;
  readonly cycleModifier: number;
  readonly recoverySeconds: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function validSession(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value)) return false;
  if (!finite(value.initialOre) || !finite(value.triggerProgress)) return false;
  if (value.triggerProgress > 1 || typeof value.scheduled !== 'boolean') return false;
  if (typeof value.primaryResourceId !== 'string' || typeof value.id !== 'string') return false;
  if (!['unstable', 'machine', 'rich', 'cavity', 'rare', 'deeper'].includes(value.type as string)) {
    return false;
  }
  if (typeof value.triggered !== 'boolean' || !Array.isArray(value.rolls)) return false;
  return value.rolls.length === 3 && value.rolls.every((roll) => finite(roll) && roll < 1);
}

function validPending(value: unknown, session: MiningEventSession | null): boolean {
  if (value === null) return true;
  if (!record(value) || !session || !session.triggered) return false;
  if (value.id !== session.id || value.type !== session.type) return false;
  if (!finite(value.extractionProgress) || value.extractionProgress > 1) return false;
  if (typeof value.title !== 'string' || typeof value.description !== 'string') return false;
  return Array.isArray(value.choices) && value.choices.length > 0;
}

/** Stage a detached event checkpoint before mutating any live event controller. */
export function stageMiningEventCheckpoint(
  candidate: unknown,
  seed: number
): MiningEventCheckpoint {
  const value = cloneCareerJson(candidate);
  if (!record(value) || value.version !== 1 || value.seed !== seed) {
    throw new Error('Bergbauereignis gehört zu einer anderen Karte oder Version.');
  }
  if (!Number.isInteger(value.draws) || !finite(value.draws) || value.draws > 1000000) {
    throw new Error('Ungültiger Bergbau-Zufallszustand.');
  }
  if (!Number.isInteger(value.sessionCounter) || !finite(value.sessionCounter)) {
    throw new Error('Ungültiger Bergbau-Ereigniszähler.');
  }
  if (!validSession(value.session)) throw new Error('Beschädigtes Bergbauereignis.');
  if (!validPending(value.pending, value.session as MiningEventSession | null)) {
    throw new Error('Beschädigter Bergbauereignis-Entscheid.');
  }
  if (!finite(value.cycleModifier, 0.5) || value.cycleModifier > 1.8) {
    throw new Error('Ungültiger Bergbau-Zyklus.');
  }
  if (!finite(value.recoverySeconds)) throw new Error('Ungültige Bergbau-Erholungszeit.');
  return value as unknown as MiningEventCheckpoint;
}

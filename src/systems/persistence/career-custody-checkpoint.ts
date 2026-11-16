import type { SectorNpcState } from '../../core/npc-types';
import type { SectorLegalRegistry } from '../operations/sector-legal-registry';
import { cloneCareerJson } from './career-save-contract';

export interface CareerDetentionCheckpoint {
  readonly shipId: string;
  readonly days: number;
  readonly laborCredits: number;
  readonly accumulator: number;
}

export interface CareerCustodyCheckpoint {
  readonly version: 1;
  readonly prisoners: readonly string[];
  readonly player: CareerDetentionCheckpoint | null;
}

export interface StagedCareerCustody {
  readonly prisoners: Set<string>;
  readonly player: CareerDetentionCheckpoint | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validDetention(value: unknown, activeShipId: string): value is CareerDetentionCheckpoint {
  return (
    record(value) &&
    value.shipId === activeShipId &&
    count(value.days) &&
    count(value.laborCredits) &&
    typeof value.accumulator === 'number' &&
    Number.isFinite(value.accumulator) &&
    value.accumulator >= 0 &&
    value.accumulator < 1
  );
}

/** Detention time and paid labor are receipts, not fresh fines on reload. */
export function stageCareerCustody(
  candidate: unknown,
  legal: SectorLegalRegistry,
  npcs: readonly SectorNpcState[],
  activeShipId: string
): StagedCareerCustody {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !Array.isArray(saved.prisoners) ||
    saved.prisoners.length > npcs.length ||
    (saved.player !== null && !validDetention(saved.player, activeShipId))
  ) {
    throw new Error('Invalid custody checkpoint');
  }
  const known = new Map(npcs.map((npc) => [npc.id, npc]));
  const prisoners = new Set<string>();
  for (const id of saved.prisoners) {
    const npc = known.get(id);
    if (
      typeof id !== 'string' ||
      !npc ||
      prisoners.has(id) ||
      legal.status(npc.shipId + ':' + npc.id) !== 'custody'
    ) {
      throw new Error('Inconsistent NPC penal custody');
    }
    prisoners.add(id);
  }
  if (saved.player && legal.status(activeShipId) !== 'custody') {
    throw new Error('Player detention and legal registry mismatch');
  }
  return {
    prisoners,
    player: saved.player ? { ...(saved.player as CareerDetentionCheckpoint) } : null,
  };
}

export function captureCareerCustody(
  prisoners: ReadonlySet<string>,
  player: CareerDetentionCheckpoint | null
): CareerCustodyCheckpoint {
  return cloneCareerJson({
    version: 1 as const,
    prisoners: [...prisoners].sort(),
    player: player ? { ...player } : null,
  });
}

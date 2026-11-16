import type { DistressDamageType, SectorSalvageEvent } from '../../core/salvage-types';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface CareerSalvageEventsCheckpoint {
  readonly version: 1;
  readonly seed: number;
  readonly randomCalls: number;
  readonly currentDay: number;
  readonly nextSpecialDay: number;
  readonly nextDistressDay: number;
  readonly serial: number;
  readonly lastDistressDamage: DistressDamageType | null;
  readonly playerSalvageEligible: boolean;
  readonly events: readonly SectorSalvageEvent[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validEvent(value: unknown, day: number): boolean {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    ['special-wreck', 'distress-rescue'].includes(value.type as string) &&
    record(value.position) &&
    typeof value.position.x === 'number' &&
    Number.isFinite(value.position.x) &&
    typeof value.position.y === 'number' &&
    Number.isFinite(value.position.y) &&
    count(value.fieldSeed) &&
    count(value.createdDay) &&
    value.createdDay <= day &&
    count(value.expiresDay) &&
    value.expiresDay >= value.createdDay &&
    count(value.playerDeadlineDay) &&
    typeof value.playerAccepted === 'boolean' &&
    typeof value.resolved === 'boolean' &&
    (value.claimedByNpcId === null || typeof value.claimedByNpcId === 'string') &&
    typeof value.distressTrap === 'boolean' &&
    count(value.distressPendingRewardCredits)
  );
}

/** Previously resolved wrecks and distress rewards are never re-generated on load. */
export function stageCareerSalvageEvents(candidate: unknown): CareerSalvageEventsCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !count(saved.seed) ||
    !count(saved.randomCalls) ||
    saved.randomCalls > 2_000_000 ||
    !count(saved.currentDay) ||
    !count(saved.nextSpecialDay) ||
    !count(saved.nextDistressDay) ||
    !count(saved.serial) ||
    typeof saved.playerSalvageEligible !== 'boolean' ||
    !Array.isArray(saved.events) ||
    saved.events.length > 1000
  ) {
    throw new Error('Invalid career salvage events checkpoint');
  }
  const seen = new Set<string>();
  for (const event of saved.events) {
    if (!validEvent(event, saved.currentDay) || seen.has(event.id)) {
      throw new Error('Duplicate or corrupted saved salvage event');
    }
    seen.add(event.id);
  }
  return saved as unknown as CareerSalvageEventsCheckpoint;
}

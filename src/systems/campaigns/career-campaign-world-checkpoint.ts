import type { CampaignWorldSnapshot } from './campaign-world-service';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface CareerCampaignWorldCheckpoint {
  readonly version: 1;
  readonly revision: number;
  readonly snapshot: CampaignWorldSnapshot;
  readonly active: {
    readonly owner: string;
    readonly id: string;
    readonly returnLocationId: string;
  } | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Check structural identities before any mission additions touch the fresh navigation. */
export function stageCareerCampaignWorldCheckpoint(
  candidate: unknown
): CareerCampaignWorldCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !Number.isSafeInteger(saved.revision) ||
    (saved.revision as number) < 0 ||
    !record(saved.snapshot) ||
    !record(saved.snapshot.locations) ||
    !record(saved.snapshot.systems)
  ) {
    throw new Error('Invalid saved campaign world');
  }
  const snapshot = saved.snapshot;
  if (
    Object.values(snapshot.locations as Record<string, unknown>).some((entries) => !Array.isArray(entries)) ||
    Object.values(snapshot.systems as Record<string, unknown>).some((entries) => !Array.isArray(entries))
  ) {
    throw new Error('Invalid saved campaign world additions');
  }
  const active = saved.active;
  if (active === null) {
    if (snapshot.activeSystemId !== null) {
      throw new Error('Saved campaign system is missing its return location');
    }
  } else if (
    !record(active) ||
    typeof active.owner !== 'string' ||
    !active.owner ||
    typeof active.id !== 'string' ||
    !active.id ||
    typeof active.returnLocationId !== 'string' ||
    !active.returnLocationId ||
    snapshot.activeSystemId !== active.id
  ) {
    throw new Error('Invalid saved campaign return location');
  }
  return saved as unknown as CareerCampaignWorldCheckpoint;
}

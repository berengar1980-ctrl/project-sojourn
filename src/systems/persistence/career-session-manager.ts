import type { WorldMap } from '../../core/world-types';
import {
  captureCareerFullSession,
  stageCareerFullSession,
  type CareerFullSessionDependencies,
  type StagedFullCareerSession,
} from './career-full-session';
import { createCareerSessionSlot } from './career-session-transaction';
import type { CareerReadResult } from './career-save-store';
import type { CareerSnapshot } from './career-save-contract';

export interface CareerSnapshotStorage {
  save(snapshot: CareerSnapshot): void;
  read(): CareerReadResult;
}

export type CareerLoadResult =
  | { readonly ok: true; readonly previous: StagedFullCareerSession }
  | { readonly ok: false; readonly reason: 'missing' | 'invalid' | 'unsupported' | 'corrupt' | 'restore_failed' };

export interface CareerSessionManager {
  current(): StagedFullCareerSession;
  save(): void;
  load(): CareerLoadResult;
}

/**
 * One authority is active at a time. Loading stages and validates everything
 * before swapping a single pointer; a corrupt save never alters the live game.
 */
export function createCareerSessionManager(
  initial: StagedFullCareerSession,
  world: WorldMap,
  dependencies: CareerFullSessionDependencies,
  store: CareerSnapshotStorage
): CareerSessionManager {
  const slot = createCareerSessionSlot(initial);
  return {
    current: () => slot.current(),
    save() {
      const candidate = captureCareerFullSession(slot.current(), world);
      store.save(candidate);
    },
    load(): CareerLoadResult {
      const result = store.read();
      if (!result.ok) return result;
      let staged: StagedFullCareerSession;
      try {
        staged = stageCareerFullSession(result.snapshot, dependencies);
      } catch {
        return { ok: false, reason: 'restore_failed' };
      }
      const previous = slot.install(staged);
      staged.activate();
      return { ok: true, previous };
    },
  };
}

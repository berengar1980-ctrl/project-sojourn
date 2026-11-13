import type { BoardingEncounterSnapshot } from '../../core/boarding-types';

export const BOARDING_CHECKPOINT_KEY = 'sojourn.boarding.tactical.v1';

export interface BoardingCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SavedCheckpoint {
  readonly version: 1;
  readonly snapshot: BoardingEncounterSnapshot;
}

/** A tactical checkpoint. The wider economy, career and navigation are not saved here. */
export function createBoardingCheckpointStore(storage: BoardingCheckpointStorage) {
  return {
    save(snapshot: BoardingEncounterSnapshot): void {
      if (snapshot.outcome !== 'active') throw new Error('Nur aktive Enterkämpfe sind speicherbar.');
      const record: SavedCheckpoint = { version: 1, snapshot };
      const serialized = JSON.stringify(record);
      if (serialized.length > 256_000) throw new Error('Der Enterkampfstand ist zu groß.');
      storage.setItem(BOARDING_CHECKPOINT_KEY, serialized);
    },
    load(): BoardingEncounterSnapshot | null {
      const serialized = storage.getItem(BOARDING_CHECKPOINT_KEY);
      if (!serialized) return null;
      if (serialized.length > 256_000) throw new Error('Der Enterkampfstand ist zu groß.');
      const parsed: unknown = JSON.parse(serialized, (key, value: unknown) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new Error('Ungültiger Schlüssel im Enterkampfstand.');
        }
        return value;
      });
      if (!parsed || typeof parsed !== 'object' || !('version' in parsed)) {
        throw new Error('Ungültiger Enterkampfstand.');
      }
      const record = parsed as Partial<SavedCheckpoint>;
      if (record.version !== 1 || !record.snapshot) {
        throw new Error('Nicht unterstützte Enterkampf-Speicherversion.');
      }
      return record.snapshot;
    },
    clear(): void {
      storage.removeItem(BOARDING_CHECKPOINT_KEY);
    },
  };
}

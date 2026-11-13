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

function validNumber(value: number, minimum: number, maximum: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/** The saved snapshot may change HP/AP, but never identities, weapons, topology or seed. */
export function compatibleBoardingCheckpoint(
  current: BoardingEncounterSnapshot,
  candidate: BoardingEncounterSnapshot
): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.seed !== current.seed || candidate.map?.id !== current.map.id) return false;
  if (!Array.isArray(candidate.units) || candidate.units.length !== current.units.length) {
    return false;
  }
  if (candidate.outcome !== 'active' || candidate.allowRetreat !== current.allowRetreat) {
    return false;
  }
  if (candidate.activeTeam !== 'player' && candidate.activeTeam !== 'enemy') return false;
  if (!validNumber(candidate.round, 1, 10000) || !Number.isInteger(candidate.round)) return false;
  if (!validNumber(candidate.randomCalls, 0, 100000)) return false;
  if (!Number.isInteger(candidate.randomCalls)) return false;
  if (!candidate.doorStates || typeof candidate.doorStates !== 'object') return false;
  const expectedDoorIds = current.map.doors.map((door) => door.id);
  if (Object.keys(candidate.doorStates).length !== expectedDoorIds.length) return false;
  if (expectedDoorIds.some((id) => typeof candidate.doorStates[id] !== 'boolean')) return false;
  if (!Array.isArray(candidate.log) || candidate.log.length > 40) return false;
  if (candidate.log.some((entry) => !entry || typeof entry.text !== 'string')) return false;
  if (!Array.isArray(candidate.suppressionZones) || candidate.suppressionZones.length > 25) {
    return false;
  }
  const usedPositions = new Set<string>();
  for (const entry of candidate.units) {
    const original = current.units.find((unit) => unit.id === entry?.id);
    if (!original || original.team !== entry.team || original.maxHp !== entry.maxHp) return false;
    if (original.weapon.id !== entry.weapon?.id) return false;
    if (original.meleeWeapon.id !== entry.meleeWeapon?.id) return false;
    if (!validNumber(entry.hp, 0, entry.maxHp) || !validNumber(entry.ap, 0, 3)) return false;
    if (!Number.isInteger(entry.q) || !Number.isInteger(entry.r)) return false;
    if (entry.q < 0 || entry.r < 0) continue;
    if (entry.q >= current.map.columns || entry.r >= current.map.rows) return false;
    const cell = entry.q + ',' + entry.r;
    if (entry.hp > 0 && usedPositions.has(cell)) return false;
    if (entry.hp > 0) usedPositions.add(cell);
  }
  if (candidate.selectedUnitId !== null) {
    if (!candidate.units.some((unit) => unit.id === candidate.selectedUnitId)) return false;
  }
  return candidate.suppressionZones.every((zone) =>
    candidate.units.some((unit) => unit.id === zone?.ownerId && unit.team === zone.team)
  );
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

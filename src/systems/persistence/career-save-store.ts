import {
  MAX_CAREER_SAVE_BYTES,
  validateCareerSnapshot,
  type CareerSnapshot,
} from './career-save-contract';

export const CAREER_SAVE_STORAGE_KEY = 'sojourn.career.v1';

export interface CareerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SaveEnvelope {
  readonly format: 'sojourn-career';
  readonly formatVersion: 1;
  readonly checksum: string;
  readonly payload: string;
}

export type CareerReadResult =
  | { readonly ok: true; readonly snapshot: CareerSnapshot }
  | { readonly ok: false; readonly reason: 'missing' | 'invalid' | 'unsupported' | 'corrupt' };

function checksum(text: string): string {
  // FNV-1a is a corruption check, NOT a security signature.
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function decodeRecord(raw: string): CareerReadResult {
  if (raw.length > MAX_CAREER_SAVE_BYTES) return { ok: false, reason: 'invalid' };
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { ok: false, reason: 'invalid' };
    }
    const envelope = candidate as Partial<SaveEnvelope>;
    if (envelope.format !== 'sojourn-career' || envelope.formatVersion !== 1) {
      return { ok: false, reason: 'unsupported' };
    }
    if (typeof envelope.payload !== 'string' || typeof envelope.checksum !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    if (checksum(envelope.payload) !== envelope.checksum) {
      return { ok: false, reason: 'corrupt' };
    }
    return { ok: true, snapshot: validateCareerSnapshot(JSON.parse(envelope.payload)) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export function createCareerSaveStore(storage: CareerStorage) {
  return {
    /** Only one complete, validated JSON string is committed. No partial writes. */
    save(snapshot: CareerSnapshot): void {
      const detached = validateCareerSnapshot(snapshot);
      const payload = JSON.stringify(detached);
      const envelope: SaveEnvelope = {
        format: 'sojourn-career',
        formatVersion: 1,
        checksum: checksum(payload),
        payload,
      };
      const serialized = JSON.stringify(envelope);
      if (serialized.length > MAX_CAREER_SAVE_BYTES) {
        throw new Error('Spielstand überschreitet die Speichergrenze.');
      }
      storage.setItem(CAREER_SAVE_STORAGE_KEY, serialized);
    },
    /** Read and validate without mutating any live subsystem. */
    read(): CareerReadResult {
      const raw = storage.getItem(CAREER_SAVE_STORAGE_KEY);
      return raw === null ? { ok: false, reason: 'missing' } : decodeRecord(raw);
    },
  };
}

/**
 * Construct a NEW career session from a validated save. Callers install the
 * returned session only after it has been fully created; never mutate the
 * currently running game in the builder.
 */
export function stageCareerSession<T>(
  snapshot: CareerSnapshot,
  buildFreshSession: (detached: CareerSnapshot) => T
): T {
  const verified = validateCareerSnapshot(snapshot);
  return buildFreshSession(verified);
}

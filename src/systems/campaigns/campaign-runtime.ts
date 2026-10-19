import type {
  CampaignCategory,
  CampaignEvent,
  CampaignPackageInfo,
  CampaignProgress,
  CampaignSnapshot,
  CampaignStatus,
  CampaignValue,
} from '../../core/campaign-types';
import type { CampaignEventBus } from './campaign-event-bus';

export interface CampaignContext {
  readonly id: string;
  status(): CampaignStatus;
  start(): boolean;
  complete(outcome: string): boolean;
  get(key: string): CampaignValue | null;
  set(key: string, value: CampaignValue): void;
}

export interface CampaignDefinition {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly category?: CampaignCategory;
  readonly defaultEnabled?: boolean;
  readonly onEvent?: (event: CampaignEvent, campaign: CampaignContext) => void;
  /** Converts an earlier package's data, without accessing game services. */
  readonly migrate?: (previous: CampaignProgress) => CampaignProgress;
}

export interface CampaignEntry extends CampaignPackageInfo {
  readonly status: CampaignStatus;
  readonly unavailableReason: 'version_mismatch' | null;
}

export interface CampaignRuntime {
  register(definition: CampaignDefinition): void;
  list(): readonly CampaignEntry[];
  isActive(id: string): boolean;
  isEnabled(id: string): boolean;
  setEnabled(id: string, enabled: boolean): boolean;
  start(id: string): boolean;
  complete(id: string, outcome: string): boolean;
  get(id: string, key: string): CampaignValue | null;
  set(id: string, key: string, value: CampaignValue): void;
  unavailableIds(): readonly string[];
  snapshot(): CampaignSnapshot;
  destroy(): void;
}

const PACKAGE_ID = /^[a-z0-9][a-z0-9_-]*$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value: CampaignValue): CampaignValue {
  const visited = new WeakSet<object>();
  const validate = (item: unknown): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object') throw new Error('Non-JSON campaign value.');
    if (visited.has(item)) throw new Error('Cyclic or shared campaign data is unsupported.');
    visited.add(item);
    if (!Array.isArray(item) && !isRecord(item)) throw new Error('Invalid campaign data.');
    for (const part of Object.values(item)) validate(part);
  };
  validate(value);
  return JSON.parse(JSON.stringify(value)) as CampaignValue;
}

function cloneProgress(value: CampaignProgress): CampaignProgress {
  if (!Number.isSafeInteger(value.version) || value.version <= 0) {
    throw new Error('Invalid campaign package version.');
  }
  if (!['inactive', 'active', 'completed'].includes(value.status) || !isRecord(value.data)) {
    throw new Error('Invalid campaign progress.');
  }
  if (value.outcome !== undefined && typeof value.outcome !== 'string') {
    throw new Error('Invalid campaign outcome.');
  }
  const data: Record<string, CampaignValue> = {};
  for (const [key, entry] of Object.entries(value.data)) {
    data[key] = cloneValue(entry as CampaignValue);
  }
  return {
    version: value.version,
    status: value.status,
    data,
    ...(value.outcome !== undefined ? { outcome: value.outcome } : {}),
  };
}

function parseSave(candidate?: CampaignSnapshot): CampaignSnapshot {
  if (candidate === undefined) return { snapshotVersion: 1, enabled: {}, campaigns: {} };
  if (
    !isRecord(candidate) ||
    candidate.snapshotVersion !== 1 ||
    !isRecord(candidate.enabled) ||
    !isRecord(candidate.campaigns)
  ) {
    throw new Error('Unsupported campaign snapshot version.');
  }
  const enabled: Record<string, boolean> = {};
  const campaigns: Record<string, CampaignProgress> = {};
  for (const [id, value] of Object.entries(candidate.enabled)) {
    if (!PACKAGE_ID.test(id) || typeof value !== 'boolean') {
      throw new Error('Invalid campaign selection.');
    }
    enabled[id] = value;
  }
  for (const [id, progress] of Object.entries(candidate.campaigns)) {
    if (!PACKAGE_ID.test(id) || !isRecord(progress)) {
      throw new Error('Invalid campaign entry.');
    }
    campaigns[id] = cloneProgress(progress as unknown as CampaignProgress);
  }
  return { snapshotVersion: 1, enabled, campaigns };
}

export function createCampaignRuntime(
  events: CampaignEventBus,
  restored?: CampaignSnapshot,
  reportError: (id: string, error: unknown) => void = (id, error) =>
    console.error('Campaign ' + id + ':', error)
): CampaignRuntime {
  const save = parseSave(restored);
  const definitions = new Map<string, CampaignDefinition>();
  const progress = new Map<string, CampaignProgress>(Object.entries(save.campaigns));
  const enabled = new Map<string, boolean>(Object.entries(save.enabled));
  const mismatched = new Set<string>();
  let destroyed = false;

  function state(id: string): CampaignProgress {
    const rec = progress.get(id);
    if (!rec) throw new Error('Unknown campaign: ' + id);
    return rec;
  }

  function accessible(id: string): boolean {
    const def = definitions.get(id);
    return !!def && !destroyed && !mismatched.has(id) && enabled.get(id) !== false;
  }

  function start(id: string): boolean {
    if (!accessible(id) || state(id).status !== 'inactive') return false;
    progress.set(id, { ...state(id), status: 'active' });
    return true;
  }

  function complete(id: string, outcome: string): boolean {
    if (!accessible(id) || state(id).status !== 'active' || !outcome.trim()) return false;
    progress.set(id, { ...state(id), status: 'completed', outcome: outcome.trim() });
    return true;
  }

  function get(id: string, key: string): CampaignValue | null {
    if (!progress.has(id)) return null;
    const value = state(id).data[key];
    return value === undefined ? null : cloneValue(value);
  }

  function set(id: string, key: string, value: CampaignValue): void {
    if (!accessible(id) || state(id).status !== 'active' || !key) {
      throw new Error('Cannot change inactive campaign: ' + id);
    }
    progress.set(id, { ...state(id), data: { ...state(id).data, [key]: cloneValue(value) } });
  }

  const unsubscribe = events.subscribe((event) => {
    for (const [id, definition] of definitions) {
      if (!accessible(id) || state(id).status === 'completed' || !definition.onEvent) continue;
      const context: CampaignContext = {
        id,
        status: () => state(id).status,
        start: () => start(id),
        complete: (outcome) => complete(id, outcome),
        get: (key) => get(id, key),
        set: (key, value) => set(id, key, value),
      };
      try {
        definition.onEvent(event, context);
      } catch (error) {
        reportError(id, error);
      }
    }
  });

  return {
    register(definition) {
      if (destroyed) throw new Error('Campaign runtime is destroyed.');
      if (!PACKAGE_ID.test(definition.id) || !definition.title.trim()) {
        throw new Error('Invalid campaign package metadata.');
      }
      if (!Number.isSafeInteger(definition.version) || definition.version <= 0) {
        throw new Error('Invalid campaign version.');
      }
      if (definitions.has(definition.id)) throw new Error('Duplicate campaign: ' + definition.id);
      const record = progress.get(definition.id);
      if (record && record.version !== definition.version) {
        if (!definition.migrate) mismatched.add(definition.id);
        else {
          const migrated = cloneProgress(definition.migrate(cloneProgress(record)));
          if (migrated.version !== definition.version) {
            throw new Error('Campaign migration did not reach current version.');
          }
          progress.set(definition.id, migrated);
        }
      }
      if (!record) {
        progress.set(definition.id, { version: definition.version, status: 'inactive', data: {} });
      }
      if (!enabled.has(definition.id)) {
        enabled.set(definition.id, definition.category === 'core' || definition.defaultEnabled !== false);
      }
      if (definition.category === 'core') enabled.set(definition.id, true);
      definitions.set(definition.id, definition);
    },
    list() {
      return [...definitions.values()].map((definition) => ({
        id: definition.id,
        title: definition.title,
        version: definition.version,
        category: definition.category ?? 'optional',
        defaultEnabled: definition.defaultEnabled !== false,
        status: state(definition.id).status,
        unavailableReason: mismatched.has(definition.id) ? 'version_mismatch' as const : null,
      }));
    },
    isActive(id) {
      return accessible(id) && state(id).status === 'active';
    },
    isEnabled: (id) => accessible(id),
    setEnabled(id, value) {
      const def = definitions.get(id);
      if (!def || def.category === 'core' || destroyed) return false;
      enabled.set(id, value);
      return true;
    },
    start,
    complete,
    get,
    set,
    unavailableIds() {
      return [
        ...new Set([
          ...[...progress.keys()].filter((id) => !definitions.has(id)),
          ...mismatched,
        ]),
      ];
    },
    snapshot() {
      return parseSave({
        snapshotVersion: 1,
        enabled: Object.fromEntries(enabled),
        campaigns: Object.fromEntries(progress),
      });
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      definitions.clear();
    },
  };
}

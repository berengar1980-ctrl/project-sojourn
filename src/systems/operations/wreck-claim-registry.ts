import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { LocalNpcSalvagerState } from '../npcs/npc-local-salvage-service';
import type { LocalPirateCheckpoint } from '../npcs/npc-local-pirate-checkpoint';
import type { SecurityDroneCheckpoint } from './asteroid-security-drone-checkpoint';

export interface WreckClaim {
  readonly fieldId: string;
  readonly wreckId: string;
  readonly ownerId: string;
  readonly registeredDay: number;
  readonly expiresDay: number;
}

interface StoredWreck {
  readonly id: string;
  readonly resources: Record<string, number>;
  readonly capacities?: Record<string, number>;
  readonly componentStatus: SalvageWreck['componentStatus'];
  readonly inspected: boolean;
  readonly scanLevel: NonNullable<SalvageWreck['scanLevel']>;
}

interface StoredField {
  readonly locationId: string;
  readonly seed: number;
  readonly wrecks: readonly StoredWreck[];
  readonly drone?: SecurityDroneCheckpoint;
  readonly securityEscorts?: LocalPirateCheckpoint;
  readonly workers?: readonly LocalNpcSalvagerState[];
}

export interface WreckClaimCheckpoint {
  readonly version: 1;
  readonly claims: readonly WreckClaim[];
  readonly fields: readonly (readonly [string, StoredField])[];
}

export type WreckClaimResult =
  | { readonly ok: true; readonly fee: number }
  | {
      readonly ok: false;
      readonly reason: 'unscanned' | 'empty' | 'occupied' | 'unaffordable' | 'combat-wreck';
    };

const CLAIM_DURATION_DAYS = 14;
const CLAIM_FEE = 650;

function isCombatWreckId(id: string): boolean {
  return id.startsWith('combat-wreck-');
}

function matchesDeposits(
  wreck: SalvageWreck,
  stored: Record<string, number>,
  amount: 'remainingAmount' | 'initialAmount'
): boolean {
  let index = 0;
  for (const id in stored) {
    if (!Object.hasOwn(stored, id)) continue;
    const deposit = wreck.resources[index++];
    if (deposit?.resourceId !== id || !Object.is(deposit[amount], stored[id])) return false;
  }
  return index === wreck.resources.length;
}

function matchesWreck(wreck: SalvageWreck, stored: StoredWreck): boolean {
  return (
    wreck.id === stored.id &&
    wreck.componentStatus === stored.componentStatus &&
    wreck.inspected === stored.inspected &&
    (wreck.scanLevel ?? 'unscanned') === stored.scanLevel &&
    stored.capacities !== undefined &&
    matchesDeposits(wreck, stored.resources, 'remainingAmount') &&
    matchesDeposits(wreck, stored.capacities, 'initialAmount')
  );
}

function captureWreck(wreck: SalvageWreck): StoredWreck {
  return {
    id: wreck.id,
    resources: Object.fromEntries(
      wreck.resources.map((resource) => [resource.resourceId, resource.remainingAmount])
    ),
    capacities: Object.fromEntries(
      wreck.resources.map((resource) => [resource.resourceId, resource.initialAmount])
    ),
    componentStatus: wreck.componentStatus,
    inspected: wreck.inspected,
    scanLevel: wreck.scanLevel ?? 'unscanned',
  };
}

/** Compare live values, not object identity: resources mutate in place during play. */
function captureWrecks(
  wrecks: readonly SalvageWreck[],
  previous: readonly StoredWreck[] = []
): readonly StoredWreck[] {
  let next: StoredWreck[] | undefined;
  for (let index = 0; index < wrecks.length; index++) {
    const wreck = wrecks[index]!;
    const atIndex = previous[index];
    const stored =
      atIndex?.id === wreck.id ? atIndex : previous.find((entry) => entry.id === wreck.id);
    const current = stored && matchesWreck(wreck, stored) ? stored : captureWreck(wreck);
    if (next) next.push(current);
    else if (current !== atIndex) next = [...previous.slice(0, index), current];
  }
  return next ?? (previous.length === wrecks.length ? previous : previous.slice(0, wrecks.length));
}

export class WreckClaimRegistry {
  private readonly claims = new Map<string, WreckClaim>();
  private readonly fields = new Map<string, StoredField>();

  private key(fieldId: string, wreckId: string): string {
    return JSON.stringify([fieldId, wreckId]);
  }

  /** Persist the same wreck map and the depletion/scan status across visits. */
  seedFor(locationId: string, preferredSeed: number): number {
    return this.fields.get(locationId)?.seed ?? preferredSeed;
  }

  rememberField(field: SalvageField, drone?: SecurityDroneCheckpoint): void {
    const previous = this.fields.get(field.sourceLocationId);
    // These private snapshots are cloned on ingress and egress, never mutated.
    // Reuse unchanged snapshots when refreshing only the wreck inventory.
    this.fields.set(field.sourceLocationId, {
      locationId: field.sourceLocationId,
      seed: field.seed,
      ...(drone
        ? { drone: structuredClone(drone) }
        : previous?.seed === field.seed && previous.drone
          ? { drone: previous.drone }
          : {}),
      ...(previous?.seed === field.seed && previous.securityEscorts
        ? { securityEscorts: previous.securityEscorts }
        : {}),
      ...(previous?.seed === field.seed && previous.workers ? { workers: previous.workers } : {}),
      wrecks: captureWrecks(
        field.wrecks,
        previous?.seed === field.seed ? previous.wrecks : undefined
      ),
    });
  }

  rememberWorkers(field: SalvageField, workers: readonly LocalNpcSalvagerState[]): void {
    const stored = this.fields.get(field.sourceLocationId);
    if (stored?.seed === field.seed)
      this.fields.set(field.sourceLocationId, { ...stored, workers: structuredClone(workers) });
  }

  workerCheckpoint(field: SalvageField): readonly LocalNpcSalvagerState[] {
    const stored = this.fields.get(field.sourceLocationId);
    return stored?.seed === field.seed ? structuredClone(stored.workers ?? []) : [];
  }

  storedSeed(locationId: string): number | undefined {
    return this.fields.get(locationId)?.seed;
  }

  droneLocations(): readonly { readonly locationId: string; readonly seed: number }[] {
    return [...this.fields.values()]
      .filter((field) => field.drone)
      .map((field) => ({ locationId: field.locationId, seed: field.seed }));
  }

  rememberDrone(locationId: string, checkpoint: SecurityDroneCheckpoint): void {
    const field = this.fields.get(locationId);
    if (field) this.fields.set(locationId, { ...field, drone: structuredClone(checkpoint) });
  }

  rememberSecurityEscorts(locationId: string, checkpoint: LocalPirateCheckpoint): void {
    const field = this.fields.get(locationId);
    if (field && field.seed === checkpoint.seed)
      this.fields.set(locationId, { ...field, securityEscorts: structuredClone(checkpoint) });
  }

  securityEscortCheckpoint(locationId: string): LocalPirateCheckpoint | null {
    const saved = this.fields.get(locationId)?.securityEscorts;
    return saved ? structuredClone(saved) : null;
  }

  droneCheckpoint(locationId: string): SecurityDroneCheckpoint | null {
    const saved = this.fields.get(locationId)?.drone;
    return saved ? structuredClone(saved) : null;
  }

  restoreField(field: SalvageField): void {
    const saved = this.fields.get(field.sourceLocationId);
    if (!saved || saved.seed !== field.seed) return;
    const wrecks = new Map(saved.wrecks.map((wreck) => [wreck.id, wreck]));
    for (const wreck of field.wrecks) {
      const previous = wrecks.get(wreck.id);
      if (!previous) continue;
      restoreWreckResources(wreck, previous);
      wreck.componentStatus = previous.componentStatus;
      wreck.inspected = previous.inspected;
      wreck.scanLevel = previous.scanLevel;
    }
  }

  claim(fieldId: string, wreckId: string, day: number): WreckClaim | null {
    const claim = this.claims.get(this.key(fieldId, wreckId));
    return claim && claim.expiresDay > day ? { ...claim } : null;
  }

  register(
    field: SalvageField,
    wreck: SalvageWreck,
    ownerId: string,
    day: number,
    credits: number,
    fee = CLAIM_FEE
  ): WreckClaimResult {
    if (wreck.combatWreckVariant || isCombatWreckId(wreck.id))
      return { ok: false, reason: 'combat-wreck' };
    if (!wreck.inspected && wreck.scanLevel !== 'analyzed') {
      return { ok: false, reason: 'unscanned' };
    }
    if (
      !wreck.resources.some((resource) => resource.remainingAmount > 0) &&
      wreck.componentStatus !== 'available'
    )
      return { ok: false, reason: 'empty' };
    if (this.claim(field.id, wreck.id, day)) return { ok: false, reason: 'occupied' };
    if (credits < fee) return { ok: false, reason: 'unaffordable' };
    this.claims.set(this.key(field.id, wreck.id), {
      fieldId: field.id,
      wreckId: wreck.id,
      ownerId,
      registeredDay: day,
      expiresDay: day + CLAIM_DURATION_DAYS,
    });
    this.rememberField(field);
    return { ok: true, fee };
  }

  abandon(fieldId: string, wreckId: string, ownerId: string): boolean {
    const key = this.key(fieldId, wreckId);
    if (this.claims.get(key)?.ownerId !== ownerId) return false;
    return this.claims.delete(key);
  }

  snapshot(day: number): readonly WreckClaim[] {
    return [...this.claims.values()]
      .filter((claim) => claim.expiresDay > day)
      .map((claim) => ({ ...claim }));
  }

  exportState(): WreckClaimCheckpoint {
    return {
      version: 1,
      claims: [...this.claims.values()].map((claim) => ({ ...claim })),
      fields: [...this.fields.entries()].map(([id, field]) => [
        id,
        {
          ...field,
          ...(field.drone ? { drone: structuredClone(field.drone) } : {}),
          ...(field.securityEscorts
            ? { securityEscorts: structuredClone(field.securityEscorts) }
            : {}),
          ...(field.workers ? { workers: structuredClone(field.workers) } : {}),
          wrecks: field.wrecks.map((wreck) => ({
            ...wreck,
            resources: { ...wreck.resources },
            ...(wreck.capacities ? { capacities: { ...wreck.capacities } } : {}),
          })),
        },
      ]),
    };
  }

  restoreState(saved: WreckClaimCheckpoint): void {
    this.claims.clear();
    this.fields.clear();
    for (const claim of saved.claims) {
      if (!isCombatWreckId(claim.wreckId))
        this.claims.set(this.key(claim.fieldId, claim.wreckId), { ...claim });
    }
    for (const [id, field] of saved.fields) {
      this.fields.set(id, {
        ...field,
        ...(field.drone ? { drone: structuredClone(field.drone) } : {}),
        ...(field.securityEscorts
          ? { securityEscorts: structuredClone(field.securityEscorts) }
          : {}),
        ...(field.workers ? { workers: structuredClone(field.workers) } : {}),
        wrecks: field.wrecks.map((wreck) => ({
          ...wreck,
          resources: { ...wreck.resources },
          ...(wreck.capacities ? { capacities: { ...wreck.capacities } } : {}),
        })),
      });
    }
  }
}

function restoreWreckResources(wreck: SalvageWreck, previous: StoredWreck): void {
  const known = new Set(wreck.resources.map((resource) => resource.resourceId));
  for (const resource of wreck.resources) {
    const capacity = previous.capacities?.[resource.resourceId];
    const amount = previous.resources[resource.resourceId];
    if (capacity !== undefined) resource.initialAmount = capacity;
    if (amount !== undefined)
      resource.remainingAmount = Math.min(resource.initialAmount, Math.max(0, amount));
  }
  for (const [resourceId, amount] of Object.entries(previous.resources)) {
    if (known.has(resourceId)) continue;
    const initialAmount = previous.capacities?.[resourceId] ?? amount;
    wreck.resources.push({
      resourceId,
      initialAmount,
      remainingAmount: Math.min(initialAmount, amount),
    });
  }
}

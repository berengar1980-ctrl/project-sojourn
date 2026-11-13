import type { LocalAsteroid } from '../../core/local-space-types';

/**
 * A claim concerns one physically scanned rock, not an entire mining location.
 * The world owner keeps this registry across local-space visits.
 */
export interface AsteroidClaim {
  readonly locationId: string;
  readonly asteroidId: string;
  readonly ownerId: string;
  readonly registeredDay: number;
  readonly oreAtRegistration: Readonly<Record<string, number>>;
}
export interface AsteroidClaimConflict {
  readonly locationId: string;
  readonly asteroidId: string;
  readonly rightfulOwnerId: string;
  readonly intruderId: string;
  readonly stolenOre: number;
  readonly compensation: number;
  readonly status: 'detected' | 'paid' | 'fight' | 'escaped';
}
export type ClaimResult =
  | { readonly ok: true; readonly fee: number }
  | { readonly ok: false; readonly reason: 'unscanned' | 'empty' | 'occupied' | 'unaffordable' };

export class AsteroidClaimRegistry {
  private readonly claims = new Map<string, AsteroidClaim>();
  private readonly disputes = new Map<string, AsteroidClaimConflict>();
  private readonly remainingOre = new Map<string, Record<string, number>>();
  private readonly surveyLevels = new Map<string, LocalAsteroid['scanLevel']>();
  private readonly fieldSeeds = new Map<string, number>();

  private key(locationId: string, asteroidId: string): string {
    return JSON.stringify([locationId, asteroidId]);
  }
  private disputeKey(locationId: string, asteroidId: string, intruderId: string): string {
    return JSON.stringify([locationId, asteroidId, intruderId]);
  }

  /** Use the same physical field every time the player returns. */
  seedFor(locationId: string, generate: () => number): number {
    const existing = this.fieldSeeds.get(locationId);
    if (existing !== undefined) return existing;
    const seed = generate();
    this.fieldSeeds.set(locationId, seed);
    return seed;
  }

  /** Capture depleted ore and scan knowledge before destroying the local scene. */
  rememberField(locationId: string, asteroids: readonly LocalAsteroid[]): void {
    for (const asteroid of asteroids) {
      if (asteroid.kind !== 'resource') continue;
      const key = this.key(locationId, asteroid.id);
      this.remainingOre.set(
        key,
        Object.fromEntries(asteroid.deposits.map((d) => [d.resourceId, d.oreRemaining]))
      );
      this.surveyLevels.set(key, asteroid.scanLevel);
    }
  }

  /** Restore the same remaining ore; never regenerate a previously depleted claim. */
  restoreField(locationId: string, asteroids: LocalAsteroid[]): void {
    for (const asteroid of asteroids) {
      const key = this.key(locationId, asteroid.id);
      const remaining = this.remainingOre.get(key);
      if (remaining) {
        for (const deposit of asteroid.deposits) {
          if (remaining[deposit.resourceId] !== undefined) {
            deposit.oreRemaining = Math.max(0, Math.min(deposit.oreCapacity, remaining[deposit.resourceId]!));
          }
        }
      }
      const scanLevel = this.surveyLevels.get(key);
      if (scanLevel) asteroid.scanLevel = scanLevel;
    }
  }

  claim(locationId: string, asteroid: LocalAsteroid): AsteroidClaim | null {
    return this.claims.get(this.key(locationId, asteroid.id)) ?? null;
  }

  register(
    locationId: string,
    asteroid: LocalAsteroid,
    ownerId: string,
    day: number,
    credits: number,
    fee = 2500
  ): ClaimResult {
    const key = this.key(locationId, asteroid.id);
    if (asteroid.kind !== 'resource' || asteroid.scanLevel !== 'analyzed')
      return { ok: false, reason: 'unscanned' };
    const ore = Object.fromEntries(
      asteroid.deposits.filter((d) => d.oreRemaining > 0).map((d) => [d.resourceId, d.oreRemaining])
    );
    if (!Object.keys(ore).length) return { ok: false, reason: 'empty' };
    if (this.claims.has(key)) return { ok: false, reason: 'occupied' };
    if (credits < fee) return { ok: false, reason: 'unaffordable' };
    this.claims.set(key, {
      locationId,
      asteroidId: asteroid.id,
      ownerId,
      registeredDay: day,
      oreAtRegistration: ore,
    });
    return { ok: true, fee };
  }

  abandon(locationId: string, asteroidId: string, ownerId: string): boolean {
    const key = this.key(locationId, asteroidId);
    if (this.claims.get(key)?.ownerId !== ownerId) return false;
    this.claims.delete(key);
    return true;
  }

  /** Unauthorized extraction is theft, not an automatic mining royalty. */
  recordTheft(
    locationId: string,
    asteroidId: string,
    intruderId: string,
    quantity: number,
    detected: boolean,
    unitValue: number
  ): AsteroidClaimConflict | null {
    const key = this.key(locationId, asteroidId);
    const claim = this.claims.get(key);
    if (!claim || claim.ownerId === intruderId || quantity <= 0 || !detected) return null;
    const disputeKey = this.disputeKey(locationId, asteroidId, intruderId);
    const previous = this.disputes.get(disputeKey);
    const compensation = Math.max(1, Math.ceil(quantity * Math.max(0, unitValue) * 1.5));
    const conflict: AsteroidClaimConflict = {
      locationId,
      asteroidId,
      rightfulOwnerId: claim.ownerId,
      intruderId,
      stolenOre: quantity + (previous?.status === 'detected' ? previous.stolenOre : 0),
      compensation: compensation + (previous?.status === 'detected' ? previous.compensation : 0),
      status: 'detected',
    };
    this.disputes.set(disputeKey, conflict);
    return { ...conflict };
  }

  resolveConflict(
    locationId: string,
    asteroidId: string,
    intruderId: string,
    choice: 'paid' | 'fight' | 'escaped'
  ): AsteroidClaimConflict | null {
    const disputeKey = this.disputeKey(locationId, asteroidId, intruderId);
    const dispute = this.disputes.get(disputeKey);
    if (!dispute || dispute.status !== 'detected' || dispute.intruderId !== intruderId) return null;
    const result = { ...dispute, status: choice };
    this.disputes.set(disputeKey, result);
    return { ...result };
  }

  snapshot() {
    return {
      claims: [...this.claims.values()].map((c) => ({
        ...c,
        oreAtRegistration: { ...c.oreAtRegistration },
      })),
      conflicts: [...this.disputes.values()].map((c) => ({ ...c })),
    };
  }
}

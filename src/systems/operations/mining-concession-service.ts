import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';
import { miningResourceById } from '../../data/resources/mining-resources';

export const CONCESSION_FEE = 2500;
export const PROSPECT_FEE = 100;
export interface MiningDeposit {
  resourceId: string;
  initial: number;
  remaining: number;
  estimateLow: number;
  estimateHigh: number;
}
export interface MiningConcession {
  locationId: string;
  ownerId: string;
  claimed: boolean;
  deposits: MiningDeposit[];
  royalties: number;
}
/** Finite deposits do not create resources: allocation still goes through circulation. */
export class MiningConcessionService {
  private discoveries: MiningConcession[] = [];
  private day = 0;
  private sequence = 0;
  constructor(
    private readonly world: WorldMap,
    private readonly player: PlayerEconomyState,
    private readonly npcs: readonly SectorNpcState[]
  ) {}
  snapshot() {
    return {
      sequence: this.sequence,
      day: this.day,
      discoveries: this.discoveries.map((d) => ({
        ...d,
        deposits: d.deposits.map((p) => ({ ...p })),
      })),
    };
  }
  private wallet(id: string) {
    return id === 'player' ? this.player : this.npcs.find((n) => n.id === id);
  }
  prospect(ownerId: string, locationId: string, skill = 50): boolean {
    const site = this.world.locations.find((l) => l.id === locationId && l.activities.mine);
    const wallet = this.wallet(ownerId);
    if (!site || !wallet || wallet.credits < PROSPECT_FEE || !Number.isFinite(skill)) return false;
    if (
      this.discoveries.some(
        (d) => d.locationId === locationId && (d.ownerId === ownerId || d.claimed)
      )
    )
      return false;
    const ids = site.minedResourceIds ?? ['ferrite'];
    const uncertainty = 0.34 - Math.max(0, Math.min(100, skill)) * 0.0018;
    const deposits = ids.slice(0, 3).map((resourceId, index) => {
      const actual = 80 + ((locationId.length * 31 + this.sequence * 17 + index * 43) % 160);
      return {
        resourceId,
        initial: actual,
        remaining: actual,
        estimateLow: Math.floor(actual * (1 - uncertainty)),
        estimateHigh: Math.ceil(actual * (1 + uncertainty)),
      };
    });
    if (!deposits.length) return false;
    wallet.credits -= PROSPECT_FEE;
    this.sequence++;
    this.discoveries.push({ ownerId, locationId, claimed: false, deposits, royalties: 0 });
    return true;
  }
  claim(ownerId: string, locationId: string): boolean {
    const discovery = this.discoveries.find(
      (d) => d.ownerId === ownerId && d.locationId === locationId && !d.claimed
    );
    const wallet = this.wallet(ownerId);
    if (!discovery || !wallet || wallet.credits < CONCESSION_FEE) return false;
    if (this.discoveries.some((d) => d.locationId === locationId && d.claimed)) return false;
    wallet.credits -= CONCESSION_FEE;
    discovery.claimed = true;
    this.discoveries = this.discoveries.filter(
      (d) => d.locationId !== locationId || d === discovery
    );
    return true;
  }
  abandon(ownerId: string, locationId: string): boolean {
    const before = this.discoveries.length;
    this.discoveries = this.discoveries.filter(
      (d) => d.ownerId !== ownerId || d.locationId !== locationId
    );
    return this.discoveries.length < before;
  }
  private active(ownerId: string, locationId: string) {
    return this.discoveries.find(
      (d) => d.locationId === locationId && (d.claimed || d.ownerId === ownerId)
    );
  }
  allowance(ownerId: string, locationId: string, resourceId: string, requested: number): number {
    if (!Number.isFinite(requested) || requested <= 0) return 0;
    const discovery = this.active(ownerId, locationId);
    if (!discovery) return Math.floor(requested);
    const deposit = discovery.deposits.find((d) => d.resourceId === resourceId);
    if (!deposit) return 0;
    const fee = this.royalty(resourceId);
    const affordable =
      discovery.ownerId === ownerId
        ? requested
        : Math.floor((this.wallet(ownerId)?.credits ?? 0) / fee);
    return Math.max(0, Math.min(Math.floor(requested), deposit.remaining, affordable));
  }
  private royalty(resourceId: string): number {
    return Math.max(1, Math.round((miningResourceById(resourceId)?.baseValue ?? 10) * 0.1));
  }
  recordExtraction(ownerId: string, locationId: string, resourceId: string, amount: number): void {
    const discovery = this.active(ownerId, locationId);
    const deposit = discovery?.deposits.find((d) => d.resourceId === resourceId);
    if (!discovery || !deposit || amount <= 0 || !Number.isSafeInteger(amount)) return;
    const extracted = this.allowance(ownerId, locationId, resourceId, amount);
    if (discovery.ownerId !== ownerId) {
      const payer = this.wallet(ownerId),
        owner = this.wallet(discovery.ownerId);
      if (!payer || !owner) return;
      const fee = extracted * this.royalty(resourceId);
      payer.credits -= fee;
      owner.credits += fee;
      discovery.royalties += fee;
    }
    deposit.remaining -= extracted;
    if (discovery.deposits.every((d) => d.remaining === 0))
      this.abandon(discovery.ownerId, locationId);
  }
  depart(locationId: string | null): void {
    this.discoveries = this.discoveries.filter(
      (d) => d.claimed || d.ownerId !== 'player' || d.locationId === locationId
    );
  }
  advanceDay(day: number): void {
    if (!Number.isSafeInteger(day) || day <= this.day) return;
    this.day = day;
    for (const n of this.npcs.filter(
      (npc) =>
        npc.job === 'miner' &&
        !npc.travel &&
        !npc.combatMovement &&
        npc.retiredUntilDay === undefined
    )) {
      if (n.credits < CONCESSION_FEE * 3 || n.locationId !== n.workLocationId) continue;
      if (this.discoveries.some((d) => d.locationId === n.locationId && d.claimed)) continue;
      this.prospect(n.id, n.locationId, 45);
      this.claim(n.id, n.locationId);
    }
  }
}

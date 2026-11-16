import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { EconomyMarketService } from '../economy/market-service';
import type { NpcSectorService } from '../npcs/npc-sector-service';
export type { BlockadeOrder } from './career-operations-checkpoint';
import {
  stageCareerBlockades,
  type CareerBlockadeCheckpoint,
  type BlockadeOrder,
} from './career-operations-checkpoint';

export interface BlockadeOptions {
  sector: NpcSectorService;
  markets: EconomyMarketService;
  player: PlayerEconomyState;
  recordLoss: (resourceId: string, amount: number) => void;
  notice: (message: string) => void;
}
const ongoing = (order: BlockadeOrder) => ['assembling', 'active'].includes(order.phase);
const fit = (npc: SectorNpcState) =>
  npc.hullHp > npc.hullMaxHp * 0.4 &&
  !npc.combatMovement &&
  !(npc.combatRecoverySeconds ?? 0) &&
  npc.retiredUntilDay === undefined;

/** Contracts own assignments; ships, cargo and combat remain owned by existing services. */
export class BlockadeService {
  private orders: BlockadeOrder[] = [];
  private day = 0;
  private sequence = 0;
  private houseAlarm: Record<string, number> = { veylan: 0, mercator: 0 };
  constructor(
    private readonly options: BlockadeOptions,
    checkpoint?: CareerBlockadeCheckpoint
  ) {
    if (checkpoint) {
      const saved = stageCareerBlockades(checkpoint, options);
      this.sequence = saved.sequence;
      this.day = saved.day;
      this.orders = saved.orders.map((order) => ({
        ...order,
        pirateIds: [...order.pirateIds],
      }));
      this.houseAlarm = { ...saved.houseAlarm };
    }
  }
  exportState(): CareerBlockadeCheckpoint {
    return {
      version: 1,
      sequence: this.sequence,
      day: this.day,
      orders: this.orders.map((order) => ({
        ...order,
        pirateIds: [...order.pirateIds],
      })),
      houseAlarm: { ...this.houseAlarm },
    };
  }
  snapshot() {
    return {
      sequence: this.sequence,
      day: this.day,
      orders: this.orders.map((o) => ({
        ...o,
        pirateIds: [...o.pirateIds],
        currentPrice: this.options.markets.getEntry(o.locationId, o.resourceId)?.price ?? 0,
      })),
      houseAlarm: { ...this.houseAlarm },
    };
  }
  assigned(id: string): boolean {
    return this.orders.some((o) => ongoing(o) && o.pirateIds.includes(id));
  }
  mayAttack(id: string): boolean {
    const order = this.orders.find((o) => ongoing(o) && o.pirateIds.includes(id));
    return !order || (order.phase === 'active' && this.present(order).some((n) => n.id === id));
  }
  protectsOwner(pirateId: string, ownerId: string): boolean {
    return this.orders.some(
      (o) => ongoing(o) && o.ownerId === ownerId && o.pirateIds.includes(pirateId)
    );
  }
  blocksTrader(ownerId: string, locationId: string, resourceId?: string): boolean {
    return this.orders.some(
      (o) =>
        o.phase === 'active' &&
        o.ownerId !== ownerId &&
        o.locationId === locationId &&
        (!resourceId || o.resourceId === resourceId) &&
        this.present(o).length > 0
    );
  }
  protectsPlayer(id: string): boolean {
    return this.orders.some(
      (o) => ongoing(o) && o.ownerId === 'player' && o.pirateIds.includes(id)
    );
  }
  available(): SectorNpcState[] {
    return this.options.sector.npcs.filter(
      (n) => n.pirate && fit(n) && !n.travel && !this.assigned(n.id)
    );
  }
  quote(ids: readonly string[], duration: number): number | null {
    if (
      ![7, 10, 14].includes(duration) ||
      ids.length < 1 ||
      ids.length > 3 ||
      new Set(ids).size !== ids.length
    )
      return null;
    const available = this.available();
    if (ids.some((id) => !available.some((n) => n.id === id))) return null;
    return ids.reduce((sum, id) => {
      const n = available.find((candidate) => candidate.id === id)!;
      const heavy = n.hullMaxHp >= 200;
      return sum + (heavy ? 900 : 450) + duration * (heavy ? 70 : 45);
    }, 0);
  }
  order(
    ownerId: string,
    locationId: string,
    resourceId: string,
    ids: readonly string[],
    duration: number
  ): boolean {
    const { sector, markets, player } = this.options;
    const fee = this.quote(ids, duration);
    const market = markets.getMarket(locationId);
    const owner =
      ownerId === 'player'
        ? player
        : sector.npcs.find((n) => n.id === ownerId && n.job === 'freighter' && fit(n));
    if (!owner || fee === null || owner.credits < fee || !market?.needs.has(resourceId))
      return false;
    if (
      this.orders.some((o) => ongoing(o) && (o.ownerId === ownerId || o.locationId === locationId))
    )
      return false;
    const ships = ids.map((id) => sector.npcs.find((n) => n.id === id)!);
    if (ships.some((n) => !sector.quoteTravel(n, locationId))) return false;
    // Validate all routes before spending. Travel uses the same current quote and fuel state.
    owner.credits -= fee;
    for (const [index, n] of ships.entries()) {
      n.credits += Math.floor(fee / ships.length) + (index === 0 ? fee % ships.length : 0);
      if (n.locationId !== locationId) sector.requestTravel(n, locationId, 'Blockade · Anflug');
    }
    this.orders.push({
      id: 'blockade-' + ++this.sequence,
      ownerId,
      locationId,
      resourceId,
      pirateIds: [...ids],
      duration,
      fee,
      orderedDay: this.day,
      startedDay: null,
      phase: 'assembling',
      removedStock: 0,
      startPrice: null,
    });
    this.options.notice(
      'BLOCKADE > Auftrag erteilt · Einsatzdauer beginnt nach vollständiger Ankunft'
    );
    return true;
  }
  cancel(id: string): boolean {
    const order = this.orders.find((o) => o.id === id && o.ownerId === 'player' && ongoing(o));
    if (!order) return false;
    order.phase = 'cancelled';
    return true;
  }
  blocks(locationId: string, resourceId: string): boolean {
    return this.orders.some(
      (o) =>
        o.phase === 'active' &&
        o.locationId === locationId &&
        o.resourceId === resourceId &&
        this.present(o).length > 0
    );
  }
  private present(order: BlockadeOrder) {
    return this.options.sector.npcs.filter(
      (n) =>
        order.pirateIds.includes(n.id) && fit(n) && !n.travel && n.locationId === order.locationId
    );
  }
  private update(order: BlockadeOrder): void {
    const { sector } = this.options;
    const ships = sector.npcs.filter((n) => order.pirateIds.includes(n.id));
    const lost = ships.filter(
      (n) => n.hullHp <= 0 || (n.combatRecoverySeconds ?? 0) > 0 || n.retiredUntilDay !== undefined
    );
    if (lost.length === ships.length || (order.phase === 'assembling' && lost.length > 0)) {
      order.phase = 'defeated';
      this.options.notice('BLOCKADE > Einsatzgruppe geschlagen · ' + order.locationId);
      return;
    }
    if (order.phase === 'assembling' && this.day - order.orderedDay >= 10) {
      order.phase = 'cancelled';
      return;
    }
    if (order.startedDay !== null && this.day >= order.startedDay + order.duration) {
      order.phase = 'completed';
      return;
    }
    for (const n of ships.filter(fit)) {
      if (n.travel) continue;
      if (n.locationId !== order.locationId)
        sector.requestTravel(n, order.locationId, 'Blockade · Rückkehr');
      else {
        n.activityId = 'blockade';
        n.activity =
          order.phase === 'active' ? 'Versorgungsblockade' : 'Blockade · wartet auf Einsatzgruppe';
      }
    }
    if (order.phase === 'assembling' && this.present(order).length === order.pirateIds.length) {
      order.startPrice =
        this.options.markets.getEntry(order.locationId, order.resourceId)?.price ?? null;
      order.phase = 'active';
      order.startedDay = this.day;
      this.options.notice(
        'BLOCKADE > Aktiv · ' + order.locationId + ' · ' + order.duration + ' Tage'
      );
    }
  }
  tick(): void {
    for (const o of this.orders.filter(ongoing)) this.update(o);
  }
  private raid(order: BlockadeOrder): void {
    const ships = this.present(order);
    if (!ships.length) return;
    const { markets, sector } = this.options;
    const entry = markets.getEntry(order.locationId, order.resourceId);
    if (!entry) return;
    const removed = Math.min(entry.stock, ships.length * 12);
    entry.stock -= removed;
    this.options.recordLoss(order.resourceId, removed);
    order.removedStock += removed;
    markets.recalculate(order.locationId, order.resourceId);
    for (const house of ['veylan', 'mercator']) {
      if (
        !sector.npcs.some(
          (n) =>
            n.tradeCharter === house &&
            (n.locationId === order.locationId || n.travel?.finalTargetId === order.locationId)
        )
      )
        continue;
      this.houseAlarm[house] = Math.min(100, (this.houseAlarm[house] ?? 0) + 5);
      this.options.notice('HANDELSHAUS > ' + house + ' fordert Entsatz für ' + order.locationId);
    }
    const patrol = sector.npcs.find((n) => n.job === 'patrol' && !n.pirate && fit(n) && !n.travel);
    if (patrol && patrol.locationId !== order.locationId)
      sector.requestTravel(patrol, order.locationId, 'Entsatz · Korsarenblockade');
  }
  private npcContract(): void {
    if (this.day % 7 !== 0) return;
    const pirate = this.available()[0];
    if (!pirate) return;
    for (const n of this.options.sector.npcs.filter(
      (candidate) => candidate.job === 'freighter' && candidate.aggression >= 45
    )) {
      const opportunities = this.options.markets
        .snapshot()
        .flatMap((m) => [...m.needs].map((resourceId) => ({ m, resourceId })))
        .filter(
          ({ m, resourceId }) =>
            m.locationId !== n.locationId &&
            (n.cargo[resourceId] ?? 0) * (m.entries[resourceId]?.price ?? 0) * 0.25 >
              (this.quote([pirate.id], 7) ?? Infinity)
        );
      const target = opportunities[0];
      if (target && this.order(n.id, target.m.locationId, target.resourceId, [pirate.id], 7)) break;
    }
  }
  advanceDay(day: number): void {
    if (!Number.isSafeInteger(day) || day <= this.day) return;
    while (this.day < day) {
      this.day++;
      this.tick();
      for (const o of this.orders.filter((order) => order.phase === 'active')) this.raid(o);
      this.npcContract();
    }
  }
}

import type { SectorNpcState } from '../../core/npc-types';
import { economyResourceById, isIllegalResource } from '../../data/economy/economy-resources';
import type { NpcSectorService } from '../npcs/npc-sector-service';

export interface NpcSmugglingStats {
  inspections: number;
  cleanInspections: number;
  confiscatedUnits: number;
  finesPaid: number;
  escaped: number;
  resisted: number;
  illegalUnitsSold: number;
  protectionFees: number;
}

export function smugglingInspectorStrength(npc: SectorNpcState): number {
  return Math.max(0.35, Math.min(0.9, 0.48 + npc.aggression / 220));
}

export function npcSmugglingScan(
  target: SectorNpcState,
  strength: number,
  random: () => number
): readonly { id: string; qty: number }[] {
  const concealment = Math.max(0, Math.min(0.9, target.smugglingConcealment ?? 0));
  const suspicion = Math.max(0, Math.min(100, target.smugglingSuspicion ?? 0));
  return Object.entries(target.cargo)
    .filter(([id, value]) => isIllegalResource(id) && value > 0)
    .flatMap(([id, qty]) => {
      const signal = Math.min(1, qty / Math.max(1, target.cargoCapacity));
      const chance = Math.max(
        0.04,
        Math.min(0.96, 0.18 + strength * 0.62 + signal * 0.2 + suspicion * 0.002 - concealment * 0.58)
      );
      return random() < chance ? [{ id, qty: Math.floor(qty) }] : [];
    });
}

export function resolveNpcSmugglingInspection(
  target: SectorNpcState,
  patrol: SectorNpcState | null,
  strength: number,
  random: () => number = Math.random
): 'clear' | 'seized' | 'escaped' | 'resisted' {
  target.smugglingInspections = (target.smugglingInspections ?? 0) + 1;
  const detected = npcSmugglingScan(target, strength, random);
  if (detected.length === 0) {
    target.smugglingSuspicion = Math.max(0, (target.smugglingSuspicion ?? 0) - 2);
    target.activity = 'Zollkontrolle ohne Befund';
    return 'clear';
  }
  const value = detected.reduce(
    (sum, item) => sum + item.qty * (economyResourceById(item.id)?.basePrice ?? 0),
    0
  );
  const pressure = value / Math.max(1, value + target.credits);
  const aggression = target.aggression / 100;
  const flightChance = Math.min(0.62, 0.1 + aggression * 0.2 + pressure * 0.3);
  const resistChance = Math.min(0.3, 0.03 + aggression * 0.16 + pressure * 0.08);
  const decision = random();
  const resisting = Boolean(patrol && decision < resistChance);
  const fleeing = Boolean(patrol && !resisting && decision < resistChance + flightChance);
  if (fleeing || resisting) {
    const speedAdvantage = patrol ? (target.fuelCapacity - patrol.fuelCapacity) / 200 : 0;
    const escapeChance = Math.max(0.1, Math.min(0.9, 0.5 + speedAdvantage));
    if (random() < (resisting ? escapeChance * 0.55 : escapeChance)) {
      target.smugglingSuspicion = Math.min(100, (target.smugglingSuspicion ?? 0) + (resisting ? 28 : 18));
      target.activity = resisting ? 'Zollwiderstand: Flucht gelungen' : 'Flottenkontrolle entkommen';
      target.smugglingEscapes = (target.smugglingEscapes ?? 0) + 1;
      if (resisting) {
        target.hullHp = Math.max(1, target.hullHp - Math.ceil(target.hullMaxHp * 0.12));
      }
      return resisting ? 'resisted' : 'escaped';
    }
  }
  let seized = 0;
  for (const item of detected) {
    const held = Math.max(0, Math.floor(target.cargo[item.id] ?? 0));
    const qty = Math.min(held, item.qty);
    seized += qty;
    if (held > qty) target.cargo[item.id] = held - qty;
    else delete target.cargo[item.id];
  }
  const fine = Math.round((50000 + value * 1.5) * (resisting ? 1.5 : fleeing ? 1.25 : 1));
  const paid = Math.min(Math.max(0, target.credits), fine);
  target.credits -= paid;
  target.smugglingFinesPaid = (target.smugglingFinesPaid ?? 0) + paid;
  target.smugglingUnpaidFines = (target.smugglingUnpaidFines ?? 0) + fine - paid;
  target.smugglingConfiscated = (target.smugglingConfiscated ?? 0) + seized;
  target.smugglingSuspicion = Math.min(
    100,
    (target.smugglingSuspicion ?? 0) + (resisting ? 35 : fleeing ? 20 : 8)
  );
  if (resisting) {
    target.hullHp = Math.max(1, target.hullHp - Math.ceil(target.hullMaxHp * 0.22));
  }
  target.activity = 'Zoll: ' + seized + ' t beschlagnahmt · Strafe ' + paid + ' CR';
  return 'seized';
}

export interface NpcSmugglingService {
  readonly stats: NpcSmugglingStats;
  tick(deltaSeconds: number): void;
  advanceDay(day: number): void;
  recordSale(npc: SectorNpcState, resourceId: string, quantity: number, gross: number): void;
}

/** Real NPC movement and real market inventory are shared with the existing economy. */
export function createNpcSmugglingService(
  npcs: readonly SectorNpcState[],
  sector: Pick<NpcSectorService, 'livePosition'>,
  log: (message: string) => void = () => {},
  random: () => number = Math.random
): NpcSmugglingService {
  const stats: NpcSmugglingStats = {
    inspections: 0, cleanInspections: 0, confiscatedUnits: 0, finesPaid: 0,
    escaped: 0, resisted: 0, illegalUnitsSold: 0, protectionFees: 0,
  };
  const elapsed = new Map<string, number>();
  const lastArrival = new Map<string, string>();
  const inspectionCooldown = new Map<string, number>();
  let simulationSeconds = 0;
  let day = 0;
  const inspect = (target: SectorNpcState, patrol: SectorNpcState | null, strength: number) => {
    const beforeSeized = target.smugglingConfiscated ?? 0;
    const beforeFines = target.smugglingFinesPaid ?? 0;
    const result = resolveNpcSmugglingInspection(target, patrol, strength, random);
    inspectionCooldown.set(target.id, simulationSeconds + (result === 'clear' ? 12 : 24));
    stats.inspections++;
    stats.confiscatedUnits += (target.smugglingConfiscated ?? 0) - beforeSeized;
    stats.finesPaid += (target.smugglingFinesPaid ?? 0) - beforeFines;
    if (result === 'clear') stats.cleanInspections++;
    if (result === 'escaped') stats.escaped++;
    if (result === 'resisted') stats.resisted++;
    if (result !== 'clear') log('SEKTOR-ZOLL > ' + target.name.toUpperCase() + ' · ' + target.activity.toUpperCase());
  };
  return {
    stats,
    advanceDay(nextDay) {
      const days = Math.max(0, Math.floor(nextDay) - day);
      if (days === 0) return;
      day += days;
      for (const npc of npcs) {
        npc.smugglingSuspicion = Math.max(0, (npc.smugglingSuspicion ?? 0) - days * 0.5);
      }
    },
    recordSale(npc, resourceId, quantity, gross) {
      if (!npc.smuggler || !isIllegalResource(resourceId) || quantity <= 0) return;
      stats.illegalUnitsSold += quantity;
      npc.smugglingSuspicion = Math.min(100, (npc.smugglingSuspicion ?? 0) + 2);
      if (!npc.smugglingProtectionFaction) return;
      const fee = Math.max(0, Math.round(gross * 0.05));
      npc.credits = Math.max(0, npc.credits - fee);
      npc.smugglingProtectionFees = (npc.smugglingProtectionFees ?? 0) + fee;
      stats.protectionFees += fee;
      const gang = npcs.filter(x => x.pirate && x.factionId === npc.smugglingProtectionFaction);
      const distributed = Math.round(fee * 0.65);
      gang.forEach((pirate, i) => {
        pirate.credits += Math.floor(distributed / gang.length) + (i < distributed % gang.length ? 1 : 0);
      });
    },
    tick(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      simulationSeconds += dt;
      const patrols = npcs.filter(x => x.job === 'patrol' && !x.combatMovement && x.hullHp > 0);
      for (const target of npcs) {
        if (!target.smuggler || target.pirate || target.hullHp <= 0) continue;
        if ((inspectionCooldown.get(target.id) ?? 0) > simulationSeconds) continue;
        // Station customs: inspect a real arrival, not each simulated frame.
        const at = target.travel || target.combatMovement ? '' : target.locationId;
        const prior = lastArrival.get(target.id);
        if (at && prior !== at) {
          lastArrival.set(target.id, at);
          const security = at === 'blackjaw-outpost' || at === 'gallows-anchor'
            ? 0 : at === 'haven' || at === 'karth-industrial' || at === 'vigil-station' ? 0.76 : 0.48;
          if (security > 0 && random() < 0.05 + security * 0.38 + (target.smugglingSuspicion ?? 0) * 0.0035) {
            inspect(target, null, security);
          }
        } else if (!at) {
          lastArrival.set(target.id, '');
        }
        if (!target.travel || target.combatMovement) continue;
        const time = (elapsed.get(target.id) ?? 0) + dt;
        if (time < 4) {
          elapsed.set(target.id, time);
          continue;
        }
        elapsed.set(target.id, 0);
        const position = sector.livePosition(target);
        const nearest = patrols
          .filter(x => x.id !== target.id)
          .map(x => ({ npc: x, distance: Math.hypot(sector.livePosition(x).x - position.x, sector.livePosition(x).y - position.y) }))
          .filter(x => x.distance <= 650)
          .sort((a, b) => a.distance - b.distance)[0];
        if (!nearest || random() >= 0.07 + (target.smugglingSuspicion ?? 0) * 0.003) continue;
        inspect(target, nearest.npc, smugglingInspectorStrength(nearest.npc));
      }
    },
  };
}

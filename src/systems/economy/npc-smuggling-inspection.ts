import type { SectorNpcState } from '../../core/npc-types';
import { economyResourceById, isIllegalResource } from '../../data/economy/economy-resources';
import { npcOperationalSpeed } from '../npcs/npc-upgrade-service';

type Detection = { readonly id: string; readonly qty: number };
type InspectionOutcome = 'clear' | 'seized' | 'escaped' | 'resisted';
interface InspectionResponse {
  readonly flee: boolean;
  readonly resist: boolean;
}

export function smugglingInspectorStrength(npc: SectorNpcState): number {
  return Math.max(0.35, Math.min(0.9, 0.48 + npc.aggression / 220));
}

export function npcSmugglingScan(
  target: SectorNpcState,
  strength: number,
  random: () => number
): readonly Detection[] {
  const concealment = Math.max(0, Math.min(0.9, target.smugglingConcealment ?? 0));
  const suspicion = Math.max(0, Math.min(100, target.smugglingSuspicion ?? 0));
  return Object.entries(target.cargo)
    .filter(([id, value]) => isIllegalResource(id) && value > 0)
    .flatMap(([id, qty]) => {
      const signal = Math.min(1, qty / Math.max(1, target.cargoCapacity));
      const chance = Math.max(
        0.04,
        Math.min(
          0.96,
          0.18 + strength * 0.62 + signal * 0.2 + suspicion * 0.002 - concealment * 0.58
        )
      );
      return random() < chance ? [{ id, qty: Math.floor(qty) }] : [];
    });
}

function contrabandValue(detected: readonly Detection[]): number {
  return detected.reduce(
    (sum, item) => sum + item.qty * (economyResourceById(item.id)?.basePrice ?? 0),
    0
  );
}

function inspectionResponse(
  target: SectorNpcState,
  patrol: SectorNpcState | null,
  value: number,
  random: () => number
): InspectionResponse {
  if (!patrol) return { flee: false, resist: false };
  const pressure = value / Math.max(1, value + target.credits);
  const aggression = target.aggression / 100;
  const fleeChance = Math.min(0.62, 0.1 + aggression * 0.2 + pressure * 0.3);
  const resistChance = Math.min(0.3, 0.03 + aggression * 0.16 + pressure * 0.08);
  const roll = random();
  return {
    resist: roll < resistChance,
    flee: roll >= resistChance && roll < resistChance + fleeChance,
  };
}

function escapeInspection(
  target: SectorNpcState,
  patrol: SectorNpcState,
  resist: boolean,
  random: () => number
): boolean {
  const speedAdvantage = (npcOperationalSpeed(target) - npcOperationalSpeed(patrol)) * 0.08;
  const escapeChance = Math.max(
    0.1,
    Math.min(0.9, 0.5 + speedAdvantage + (target.aggression - 35) * 0.002)
  );
  if (random() >= (resist ? escapeChance * 0.55 : escapeChance)) return false;
  target.smugglingSuspicion = Math.min(100, (target.smugglingSuspicion ?? 0) + (resist ? 28 : 18));
  target.activity = resist ? 'Zollwiderstand: Flucht gelungen' : 'Flottenkontrolle entkommen';
  target.smugglingEscapes = (target.smugglingEscapes ?? 0) + 1;
  if (resist) target.hullHp = Math.max(1, target.hullHp - Math.ceil(target.hullMaxHp * 0.12));
  return true;
}

function seizeCargo(target: SectorNpcState, detected: readonly Detection[]): number {
  let seized = 0;
  for (const item of detected) {
    const held = Math.max(0, Math.floor(target.cargo[item.id] ?? 0));
    const amount = Math.min(held, item.qty);
    seized += amount;
    if (held > amount) target.cargo[item.id] = held - amount;
    else delete target.cargo[item.id];
  }
  return seized;
}

function settleConfiscation(
  target: SectorNpcState,
  detected: readonly Detection[],
  value: number,
  response: InspectionResponse
): InspectionOutcome {
  const seized = seizeCargo(target, detected);
  const fine = Math.round(
    (50000 + value * 1.5) * (response.resist ? 1.5 : response.flee ? 1.25 : 1)
  );
  const paid = Math.min(Math.max(0, target.credits), fine);
  target.credits -= paid;
  target.smugglingFinesPaid = (target.smugglingFinesPaid ?? 0) + paid;
  target.smugglingUnpaidFines = (target.smugglingUnpaidFines ?? 0) + fine - paid;
  target.smugglingConfiscated = (target.smugglingConfiscated ?? 0) + seized;
  target.smugglingSuspicion = Math.min(
    100,
    (target.smugglingSuspicion ?? 0) + (response.resist ? 35 : response.flee ? 20 : 8)
  );
  if (response.resist) {
    target.hullHp = Math.max(1, target.hullHp - Math.ceil(target.hullMaxHp * 0.22));
  }
  target.activity = 'Zoll: ' + seized + ' t beschlagnahmt · Strafe ' + paid + ' CR';
  return 'seized';
}

/** Contraband is only confiscated when a probabilistic physical scan succeeds. */
export function resolveNpcSmugglingInspection(
  target: SectorNpcState,
  patrol: SectorNpcState | null,
  strength: number,
  random: () => number = Math.random
): InspectionOutcome {
  target.smugglingInspections = (target.smugglingInspections ?? 0) + 1;
  const detected = npcSmugglingScan(target, strength, random);
  if (detected.length === 0) {
    target.smugglingSuspicion = Math.max(0, (target.smugglingSuspicion ?? 0) - 2);
    target.activity = 'Zollkontrolle ohne Befund';
    return 'clear';
  }
  const value = contrabandValue(detected);
  const response = inspectionResponse(target, patrol, value, random);
  if (
    patrol &&
    (response.flee || response.resist) &&
    escapeInspection(target, patrol, response.resist, random)
  ) {
    return response.resist ? 'resisted' : 'escaped';
  }
  return settleConfiscation(target, detected, value, response);
}

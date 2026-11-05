import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation } from '../../core/world-types';
import { quoteRefuel, quoteRepair } from '../ships/ship-operating-costs';

/** Inhabited docks service civilian ships; barren fields and derelicts do not. */
export function isServicedPort(location: WorldLocation | undefined): boolean {
  if (!location) return false;
  const kind = location.kind;
  if (kind !== 'planet' && kind !== 'moon' && kind !== 'station') return false;
  const facilities = location.activities;
  return Boolean(facilities.refuel || facilities.dock || facilities.trade || facilities.shipyard);
}

/** NPC operations use the same global fuel/repair prices as the player. */
export function serviceNpcAtPort(npc: SectorNpcState, location?: WorldLocation): void {
  if (!isServicedPort(location) || !location) return;
  const fuel = quoteRefuel(npc.fuel, npc.fuelCapacity, npc.credits);
  if (fuel.cost > 0) {
    npc.credits -= fuel.cost;
    npc.fuel = Math.min(npc.fuelCapacity, npc.fuel + fuel.units);
  }
  if (npc.hullHp >= npc.hullMaxHp) return;
  const isYard = Boolean(location.activities.shipyard);
  const repair = quoteRepair(npc.hullHp, npc.hullMaxHp, npc.credits, isYard);
  if (repair.points > 0) {
    npc.credits -= repair.cost;
    npc.hullHp = Math.min(npc.hullMaxHp, npc.hullHp + repair.points);
  }
}

/** Contracted system patrols earn operating funds for completed patrol runs. */
export function payNpcPatrolContract(npc: SectorNpcState): number {
  if (npc.job !== 'patrol' || npc.pirate) return 0;
  const reward = 500;
  npc.credits += reward;
  return reward;
}

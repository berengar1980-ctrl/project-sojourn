import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation } from '../../core/world-types';
import { quoteRefuel, quoteRepair } from '../ships/ship-operating-costs';

/** Inhabited docks service civilian ships; barren fields and derelicts do not. */
export function isServicedPort(location: WorldLocation | undefined): boolean {
  return Boolean(
    location &&
      (location.kind === 'planet' || location.kind === 'moon' || location.kind === 'station') &&
      (location.activities.refuel || location.activities.dock ||
        location.activities.trade || location.activities.shipyard)
  );
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
  const repair = quoteRepair(npc.hullHp, npc.hullMaxHp,
    npc.credits, Boolean(location.activities.shipyard));
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

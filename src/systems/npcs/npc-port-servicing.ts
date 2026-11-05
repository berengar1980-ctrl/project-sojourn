import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation } from '../../core/world-types';
import { quoteRefuel, quoteRepair } from '../ships/ship-operating-costs';
import { npcRepairPriority } from './npc-operating-policy';

/** Inhabited docks service civilian ships; barren fields and derelicts do not. */
export function isServicedPort(location: WorldLocation | undefined): boolean {
  if (!location) return false;
  const kind = location.kind;
  if (kind !== 'planet' && kind !== 'moon' && kind !== 'station') return false;
  const facilities = location.activities;
  return Boolean(facilities.refuel || facilities.dock || facilities.trade || facilities.shipyard);
}

function buyNpcFuel(npc: SectorNpcState): void {
  const fuel = quoteRefuel(npc.fuel, npc.fuelCapacity, npc.credits);
  if (fuel.cost <= 0) return;
  npc.credits -= fuel.cost;
  npc.fuel = Math.min(npc.fuelCapacity, npc.fuel + fuel.units);
}

function repairNpcHull(npc: SectorNpcState, shipyard: boolean): void {
  const quote = quoteRepair(npc.hullHp, npc.hullMaxHp, npc.credits, shipyard);
  if (quote.points <= 0) return;
  npc.credits -= quote.cost;
  npc.hullHp = Math.min(npc.hullMaxHp, npc.hullHp + quote.points);
}

/** Repair priorities trade off safety and available liquidity; neither action creates credits. */
export function serviceNpcAtPort(npc: SectorNpcState, location?: WorldLocation): void {
  if (!isServicedPort(location) || !location) return;
  const yard = Boolean(location.activities.shipyard);
  const priority = npcRepairPriority(npc, yard);
  if (priority === 'critical') {
    repairNpcHull(npc, yard);
    buyNpcFuel(npc);
    return;
  }
  buyNpcFuel(npc);
  if (npcRepairPriority(npc, yard) === 'affordable') repairNpcHull(npc, yard);
}

/** Contracted system patrols earn operating funds for completed patrol runs. */
export function payNpcPatrolContract(npc: SectorNpcState): number {
  if (npc.job !== 'patrol' || npc.pirate) return 0;
  const reward = 500;
  npc.credits += reward;
  return reward;
}

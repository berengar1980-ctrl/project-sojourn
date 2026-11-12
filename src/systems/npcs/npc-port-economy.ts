import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';
import type { NpcSectorServiceOptions } from './npc-sector-types';
import { serviceNpcAtPort } from './npc-port-servicing';
import { tryNpcComponentUpgrade, tryNpcHullUpgrade } from './npc-upgrade-service';
import { sellPirateLootAtHome } from '../economy/pirate-loot-market';

function accountPirateExpense(npc: SectorNpcState, creditsBefore: number): void {
  if (!npc.pirate) return;
  npc.pirateOperatingExpenses =
    (npc.pirateOperatingExpenses ?? 0) + Math.max(0, creditsBefore - npc.credits);
}

export function serviceNpcAtLocation(world: WorldMap, npc: SectorNpcState): void {
  const location = world.locations.find((candidate) => candidate.id === npc.locationId);
  const creditsBefore = npc.credits;
  serviceNpcAtPort(npc, location);
  accountPirateExpense(npc, creditsBefore);
}

export function serviceIdleNpc(
  world: WorldMap,
  npc: SectorNpcState,
  options: NpcSectorServiceOptions
): void {
  if (npc.pirate && options.markets) sellPirateLootAtHome(npc, options.markets);
  serviceNpcAtLocation(world, npc);
  const current = world.locations.find((location) => location.id === npc.locationId);
  if (!current?.activities.shipyard) return;
  const creditsBefore = npc.credits;
  if (!tryNpcHullUpgrade(npc)) tryNpcComponentUpgrade(npc);
  accountPirateExpense(npc, creditsBefore);
}

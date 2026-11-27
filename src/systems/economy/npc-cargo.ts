import type { NpcEconomyState } from '../../core/economy-types';

import { wholeQuantity as quantity } from '../../core/economy-quantity';

export { wholeQuantity as quantity } from '../../core/economy-quantity';

export function npcCargoUsed(npc: Pick<NpcEconomyState, 'cargo'>): number {
  return Object.values(npc.cargo).reduce((sum, value) => sum + quantity(value), 0);
}

export function cargoFreeFor(npc: NpcEconomyState, capacity: number): number {
  return Math.max(0, quantity(capacity) - npcCargoUsed(npc));
}

export function cargoFree(npc: NpcEconomyState): number {
  return cargoFreeFor(npc, npc.cargoCapacity);
}

import type { NpcEconomyState } from '../../core/economy-types';

export function quantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function npcCargoUsed(npc: NpcEconomyState): number {
  return Object.values(npc.cargo).reduce((sum, value) => sum + quantity(value), 0);
}

export function cargoFreeFor(npc: NpcEconomyState, capacity: number): number {
  return Math.max(0, quantity(capacity) - npcCargoUsed(npc));
}

export function cargoFree(npc: NpcEconomyState): number {
  return cargoFreeFor(npc, npc.cargoCapacity);
}

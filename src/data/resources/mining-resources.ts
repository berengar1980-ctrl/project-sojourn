import type { MiningResourceDefinition } from '../../core/resource-types';

export const miningResources: readonly MiningResourceDefinition[] = [
  { id: 'ferrite', name: 'Ferrit', rarity: 1, spawnWeight: 28, baseValue: 8 },
  { id: 'carbon', name: 'Kohlenstoff', rarity: 1.1, spawnWeight: 20, baseValue: 7 },
  { id: 'sulfur', name: 'Schwefel', rarity: 1.4, spawnWeight: 15, baseValue: 9 },
  { id: 'silicite', name: 'Silicit', rarity: 1.2, spawnWeight: 22, baseValue: 11 },
  { id: 'cuprium', name: 'Cuprium', rarity: 1.5, spawnWeight: 17, baseValue: 16 },
  { id: 'kharvium', name: 'Kharvium', rarity: 2, spawnWeight: 12, baseValue: 25 },
  { id: 'cobaltite', name: 'Cobaltit', rarity: 2.4, spawnWeight: 8, baseValue: 36 },
  { id: 'iridite', name: 'Iridit', rarity: 3.1, spawnWeight: 5, baseValue: 55 },
  { id: 'volucrium', name: 'Volucrium', rarity: 4, spawnWeight: 3.2, baseValue: 82 },
  { id: 'rare-metals', name: 'Seltene Metalle', rarity: 4.8, spawnWeight: 2.2, baseValue: 95 },
  { id: 'elydrase', name: 'Elydrase', rarity: 5.2, spawnWeight: 1.8, baseValue: 130 },
  { id: 'orvessium', name: 'Orvessium', rarity: 7, spawnWeight: 0.9, baseValue: 220 },
  { id: 'cyranthite', name: 'Cyranthite', rarity: 10, spawnWeight: 0.35, baseValue: 420 },
];

export function miningResourceById(id: string): MiningResourceDefinition | null {
  return miningResources.find((resource) => resource.id === id) ?? null;
}

export function pickMiningResource(
  random: () => number,
  allowedResourceIds?: readonly string[]
): MiningResourceDefinition {
  const allowed = allowedResourceIds ? new Set(allowedResourceIds) : null;
  const pool = allowed
    ? miningResources.filter((resource) => allowed.has(resource.id))
    : miningResources;
  const candidates = pool.length > 0 ? pool : miningResources;
  const totalWeight = candidates.reduce((sum, resource) => sum + resource.spawnWeight, 0);
  let roll = random() * totalWeight;

  for (const resource of candidates) {
    roll -= resource.spawnWeight;
    if (roll <= 0) return resource;
  }

  return candidates[0]!;
}

export function resourceReferenceValue(resource: MiningResourceDefinition): number {
  const rarityMultiplier = 0.75 + resource.rarity * 0.25;
  return Math.round(resource.baseValue * rarityMultiplier);
}

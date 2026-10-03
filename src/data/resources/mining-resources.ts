import type { MiningResourceDefinition } from '../../core/resource-types';

export const miningResources: readonly MiningResourceDefinition[] = [
  { id: 'ferrite', name: 'Ferrit', rarity: 1, spawnWeight: 28, baseValue: 8 },
  { id: 'silicite', name: 'Silicit', rarity: 1.2, spawnWeight: 22, baseValue: 11 },
  { id: 'cuprium', name: 'Cuprium', rarity: 1.5, spawnWeight: 17, baseValue: 16 },
  { id: 'titanex', name: 'Titanex', rarity: 2, spawnWeight: 12, baseValue: 25 },
  { id: 'cobaltite', name: 'Cobaltit', rarity: 2.4, spawnWeight: 8, baseValue: 36 },
  { id: 'iridite', name: 'Iridit', rarity: 3.1, spawnWeight: 5, baseValue: 55 },
  { id: 'volucrium', name: 'Volucrium', rarity: 4, spawnWeight: 3.2, baseValue: 82 },
  { id: 'heliox-crystal', name: 'Heliox-Kristall', rarity: 5.2, spawnWeight: 1.8, baseValue: 130 },
  { id: 'nyxium', name: 'Nyxium', rarity: 7, spawnWeight: 0.9, baseValue: 220 },
  { id: 'astralium', name: 'Astralium', rarity: 10, spawnWeight: 0.35, baseValue: 420 },
];

export function miningResourceById(id: string): MiningResourceDefinition | null {
  return miningResources.find((resource) => resource.id === id) ?? null;
}

export function pickMiningResource(random: () => number): MiningResourceDefinition {
  const totalWeight = miningResources.reduce((sum, resource) => sum + resource.spawnWeight, 0);
  let roll = random() * totalWeight;

  for (const resource of miningResources) {
    roll -= resource.spawnWeight;
    if (roll <= 0) return resource;
  }

  return miningResources[0]!;
}

export function resourceReferenceValue(resource: MiningResourceDefinition): number {
  const rarityMultiplier = 0.75 + resource.rarity * 0.25;
  return Math.round(resource.baseValue * rarityMultiplier);
}

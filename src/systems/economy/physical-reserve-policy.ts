import type { EconomyResourcePool } from '../../core/economy-types';

/** Five maximum-quality wrecks worth of material, not additional sector stock. */
const COMBAT_TARGETS: Readonly<Record<string, number>> = {
  steel: 145,
  'machine-parts': 60,
  'composite-plate': 45,
};

export function combatBufferTarget(resourceId: string): number {
  return COMBAT_TARGETS[resourceId] ?? 0;
}

/** At most one fifth of the available general reserve goes to combat each day. */
export function supplyDailyCombatBuffer(resourceId: string, pool: EconomyResourcePool): number {
  const target = combatBufferTarget(resourceId);
  if (!target) return 0;
  const current = pool.combatBuffer ?? 0;
  const amount = Math.min(Math.max(0, target - current), Math.floor(pool.reserve / 5));
  if (amount <= 0) return 0;
  pool.reserve -= amount;
  pool.combatBuffer = current + amount;
  return amount;
}

function hasPermanentFieldStock(pool: EconomyResourcePool): boolean {
  return Object.keys(pool.physicalStocks ?? {}).some(
    (id) => id.startsWith('["') && !id.startsWith('["sector-event-field-')
  );
}

/** Shared resources leave part of the reserve for the daily world-field balance. */
export function dailyProductionBudget(pool: EconomyResourcePool): number {
  if (!hasPermanentFieldStock(pool)) return pool.reserve;
  return Math.floor(pool.reserve * 0.65);
}

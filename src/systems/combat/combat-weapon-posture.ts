import type { MutableCombatant } from './strategic-combat-types';

/** The selected weapon group owns the bow angle; a spare side gun cannot override it. */
export function combatWeaponHeading(ship: MutableCombatant, enemy: MutableCombatant): number {
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const range = Math.hypot(dx, dy);
  const lead =
    ship.maneuver?.kind === 'intercept' || (!ship.maneuver && range > 600)
      ? Math.min(2, range / Math.max(65, ship.setup.combatSpeed ?? 120))
      : 0;
  const bearing = Math.atan2(dy + enemy.velocity.y * lead, dx + enemy.velocity.x * lead);
  if (ship.strategy?.focus !== 'broadside') return bearing;
  return bearing + ((ship.strategy.broadsideFacing === 'starboard' ? -1 : 1) * Math.PI) / 2;
}

export function combatPlanKey(ship: MutableCombatant): string {
  const plan = ship.strategy;
  return [ship.tactic, plan?.kind, plan?.focus, plan?.broadsideFacing].join(':');
}

export function usesMineCorridor(ship: MutableCombatant): boolean {
  return (
    (ship.tactic === 'minefield' || ship.strategy?.focus === 'mine') && ship.mineStock.length > 0
  );
}

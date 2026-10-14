import type { MutableCombatant } from './strategic-combat-types';

/** Deliberate ram doctrine: only a relatively healthy ship hits a weakened target. */
export function usefulRamAttempt(
  attacker: MutableCombatant,
  defender: MutableCombatant
): boolean {
  if (!attacker.setup.aiControlled || attacker.tactic === 'flee') return false;
  if (attacker.subsystems.engine <= 0 || attacker.hullHp < attacker.hullMaxHp * 0.65)
    return false;
  if (attacker.shieldMaxHp <= 0 || attacker.shieldHp < attacker.shieldMaxHp * 0.35)
    return false;
  const range = Math.hypot(
    attacker.position.x - defender.position.x,
    attacker.position.y - defender.position.y
  );
  return (
    range >= 160 &&
    range <= 850 &&
    defender.hullHp < attacker.hullHp * 0.65 &&
    defender.shieldHp < defender.shieldMaxHp * 0.3
  );
}

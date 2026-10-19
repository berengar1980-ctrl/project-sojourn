import type { MutableCombatant } from './strategic-combat-types';

/** Deliberate ram doctrine: reinforced bows justify higher but still bounded risk. */
export function usefulRamAttempt(attacker: MutableCombatant, defender: MutableCombatant): boolean {
  if (!attacker.setup.aiControlled || attacker.tactic === 'flee') return false;
  const armoredBow = (attacker.setup?.armor?.front ?? 0) >= 0.15;
  if (attacker.subsystems.engine <= 0) return false;
  if (attacker.hullHp < attacker.hullMaxHp * (armoredBow ? 0.55 : 0.65)) return false;
  if (attacker.shieldMaxHp <= 0) return false;
  if (attacker.shieldHp < attacker.shieldMaxHp * (armoredBow ? 0.25 : 0.35)) return false;
  const range = Math.hypot(
    attacker.position.x - defender.position.x,
    attacker.position.y - defender.position.y
  );
  return (
    range >= 160 &&
    range <= (armoredBow ? 1100 : 850) &&
    defender.hullHp < attacker.hullHp * (armoredBow ? 1.15 : 0.65) &&
    defender.shieldHp <= defender.shieldMaxHp * (armoredBow ? 0.7 : 0.3)
  );
}

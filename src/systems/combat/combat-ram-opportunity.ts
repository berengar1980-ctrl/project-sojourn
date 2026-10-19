import type { MutableCombatant } from './strategic-combat-types';

/** Deliberate ram doctrine: reinforced bows justify higher but still bounded risk. */
export function usefulRamAttempt(attacker: MutableCombatant, defender: MutableCombatant): boolean {
  // Campaign players use the same autonomous steering but intentionally omit
  // aiControlled to keep their chosen fight/flee tactic authoritative.
  if (attacker.setup.aiControlled === false || attacker.tactic === 'flee') return false;
  // Even all-around plating protects the bow, but less than focused bow armor.
  const bowArmor = Math.max(0, attacker.setup?.armor?.front ?? 0);
  const confidence = Math.min(1, bowArmor / 0.15);
  if (attacker.subsystems.engine <= 0) return false;
  if (attacker.hullHp < attacker.hullMaxHp * (0.65 - 0.1 * confidence)) return false;
  if (attacker.shieldMaxHp <= 0) return false;
  // Armored bows can deliberately ram while shields are empty; compare the
  // expected collision cost instead of demanding a fixed shield reserve.
  if (confidence < 0.5 && attacker.shieldHp < attacker.shieldMaxHp * 0.3) return false;
  const range = Math.hypot(
    attacker.position.x - defender.position.x,
    attacker.position.y - defender.position.y
  );
  // Once the ship reaches a broadside, do not abort its committed impact
  // inside 160 m, where the original opportunity check used to switch off.
  const committed = attacker.ramApproach?.phase === 'impact';
  const approachSpeed = Math.max(80, attacker.setup.combatSpeed ?? 120);
  const kinetic = 0.2 + 90 * (1 - Math.exp(-(Math.max(0, approachSpeed - 35) ** 2) / 30000));
  const ownOverflow = Math.max(0, kinetic * 0.7 - attacker.shieldHp);
  const ownHullCost = ownOverflow * (1 - bowArmor);
  const enemySideArmor = Math.min(
    defender.setup?.armor?.port ?? 0,
    defender.setup?.armor?.starboard ?? 0
  );
  const theirOverflow = Math.max(0, kinetic * 1.95 - defender.shieldHp);
  const theirHullCost = theirOverflow * (1 - enemySideArmor);
  const favorable = theirHullCost > ownHullCost * 1.2 && ownHullCost < attacker.hullHp * 0.45;
  return (
    (range >= 160 || committed) &&
    range <= 850 + 250 * confidence &&
    defender.hullHp < attacker.hullHp * (0.65 + 0.5 * confidence) &&
    (favorable || defender.shieldHp <= defender.shieldMaxHp * (0.3 + 0.4 * confidence)) &&
    ownHullCost < attacker.hullHp * 0.45
  );
}

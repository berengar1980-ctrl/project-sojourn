import { isSecurityDrone } from '../../core/security-drone';
import type { MutableCombatant } from './strategic-combat-types';

/** Estimate shield overflow for a planned protected-bow-to-broadside impact. */
export function estimateRamExchange(
  attacker: MutableCombatant,
  defender: MutableCombatant,
  bowArmor: number
): { ownCost: number; enemyCost: number } {
  const speed = Math.max(80, attacker.setup.combatSpeed ?? 120);
  const energy = Math.max(0, speed - 35) ** 2;
  const base = 0.2 + 90 * (1 - Math.exp(-energy / 30000));
  const sourceExposure = isSecurityDrone(attacker.setup?.id) ? 1 : 0.7;
  const ownCost = Math.max(0, base * sourceExposure - attacker.shieldHp) * (1 - bowArmor);
  const sideArmor = Math.min(
    defender.setup?.armor?.port ?? 0,
    defender.setup?.armor?.starboard ?? 0
  );
  const targetExposure = isSecurityDrone(defender.setup?.id) ? 1 : 1.95;
  const enemyCost = Math.max(0, base * targetExposure - defender.shieldHp) * (1 - sideArmor);
  return { ownCost, enemyCost };
}

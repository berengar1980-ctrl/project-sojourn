import type { StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';
import { distance } from './strategic-combat-geometry';
import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';

export function maybeAttemptBoarding(
  runtime: StrategicCombatRuntime,
  attempt: (side: StrategicCombatSide) => boolean,
  sides: readonly StrategicCombatSide[] = ['attacker', 'defender']
): void {
  if (runtime.grapple) return;
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    const enemy = runtimeEnemy(runtime, side);
    if (!ship.setup.aiControlled || runtime.grappleUsed[side]) continue;
    if (ship.hullHp <= 0 || enemy.hullHp <= 0 || enemy.shieldHp > 0) continue;
    if (distance(ship.position, enemy.position) > 650) continue;
    // Prevent automatic boarding of healthy enemies; favour capture when the
    // target is already compromised, or when the attacker is badly damaged.
    const compromised = enemy.hullHp / enemy.hullMaxHp <= 0.65;
    const desperate = ship.hullHp / ship.hullMaxHp <= 0.3;
    const defensiveNpc = side === 'defender' && !enemy.setup.aiControlled;
    if (compromised || desperate || defensiveNpc) {
      attempt(side);
      break;
    }
  }
}

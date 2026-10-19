import type { StrategicCombatRuntime } from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';
import { directionalHullDamage } from './strategic-combat-damage';
import { captureRamVisuals, emitRamContactSpark } from './combat-ram-visual-events';

function ramExposure(
  heading: number,
  contactDirectionX: number,
  contactDirectionY: number
): number {
  const facing = Math.cos(heading) * contactDirectionX + Math.sin(heading) * contactDirectionY;
  // A true side contact takes 50% more impact damage than before.
  const normal = facing >= 0 ? 1.3 - 0.6 * facing : 1.3 - 0.3 * facing;
  return Math.abs(facing) <= 0.45 ? normal * 1.5 : normal;
}

/** Apply one impact impulse, not continuous damage while hulls remain entangled. */
export function applyCombatRamImpact(runtime: StrategicCombatRuntime): number {
  const { attacker, defender } = runtime;
  const { distance, required, normal } = shipContact(attacker, defender);
  if (distance > required || runtime.elapsedSeconds - (runtime.lastRamImpactAt ?? -100) < 0.9)
    return 0;
  const nx = normal.x;
  const ny = normal.y;
  const closing =
    (attacker.velocity.x - defender.velocity.x) * nx +
    (attacker.velocity.y - defender.velocity.y) * ny;
  if (closing <= 0) return 0;
  runtime.lastRamImpactAt = runtime.elapsedSeconds;
  const visual = captureRamVisuals(runtime);
  // A physical hit completes the approach. The AI must choose a fresh pass
  // rather than keep boosting into the same overlapping pair of hulls.
  delete attacker.ramApproach;
  delete defender.ramApproach;
  // Monotonic kinetic damage: boost speed always matters, with diminishing returns.
  const energy = Math.max(0, closing - 35) ** 2;
  const damage = closing < 35 ? 0.2 : 0.2 + 90 * (1 - Math.exp(-energy / 30000));
  const firstDamage = damage * ramExposure(attacker.headingRadians, nx, ny);
  const secondDamage = damage * ramExposure(defender.headingRadians, -nx, -ny);
  for (const [ship, impact, contactX, contactY] of [
    [attacker, firstDamage, nx, ny],
    [defender, secondDamage, -nx, -ny],
  ] as const) {
    const shield = Math.min(ship.shieldHp, impact);
    ship.shieldHp -= shield;
    const overflow = impact - shield;
    const armorAdjusted = directionalHullDamage(
      ship,
      overflow,
      ship === attacker ? defender.position : attacker.position
    );
    ship.hullHp = Math.max(0, ship.hullHp - armorAdjusted);
    const facing =
      Math.cos(ship.headingRadians) * contactX + Math.sin(ship.headingRadians) * contactY;
    if (facing < -0.5 && overflow > 0) {
      ship.subsystems.engine = Math.max(0, ship.subsystems.engine - armorAdjusted * 0.5);
    }
  }
  emitRamContactSpark(runtime, visual, firstDamage, secondDamage);
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side: 'system',
    event: 'impact',
    detail:
      'Rumpfkontakt · Annäherung ' +
      closing.toFixed(0) +
      ' m/s · Schaden ' +
      firstDamage.toFixed(1) +
      ' / ' +
      secondDamage.toFixed(1),
  });
  return damage;
}

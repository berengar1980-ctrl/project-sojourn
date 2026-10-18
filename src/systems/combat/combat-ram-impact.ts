import type { StrategicCombatRuntime } from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';

function ramExposure(
  heading: number,
  contactDirectionX: number,
  contactDirectionY: number
): number {
  const facing = Math.cos(heading) * contactDirectionX + Math.sin(heading) * contactDirectionY;
  // The armored prow takes less damage than a vulnerable broadside.
  return facing >= 0 ? 1.3 - 0.6 * facing : 1.3 - 0.3 * facing;
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
  // Glancing, slow contact barely scratches shields; energetic impacts scale nonlinearly.
  const damage = closing < 35 ? 0.2 : Math.min(24, 0.2 + (closing - 35) ** 2 / 450);
  const firstDamage = damage * ramExposure(attacker.headingRadians, nx, ny);
  const secondDamage = damage * ramExposure(defender.headingRadians, -nx, -ny);
  for (const [ship, impact, contactX, contactY] of [
    [attacker, firstDamage, nx, ny],
    [defender, secondDamage, -nx, -ny],
  ] as const) {
    const shield = Math.min(ship.shieldHp, impact);
    ship.shieldHp -= shield;
    const overflow = impact - shield;
    ship.hullHp = Math.max(0, ship.hullHp - overflow);
    const facing =
      Math.cos(ship.headingRadians) * contactX + Math.sin(ship.headingRadians) * contactY;
    if (facing < -0.5 && overflow > 0) {
      ship.subsystems.engine = Math.max(0, ship.subsystems.engine - overflow * 0.5);
    }
  }
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

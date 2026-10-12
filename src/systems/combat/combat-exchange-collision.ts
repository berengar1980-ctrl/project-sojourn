import type { StrategicCombatRuntime } from './strategic-combat-types';

export function separateActionShips(runtime: StrategicCombatRuntime): void {
  const attacker = runtime.attacker;
  const defender = runtime.defender;
  const dx = defender.position.x - attacker.position.x;
  const dy = defender.position.y - attacker.position.y;
  const range = Math.hypot(dx, dy);
  if (range >= 105) return;
  const nx = range > 0.001 ? dx / range : 1;
  const ny = range > 0.001 ? dy / range : 0;
  const relative =
    (defender.velocity.x - attacker.velocity.x) * nx +
    (defender.velocity.y - attacker.velocity.y) * ny;
  if (relative >= 35) return;
  const correction = (35 - relative) / 2;
  attacker.velocity.x -= nx * correction;
  attacker.velocity.y -= ny * correction;
  defender.velocity.x += nx * correction;
  defender.velocity.y += ny * correction;
  attacker.speed = Math.hypot(attacker.velocity.x, attacker.velocity.y);
  defender.speed = Math.hypot(defender.velocity.x, defender.velocity.y);
}

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
export function applyActionRamImpact(runtime: StrategicCombatRuntime): number {
  const { attacker, defender } = runtime;
  const dx = defender.position.x - attacker.position.x;
  const dy = defender.position.y - attacker.position.y;
  const range = Math.hypot(dx, dy);
  if (range > 86 || runtime.elapsedSeconds - (runtime.lastRamImpactAt ?? -100) < 0.9) return 0;
  const nx = range > 0.001 ? dx / range : 1;
  const ny = range > 0.001 ? dy / range : 0;
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

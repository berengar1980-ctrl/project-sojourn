import type { MutableCombatant, StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';
import { distance, normalize } from './strategic-combat-geometry';

/** A limited tractor pulse disrupts a nearby target without teleporting it. */
export function pulseCombatTractor(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  enemy: MutableCombatant,
  dt: number
): void {
  ship.tractorPulseCooldown = Math.max(0, (ship.tractorPulseCooldown ?? 0) - dt);
  const range = ship.setup.tractorRangeMeters ?? 0;
  if (range <= 0 || ship.subsystems.tractor <= 0 || enemy.hullHp <= 0) return;
  const separation = distance(ship.position, enemy.position);
  if (separation < 130 || separation > range || (ship.tractorPulseCooldown ?? 0) > 0) return;
  if (ship.tactic === 'flee') return;
  // Use the beam when it can slow a fleeing enemy or improve a close pursuit.
  const away = normalize(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  const radial = (enemy.velocity.x - ship.velocity.x) * away.x +
    (enemy.velocity.y - ship.velocity.y) * away.y;
  if (radial < 18 && separation > 350) return;
  ship.tractorPulseCooldown = 6;
  const impulse = Math.min(22, Math.max(6, radial * 0.18));
  enemy.velocity.x -= away.x * impulse;
  enemy.velocity.y -= away.y * impulse;
  enemy.speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: 'TRAKTORIMPULS · Zielgeschwindigkeit um ' + impulse.toFixed(0) + ' m/s verändert',
  });
  runtime.lastEvent = ship.setup.name + ': TRAKTORIMPULS';
  ship.combatIntent = 'TRAKTORIMPULS';
}

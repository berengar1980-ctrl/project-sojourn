import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';
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
  if (range <= 0 || ship.shieldHp > 0 || ship.subsystems.tractor <= 0 || enemy.hullHp <= 0) return;
  const separation = distance(ship.position, enemy.position);
  if (separation < 130 || separation > range || (ship.tractorPulseCooldown ?? 0) > 0) return;
  // A fleeing ship can repel a close pursuer; a chasing ship brakes a departing target.
  const away = normalize(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  const radial =
    (enemy.velocity.x - ship.velocity.x) * away.x + (enemy.velocity.y - ship.velocity.y) * away.y;
  const repel = (ship.tactic === 'flee' || ship.hullHp < ship.hullMaxHp * 0.4) &&
    radial < -18 && separation < Math.min(350, range);
  const intercept = ship.tactic !== 'flee' && radial > 18;
  if (!repel && !intercept) return;
  ship.tractorPulseCooldown = 6;
  const impulse = Math.min(22, Math.max(6, Math.abs(radial) * 0.18));
  const sign = repel ? 1 : -1;
  enemy.velocity.x += away.x * impulse * sign;
  enemy.velocity.y += away.y * impulse * sign;
  enemy.speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  runtime.beamSerial += 1;
  runtime.beams.push({
    id: runtime.beamSerial,
    owner: side,
    kind: 'tractor',
    family: 'pulse_laser',
    origin: { ...ship.position },
    end: { ...enemy.position },
    weaponIndex: -1,
    ttlSeconds: 0.38,
    maxTtlSeconds: 0.38,
  });
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: (repel ? 'TRAKTORIMPULS ABWEHR' : 'TRAKTORIMPULS ABFANGEN') + ' · Radialtempo um ' + impulse.toFixed(0) + ' m/s verändert',
  });
  runtime.lastEvent = ship.setup.name + ': TRAKTORIMPULS';
  ship.combatIntent = 'TRAKTORIMPULS';
}

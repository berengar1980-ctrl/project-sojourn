import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';
import { distance, normalize } from './strategic-combat-geometry';

/**
 * A minefield pulse only fires when its lateral acceleration improves an
 * attainable intercept with an already armed, friendly mine. It never places
 * mines or overrides the ship's existing inertial flight controller.
 */
export function mineTrapImpulse(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  enemy: MutableCombatant
): { x: number; y: number } | null {
  if (ship.tactic !== 'minefield' || !ship.setup.aiControlled) return null;
  const candidates = runtime.mines
    .filter((mine) => mine.owner === side && mine.armedSeconds <= 0)
    .map((mine) => {
      const dx = mine.position.x - enemy.position.x;
      const dy = mine.position.y - enemy.position.y;
      const separation = Math.hypot(dx, dy);
      const horizon = Math.min(2.5, Math.max(0.7, separation / Math.max(50, enemy.speed)));
      const futureX = enemy.position.x + enemy.velocity.x * horizon;
      const futureY = enemy.position.y + enemy.velocity.y * horizon;
      const missX = mine.position.x - futureX;
      const missY = mine.position.y - futureY;
      const miss = Math.hypot(missX, missY);
      const allowed = mine.definition.triggerRadiusMeters + 22 * horizon;
      return { mine, missX, missY, miss, horizon, allowed, separation };
    })
    .filter((entry) =>
      entry.separation >= entry.mine.definition.triggerRadiusMeters &&
      entry.separation <= 360 &&
      entry.miss > entry.mine.definition.triggerRadiusMeters &&
      entry.miss <= entry.allowed
    )
    .sort((a, b) => a.miss - b.miss)[0];
  if (!candidates) return null;
  const { missX, missY, miss, horizon, mine } = candidates;
  const needed = Math.min(22, (miss - mine.definition.triggerRadiusMeters + 8) / horizon);
  const x = (missX / miss) * needed;
  const y = (missY / miss) * needed;
  const improved = Math.hypot(missX - x * horizon, missY - y * horizon);
  return improved < miss ? { x, y } : null;
}

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
  if (ship.tactic === 'flee') return;
  // A minefield ship reserves its pulse for an actual, armed friendly trap.\n  const trap = mineTrapImpulse(runtime, side, ship, enemy);\n  if (ship.tactic === 'minefield' && ship.setup.aiControlled && !trap) return;\n  // Otherwise use the beam to slow a fleeing enemy or improve pursuit.
  const away = normalize(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  const radial =
    (enemy.velocity.x - ship.velocity.x) * away.x + (enemy.velocity.y - ship.velocity.y) * away.y;
  if (!trap && radial < 18 && separation > 350) return;
  ship.tractorPulseCooldown = 6;
  const impulse = Math.min(22, Math.max(6, radial * 0.18));
  enemy.velocity.x -= away.x * impulse;
  enemy.velocity.y -= away.y * impulse;
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
    detail: trap\n      ? 'TRAKTOR_MINE_TRAP · seitlicher Impuls ' + Math.hypot(trap.x, trap.y).toFixed(1) + ' m/s'\n      : 'TRAKTORIMPULS · Zielgeschwindigkeit um ' + impulse.toFixed(0) + ' m/s verändert',
  });
  runtime.lastEvent = ship.setup.name + ': TRAKTORIMPULS';
  ship.combatIntent = 'TRAKTORIMPULS';
}

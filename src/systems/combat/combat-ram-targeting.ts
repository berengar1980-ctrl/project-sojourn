import { isSecurityDrone } from '../../core/security-drone';
import type { CombatPoint, MutableCombatant } from './strategic-combat-types';

const ORBIT_TURN_RATE = 0.3;
const ORBIT_MIN_SPEED = 30;

/**
 * Estimate a near-future interception window from target velocity and the
 * attacker's maximum normal speed. The conservative horizon avoids distant
 * aimpoints when an evasive ship changes direction rapidly.
 */
function ramInterceptSeconds(ship: MutableCombatant, enemy: MutableCombatant): number {
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const vx = enemy.velocity.x;
  const vy = enemy.velocity.y;
  const speed = Math.max(65, ship.setup.combatSpeed ?? 120);
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;
  const discriminant = b * b - 4 * a * c;
  let seconds = Math.hypot(dx, dy) / speed;
  if (discriminant >= 0 && Math.abs(a) > 0.0001) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    const valid = [first, second].filter((value) => value > 0);
    if (valid.length) seconds = Math.min(...valid);
  }
  return Math.max(0.2, Math.min(2, seconds));
}

/**
 * Extrapolate the *motion*, not the ship's rotating side offset. For a
 * circling target the angular velocity bends the projected trajectory.
 */
function ramPredictedPosition(enemy: MutableCombatant, seconds: number): CombatPoint {
  const angular = enemy.turnRateRadiansPerSecond ?? 0;
  const { x: vx, y: vy } = enemy.velocity;
  if (Math.abs(angular) < 0.1) {
    return { x: enemy.position.x + vx * seconds, y: enemy.position.y + vy * seconds };
  }
  const angle = angular * seconds;
  const forward = Math.sin(angle) / angular;
  const sideways = (1 - Math.cos(angle)) / angular;
  return {
    x: enemy.position.x + forward * vx - sideways * vy,
    y: enemy.position.y + sideways * vx + forward * vy,
  };
}

/**
 * One persistent approach choice. Slow targets permit a deliberate flank;
 * circling targets require a velocity-led interception, not pursuit of a
 * broadside waypoint that rotates away on every simulation frame.
 */
export function ramFlankTarget(ship: MutableCombatant, enemy: MutableCombatant): CombatPoint {
  if (!Number.isFinite(enemy.headingRadians)) return enemy.position;
  const sideX = -Math.sin(enemy.headingRadians);
  const sideY = Math.cos(enemy.headingRadians);
  const relativeX = ship.position.x - enemy.position.x;
  const relativeY = ship.position.y - enemy.position.y;
  if (!ship.ramApproach) {
    const side = relativeX * sideX + relativeY * sideY < 0 ? -1 : 1;
    ship.ramApproach = { side, phase: 'flank', flankDirection: { x: sideX, y: sideY } };
  }
  const approach = ship.ramApproach;
  const targetSpeed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  if (
    isSecurityDrone(enemy.setup?.id) ||
    (targetSpeed >= ORBIT_MIN_SPEED &&
      Math.abs(enemy.turnRateRadiansPerSecond ?? 0) >= ORBIT_TURN_RATE)
  ) {
    // Latch interception mode so the maneuver cannot flip between
    // broadside staging and interception during each direction change.
    approach.intercept = true;
  }

  const range = Math.hypot(relativeX, relativeY);
  const predicted = ramPredictedPosition(enemy, ramInterceptSeconds(ship, enemy));
  if (approach.intercept) {
    if (range < 470) approach.phase = 'impact';
    return predicted;
  }

  const side = approach.side;
  const lateral = approach.flankDirection ?? { x: sideX, y: sideY };
  const forwardX = lateral.y;
  const forwardY = -lateral.x;
  const alongSide = relativeX * lateral.x + relativeY * lateral.y;
  const alongBow = relativeX * forwardX + relativeY * forwardY;
  const stagingDistance = Math.max(150, (enemy.setup?.shieldGeometry?.radiusY ?? 25) * 4);
  if (
    approach.phase === 'flank' &&
    alongSide * side >= stagingDistance * 0.8 &&
    Math.abs(alongBow) < 100
  ) {
    approach.phase = 'impact';
  }
  if (approach.phase === 'impact') return predicted;
  return {
    x: enemy.position.x + lateral.x * side * stagingDistance,
    y: enemy.position.y + lateral.y * side * stagingDistance,
  };
}

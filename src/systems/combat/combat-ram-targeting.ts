import { isSecurityDrone } from '../../core/security-drone';
import type { CombatPoint, MutableCombatant } from './strategic-combat-types';

const ORBIT_TURN_RATE = 0.3;
const ORBIT_MIN_SPEED = 30;
const RAM_IMPACT_RETRY_SECONDS = 8;
const RAM_RETRY_COOLDOWN_SECONDS = 3;
const RAM_RETRY_DISTANCE = 160;

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

function shouldIntercept(enemy: MutableCombatant): boolean {
  return (
    isSecurityDrone(enemy.setup?.id) ||
    (Math.hypot(enemy.velocity.x, enemy.velocity.y) >= ORBIT_MIN_SPEED &&
      Math.abs(enemy.turnRateRadiansPerSecond ?? 0) >= ORBIT_TURN_RATE)
  );
}

function advanceRamApproach(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  sideX: number,
  sideY: number,
  deltaSeconds: number
): void {
  if (!ship.ramApproach) {
    const dx = ship.position.x - enemy.position.x;
    const dy = ship.position.y - enemy.position.y;
    const side = dx * sideX + dy * sideY < 0 ? -1 : 1;
    ship.ramApproach = { side, phase: 'flank', flankDirection: { x: sideX, y: sideY } };
  }
  const approach = ship.ramApproach;
  if (approach.phase === 'impact') advanceRamImpact(approach, range, sideX, sideY, deltaSeconds);
  advanceRetryCooldown(approach, deltaSeconds);
  if (approach.retryCooldownSeconds === undefined && shouldIntercept(enemy)) {
    // Latch interception mode so the maneuver cannot flip between
    // broadside staging and interception during each direction change.
    approach.intercept = true;
  }
}

function advanceRamImpact(
  approach: NonNullable<MutableCombatant['ramApproach']>,
  range: number,
  sideX: number,
  sideY: number,
  deltaSeconds: number
): void {
  approach.impactElapsedSeconds = (approach.impactElapsedSeconds ?? 0) + deltaSeconds;
  if (approach.impactElapsedSeconds < RAM_IMPACT_RETRY_SECONDS || range <= RAM_RETRY_DISTANCE) {
    return;
  }
  // A blocked or missed charge must release its direct-intercept lock and
  // re-stage from the opposite side instead of chasing forever.
  approach.phase = 'flank';
  approach.side = approach.side === 1 ? -1 : 1;
  approach.flankDirection = { x: sideX, y: sideY };
  approach.intercept = false;
  approach.impactElapsedSeconds = 0;
  approach.retryCooldownSeconds = RAM_RETRY_COOLDOWN_SECONDS;
}

function advanceRetryCooldown(
  approach: NonNullable<MutableCombatant['ramApproach']>,
  deltaSeconds: number
): void {
  if (approach.retryCooldownSeconds === undefined) return;
  approach.retryCooldownSeconds = Math.max(0, approach.retryCooldownSeconds - deltaSeconds);
  if (approach.retryCooldownSeconds === 0) delete approach.retryCooldownSeconds;
}

/**
 * One persistent approach choice. Slow targets permit a deliberate flank;
 * circling targets require a velocity-led interception, not pursuit of a
 * broadside waypoint that rotates away on every simulation frame.
 */
export function ramFlankTarget(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  deltaSeconds: number
): CombatPoint {
  if (!Number.isFinite(enemy.headingRadians)) return enemy.position;
  const sideX = -Math.sin(enemy.headingRadians);
  const sideY = Math.cos(enemy.headingRadians);
  const relativeX = ship.position.x - enemy.position.x;
  const relativeY = ship.position.y - enemy.position.y;
  const range = Math.hypot(relativeX, relativeY);
  advanceRamApproach(ship, enemy, range, sideX, sideY, deltaSeconds);
  const approach = ship.ramApproach!;

  const predicted = ramPredictedPosition(enemy, ramInterceptSeconds(ship, enemy));
  if (approach.intercept) {
    if (range < 470 && approach.phase !== 'impact') {
      approach.phase = 'impact';
      approach.impactElapsedSeconds = 0;
    }
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
    approach.impactElapsedSeconds = 0;
  }
  if (approach.phase === 'impact') return predicted;
  return {
    x: enemy.position.x + lateral.x * side * stagingDistance,
    y: enemy.position.y + lateral.y * side * stagingDistance,
  };
}

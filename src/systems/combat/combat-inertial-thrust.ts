import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  CombatPoint,
} from './strategic-combat-types';
import { clamp, EDGE_PADDING } from './strategic-combat-geometry';

/**
 * Every hull can anchor its maneuver tractor to a massive nearby asteroid to
 * build speed faster. The anchor never moves or becomes throwable ammunition.
 * Free space and small drifting debris provide no reaction mass.
 */
export function tractorAccelerationFactor(
  ship: MutableCombatant,
  direction: CombatPoint,
  arena: StrategicCombatArenaOptions
): number {
  if (
    ship.boostActive !== true ||
    ship.subsystems.tractor <= 0 ||
    (ship.setup.tractorRangeMeters ?? 0) <= 0
  )
    return 1;
  const reach = ship.setup.tractorRangeMeters ?? 0;
  const anchor = (arena.asteroids ?? []).some((rock) => {
    if (rock.kind !== 'resource' || rock.radius < 35) return false;
    const awayX = ship.position.x - rock.position.x;
    const awayY = ship.position.y - rock.position.y;
    const distance = Math.hypot(awayX, awayY);
    return (
      distance > rock.radius + 40 &&
      distance <= reach &&
      (direction.x * awayX + direction.y * awayY) / distance >= 0.7
    );
  });
  return anchor ? 1.2 : 1;
}

export function applyInertialThrust(
  combatant: MutableCombatant,
  headingError: number,
  targetSpeedFactor: number,
  baseSpeed: number,
  acceleration: number,
  tractorLocked: boolean,
  dt: number,
  arena: StrategicCombatArenaOptions,
  rcsStrafe?: CombatPoint
): void {
  const alignment = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
  const boosted = combatant.boostActive === true;
  const requested = baseSpeed * targetSpeedFactor * alignment * (boosted ? 1.65 : 1);
  const targetSpeed = tractorLocked ? Math.min(requested, 25) : requested;
  const thrust = rcsStrafe ?? {
    x: Math.cos(combatant.headingRadians),
    y: Math.sin(combatant.headingRadians),
  };
  const dx = thrust.x * targetSpeed - combatant.velocity.x;
  const dy = thrust.y * targetSpeed - combatant.velocity.y;
  const change = Math.hypot(dx, dy);
  const slowing = dx * combatant.velocity.x + dy * combatant.velocity.y < 0;
  const tractorAssist = tractorLocked ? 1 : tractorAccelerationFactor(combatant, thrust, arena);
  const fraction = Math.min(
    1,
    (acceleration *
      tractorAssist *
      (boosted ? 1 + 2.5 * Math.min(1, (combatant.boostRampSeconds ?? 0) / 2) : 1) *
      (rcsStrafe ? 0.4 : 1) *
      (slowing ? 1.35 : 1) *
      dt) /
      Math.max(0.001, change)
  );
  combatant.velocity.x += dx * fraction;
  combatant.velocity.y += dy * fraction;
  const speed = Math.hypot(combatant.velocity.x, combatant.velocity.y);
  const limit = tractorLocked ? 25 : baseSpeed * (boosted ? 1.65 : 1.05);
  if (speed > limit) {
    combatant.velocity.x *= limit / speed;
    combatant.velocity.y *= limit / speed;
  }

  const padding = arena.useFieldBounds ? 0 : EDGE_PADDING;
  const nextX = combatant.position.x + combatant.velocity.x * dt;
  const nextY = combatant.position.y + combatant.velocity.y * dt;
  combatant.position.x = clamp(nextX, padding, arena.width - padding);
  combatant.position.y = clamp(nextY, padding, arena.height - padding);
  if (nextX !== combatant.position.x) combatant.velocity.x = 0;
  if (nextY !== combatant.position.y) combatant.velocity.y = 0;
}

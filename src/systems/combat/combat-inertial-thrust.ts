import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  CombatPoint,
} from './strategic-combat-types';
import { applyShipVelocityCommand, shipFlightBounds } from '../../core/ship-flight-physics';
import { EDGE_PADDING } from './strategic-combat-geometry';

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
  const requested = baseSpeed * targetSpeedFactor * alignment;
  const thrust = rcsStrafe ?? {
    x: Math.cos(combatant.headingRadians),
    y: Math.sin(combatant.headingRadians),
  };
  const tractorAssist = tractorLocked ? 1 : tractorAccelerationFactor(combatant, thrust, arena);
  const padding = arena.useFieldBounds ? 0 : EDGE_PADDING;
  applyShipVelocityCommand(combatant, {
    direction: thrust,
    acceleration,
    deltaSeconds: dt,
    boost: {
      active: boosted,
      speedMultiplier: 1.65,
      accelerationRampMultiplier: 2.5,
      rampSeconds: combatant.boostRampSeconds ?? 0,
      rampDurationSeconds: 2,
    },
    ...(tractorLocked ? { targetSpeedCap: 25 } : {}),
    accelerationMultiplier: tractorAssist,
    ...(rcsStrafe ? { rcsMultiplier: 0.4 } : {}),
    targetSpeed: requested,
    maxSpeed: tractorLocked ? 25 : baseSpeed * (boosted ? 1.65 : 1.05),
    bounds: shipFlightBounds(arena.width, arena.height, padding),
  });
}

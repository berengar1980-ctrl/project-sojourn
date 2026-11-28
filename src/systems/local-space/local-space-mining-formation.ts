import type {
  LocalAsteroid,
  LocalShipState,
  LocalSpaceInstance,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  applyShipVelocityCommand,
  shipFlightBounds,
  turnShipTowardHeading,
  type ShipFlightPerformance,
  type ShipFlightBounds,
} from '../../core/ship-flight-physics';
import { heading } from './local-space-motion';

const MAX_TURN_RATE = 1.15;

interface MiningFormationOptions {
  readonly ship: LocalShipState;
  readonly asteroid: LocalAsteroid;
  readonly asteroids: readonly LocalAsteroid[];
  readonly holdOffset: WorldPoint | null;
  readonly shieldRadiusX: number;
  readonly deltaSeconds: number;
  readonly performance?: ShipFlightPerformance;
  readonly bounds?: ShipFlightBounds;
}

function closestClosingDebris(
  ship: LocalShipState,
  asteroids: readonly LocalAsteroid[],
  shieldRadiusX: number
): { dx: number; dy: number } | null {
  const threat = asteroids
    .filter((asteroid) => asteroid.kind === 'debris')
    .map((asteroid) => {
      const dx = asteroid.position.x - ship.position.x;
      const dy = asteroid.position.y - ship.position.y;
      return { asteroid, dx, dy, range: Math.hypot(dx, dy) };
    })
    .filter(({ asteroid, dx, dy, range }) => {
      if (range > shieldRadiusX + asteroid.radius + 32) return false;
      const closing = dx * asteroid.physics.velocity.x + dy * asteroid.physics.velocity.y;
      return closing < 0;
    })
    .sort((a, b) => a.range - b.range)[0];

  return threat ? { dx: threat.dx, dy: threat.dy } : null;
}

export function advanceMiningFormation(options: MiningFormationOptions): void {
  const { ship, asteroid, holdOffset, deltaSeconds } = options;
  if (!holdOffset) {
    ship.lateralThrust = 0;
    ship.turnRateRadiansPerSecond = 0;
    ship.angularThrust = 0;
    return;
  }

  const desiredPosition = {
    x: asteroid.position.x + holdOffset.x,
    y: asteroid.position.y + holdOffset.y,
  };
  const desiredHeading = heading(ship.position, asteroid.position);
  const turnRate = options.performance?.turnRateRadiansPerSecond ?? MAX_TURN_RATE;
  turnShipTowardHeading(ship, desiredHeading, turnRate * 0.35, deltaSeconds);

  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  const sideX = -forwardY;
  const sideY = forwardX;
  const errorX = desiredPosition.x - ship.position.x;
  const errorY = desiredPosition.y - ship.position.y;
  const forwardError = errorX * forwardX + errorY * forwardY;
  const lateralError = errorX * sideX + errorY * sideY;

  const threat = closestClosingDebris(ship, options.asteroids, options.shieldRadiusX);
  let targetLateral = Math.max(-3.5, Math.min(3.5, lateralError * 0.13));
  if (threat) {
    const threatSide = threat.dx * sideX + threat.dy * sideY;
    targetLateral = threatSide >= 0 ? -3.5 : 3.5;
  }

  const targetForward = Math.max(-3.2, Math.min(4.5, forwardError * 0.11));
  const targetX = forwardX * targetForward + sideX * targetLateral;
  const targetY = forwardY * targetForward + sideY * targetLateral;
  const targetSpeed = Math.hypot(targetX, targetY);
  const acceleration = options.performance?.accelerationMetersPerSecond2 ?? 2.2;
  const targetHeadingRadians = Math.atan2(targetY, targetX);
  ship.longitudinalThrust = targetForward / 4.5;
  ship.lateralThrust = targetLateral / 3.5;
  applyShipVelocityCommand(ship, {
    direction:
      targetSpeed > 0
        ? { x: Math.cos(targetHeadingRadians), y: Math.sin(targetHeadingRadians) }
        : { x: 0, y: 0 },
    targetSpeed,
    acceleration,
    accelerationMultiplier: options.performance ? 0.4 : 1,
    deltaSeconds,
    maxSpeed: Math.hypot(4.5, 3.5),
    ...(options.bounds ? { bounds: options.bounds } : {}),
  });
}

export function advanceFieldMiningFormation(
  instance: LocalSpaceInstance,
  asteroid: LocalAsteroid,
  holdOffset: WorldPoint | null,
  shieldRadiusX: number,
  deltaSeconds: number,
  performance?: ShipFlightPerformance
): void {
  advanceMiningFormation({
    ship: instance.ship,
    asteroid,
    asteroids: instance.asteroids,
    holdOffset,
    shieldRadiusX,
    deltaSeconds,
    ...(performance ? { performance } : {}),
    bounds: shipFlightBounds(instance.width, instance.height),
  });
}

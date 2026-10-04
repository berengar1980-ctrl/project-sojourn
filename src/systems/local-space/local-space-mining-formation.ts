import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { angleDelta, heading, turnToward } from './local-space-motion';

const MAX_TURN_RATE = 1.15;

interface MiningFormationOptions {
  readonly ship: LocalShipState;
  readonly asteroid: LocalAsteroid;
  readonly asteroids: readonly LocalAsteroid[];
  readonly holdOffset: WorldPoint | null;
  readonly shieldRadiusX: number;
  readonly forwardVelocity: number;
  readonly lateralVelocity: number;
  readonly deltaSeconds: number;
}

export interface MiningFormationVelocity {
  readonly forward: number;
  readonly lateral: number;
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

export function advanceMiningFormation(
  options: MiningFormationOptions
): MiningFormationVelocity {
  const { ship, asteroid, holdOffset, deltaSeconds } = options;
  if (!holdOffset) {
    ship.speed = 0;
    ship.lateralThrust = 0;
    ship.turnRateRadiansPerSecond = 0;
    ship.angularThrust = 0;
    return { forward: options.forwardVelocity, lateral: options.lateralVelocity };
  }

  const desiredPosition = {
    x: asteroid.position.x + holdOffset.x,
    y: asteroid.position.y + holdOffset.y,
  };
  const desiredHeading = heading(ship.position, asteroid.position);
  const previousHeading = ship.headingRadians;
  ship.headingRadians = turnToward(
    ship.headingRadians,
    desiredHeading,
    MAX_TURN_RATE * 0.35 * deltaSeconds
  );
  ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
  ship.angularThrust = Math.max(
    -1,
    Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 8))
  );

  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  const sideX = -forwardY;
  const sideY = forwardX;
  const errorX = desiredPosition.x - ship.position.x;
  const errorY = desiredPosition.y - ship.position.y;
  const forwardError = errorX * forwardX + errorY * forwardY;
  const lateralError = errorX * sideX + errorY * sideY;

  const threat = closestClosingDebris(ship, options.asteroids, options.shieldRadiusX);
  let lateralThrust = -options.lateralVelocity * 0.68 + lateralError * 0.13;
  lateralThrust = Math.max(-0.62, Math.min(0.62, lateralThrust));
  if (threat) {
    const threatSide = threat.dx * sideX + threat.dy * sideY;
    lateralThrust = threatSide >= 0 ? -1 : 1;
  }
  if (Math.abs(lateralError) < 1.5 && Math.abs(options.lateralVelocity) < 0.18) {
    lateralThrust = 0;
  }

  let forwardThrust = -options.forwardVelocity * 0.62 + forwardError * 0.11;
  forwardThrust = Math.max(-0.52, Math.min(0.72, forwardThrust));
  if (Math.abs(forwardError) < 1.5 && Math.abs(options.forwardVelocity) < 0.2) {
    forwardThrust = 0;
  }

  const lateral = Math.max(
    -3.5,
    Math.min(3.5, options.lateralVelocity + lateralThrust * 2.2 * deltaSeconds)
  );
  const forward = Math.max(
    -3.2,
    Math.min(4.5, options.forwardVelocity + forwardThrust * 2.8 * deltaSeconds)
  );

  ship.lateralThrust = lateralThrust;
  ship.position = {
    x: ship.position.x + (forwardX * forward + sideX * lateral) * deltaSeconds,
    y: ship.position.y + (forwardY * forward + sideY * lateral) * deltaSeconds,
  };
  ship.speed = Math.max(0, forward);
  return { forward, lateral };
}

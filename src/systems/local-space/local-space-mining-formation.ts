import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { angleDelta, heading, turnToward } from './local-space-motion';
import {
  localShipForwardSpeed,
  localShipLateralSpeed,
  setLocalShipComponents,
} from './local-space-ship-velocity';

const MAX_TURN_RATE = 1.15;

interface MiningFormationOptions {
  readonly ship: LocalShipState;
  readonly asteroid: LocalAsteroid;
  readonly asteroids: readonly LocalAsteroid[];
  readonly holdOffset: WorldPoint | null;
  readonly shieldRadiusX: number;
  readonly deltaSeconds: number;
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
  const currentLateral = localShipLateralSpeed(ship);
  const currentForward = localShipForwardSpeed(ship);
  let lateralThrust = -currentLateral * 0.68 + lateralError * 0.13;
  lateralThrust = Math.max(-0.62, Math.min(0.62, lateralThrust));
  if (threat) {
    const threatSide = threat.dx * sideX + threat.dy * sideY;
    lateralThrust = threatSide >= 0 ? -1 : 1;
  }
  if (Math.abs(lateralError) < 1.5 && Math.abs(currentLateral) < 0.18) {
    lateralThrust = 0;
  }

  let forwardThrust = -currentForward * 0.62 + forwardError * 0.11;
  forwardThrust = Math.max(-0.52, Math.min(0.72, forwardThrust));
  if (Math.abs(forwardError) < 1.5 && Math.abs(currentForward) < 0.2) {
    forwardThrust = 0;
  }

  const lateral = Math.max(
    -3.5,
    Math.min(3.5, currentLateral + lateralThrust * 2.2 * deltaSeconds)
  );
  const forward = Math.max(
    -3.2,
    Math.min(4.5, currentForward + forwardThrust * 2.8 * deltaSeconds)
  );

  ship.lateralThrust = lateralThrust;
  setLocalShipComponents(ship, forward, lateral);
  ship.position = {
    x: ship.position.x + (forwardX * forward + sideX * lateral) * deltaSeconds,
    y: ship.position.y + (forwardY * forward + sideY * lateral) * deltaSeconds,
  };
}

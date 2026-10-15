import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import {
  clamp,
  wrapAngle,
  DEFAULT_ACCELERATION,
  DEFAULT_TURN_RATE,
  EDGE_PADDING,
} from './strategic-combat-geometry';

/** Transient actuator command. Navigation owns velocity; weapons may request a separate bow angle. */
export interface CombatFlightControl {
  readonly velocity: CombatPoint;
  readonly heading: number;
}

/** The only integrator for powered combat flight, in campaign and PvP battles. */
export function pilotCombatFlight(
  ship: MutableCombatant,
  order: CombatFlightControl,
  arena: StrategicCombatArenaOptions,
  dt: number,
  tractorLocked = false
): void {
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const error = wrapAngle(order.heading - ship.headingRadians);
  const turn = clamp(error, -turnRate * dt, turnRate * dt);
  ship.headingRadians = wrapAngle(ship.headingRadians + turn);
  ship.turnRateRadiansPerSecond = dt > 0 ? turn / dt : 0;
  ship.angularThrust = clamp(error / turnRate, -1, 1);
  const acceleration = Math.max(
    12,
    ship.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  const boosting = ship.boostActive === true;
  // Main drive accelerates along the bow. RCS provides weaker lateral
  // corrections and limited reverse thrust while preserving existing momentum.
  const changeX = order.velocity.x - ship.velocity.x;
  const changeY = order.velocity.y - ship.velocity.y;
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  const longitudinal = changeX * forwardX + changeY * forwardY;
  const lateral = -changeX * forwardY + changeY * forwardX;
  const boostStrength = boosting ? 1 + 2.5 * Math.min(1, (ship.boostRampSeconds ?? 0) / 2) : 1;
  const mainStep = acceleration * dt * boostStrength;
  let forwardStep = clamp(longitudinal, -mainStep * 0.65, mainStep);
  let lateralStep = clamp(lateral, -mainStep * 0.4, mainStep * 0.4);
  // Main drive and lateral RCS share the ship's acceleration budget.
  // Independent clamping would allow a diagonal impulse above its physical cap.
  const impulseMagnitude = Math.hypot(forwardStep, lateralStep);
  if (impulseMagnitude > mainStep) {
    const scale = mainStep / impulseMagnitude;
    forwardStep *= scale;
    lateralStep *= scale;
  }
  ship.longitudinalThrust =
    ship.subsystems.engine > 0 && forwardStep < 0
      ? clamp(forwardStep / (mainStep * 0.65), -1, 0)
      : 0;
  ship.lateralThrust =
    ship.subsystems.engine > 0 ? clamp(lateralStep / (mainStep * 0.4), -1, 1) : 0;
  if (ship.subsystems.engine > 0) {
    ship.velocity.x += forwardX * forwardStep - forwardY * lateralStep;
    ship.velocity.y += forwardY * forwardStep + forwardX * lateralStep;
  }
  if (tractorLocked && ship.subsystems.engine > 0) {
    const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
    const scale = Math.min(1, 25 / Math.max(0.001, speed));
    ship.velocity.x *= scale;
    ship.velocity.y *= scale;
  }
  const nextX = ship.position.x + ship.velocity.x * dt;
  const nextY = ship.position.y + ship.velocity.y * dt;
  ship.position.x = clamp(nextX, EDGE_PADDING, arena.width - EDGE_PADDING);
  ship.position.y = clamp(nextY, EDGE_PADDING, arena.height - EDGE_PADDING);
  if (ship.position.x !== nextX) ship.velocity.x = 0;
  if (ship.position.y !== nextY) ship.velocity.y = 0;
  ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
}

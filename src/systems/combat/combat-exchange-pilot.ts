import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import type { CombatAction, CombatReaction, CombatExchange } from './combat-exchange-machine';
import {
  clamp,
  normalize,
  wrapAngle,
  DEFAULT_ACCELERATION,
  DEFAULT_TURN_RATE,
  EDGE_PADDING,
} from './strategic-combat-geometry';

export interface ExchangeFlightPlan {
  readonly initiatorGoal: CombatPoint;
  readonly reactorGoal: CombatPoint;
  readonly initiatorHeading: number;
  readonly reactorHeading: number;
}

function offsetPoint(
  point: CombatPoint,
  toward: CombatPoint,
  forward: number,
  side: number
): CombatPoint {
  return {
    x: point.x + toward.x * forward - toward.y * side,
    y: point.y + toward.y * forward + toward.x * side,
  };
}

export function planExchangeFlight(
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  action: CombatAction,
  reaction: CombatReaction,
  quality: CombatExchange['quality']
): ExchangeFlightPlan {
  const toward = normalize(
    reactor.position.x - initiator.position.x,
    reactor.position.y - initiator.position.y
  );
  const side = quality === 'failed' ? -1 : 1;
  // Each action represents a distinct, committed flight trajectory.
  const attacking =
    action === 'frontal_pass'
      ? offsetPoint(reactor.position, toward, 230, side * 120)
      : action === 'broadside_pass'
        ? offsetPoint(reactor.position, toward, -60, side * 290)
        : action === 'disengage_fire'
          ? offsetPoint(initiator.position, toward, -460, side * 60)
          : offsetPoint(reactor.position, toward, 170, side * 460);
  const defender =
    reaction === 'evade'
      ? offsetPoint(reactor.position, toward, -80, -330 * side)
      : reaction === 'accelerate_clear'
        ? offsetPoint(reactor.position, toward, 300, -230 * side)
        : reaction === 'extend_range'
          ? offsetPoint(reactor.position, toward, 390, 0)
          : reaction === 'break_contact'
            ? offsetPoint(reactor.position, toward, 390, 180 * side)
            : reaction === 'close_gap'
              ? offsetPoint(reactor.position, toward, -350, 0)
              : reaction === 'intercept'
                ? offsetPoint(initiator.position, toward, 100, -130 * side)
                : reaction === 'pursue'
                  ? offsetPoint(initiator.position, toward, -140, 0)
                  : reaction === 'cross_pass'
                    ? offsetPoint(initiator.position, toward, -170, -240 * side)
                    : reaction === 'counter_pass'
                      ? offsetPoint(initiator.position, toward, 0, 250 * side)
                      : { ...reactor.position };
  const facing = Math.atan2(toward.y, toward.x);
  const broadside = action === 'broadside_pass' ? Math.PI / 2 : 0;
  const defendingBroadside =
    reaction === 'counter_pass' || reaction === 'counterfire'
      ? Math.PI / 2
      : 0;
  return {
    initiatorGoal: attacking,
    reactorGoal: defender,
    initiatorHeading: facing + broadside,
    reactorHeading:
      facing + Math.PI + defendingBroadside + (reaction === 'turn_to_face' ? 0.12 : 0),
  };
}

export function pilotExchangeShip(
  ship: MutableCombatant,
  role: 'initiator' | 'reactor',
  plan: ExchangeFlightPlan,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const goal = role === 'initiator' ? plan.initiatorGoal : plan.reactorGoal;
  const weaponFacing = role === 'initiator' ? plan.initiatorHeading : plan.reactorHeading;
  const dx = goal.x - ship.position.x;
  const dy = goal.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  // Accelerate on the navigation heading first. Only rotate into a firing
  // posture after the ship has established real forward momentum.
  const navigationHeading = Math.atan2(dy, dx);
  const forwardVelocity =
    ship.velocity.x * Math.cos(ship.headingRadians) +
    ship.velocity.y * Math.sin(ship.headingRadians);
  const facing =
    distance < 90 || (forwardVelocity >= 45 && distance < 260)
      ? weaponFacing
      : navigationHeading;
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const error = wrapAngle(facing - ship.headingRadians);
  const turn = clamp(error, -turnRate * dt, turnRate * dt);
  ship.headingRadians = wrapAngle(ship.headingRadians + turn);
  ship.turnRateRadiansPerSecond = turn / Math.max(dt, 0.001);
  ship.angularThrust = clamp(error / turnRate, -1, 1);
  const direction = normalize(dx, dy);
  const acceleration = Math.max(
    12,
    ship.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  const speedLimit = Math.max(65, ship.setup.combatSpeed ?? 120);
  const brakingSpeed = Math.sqrt(2 * acceleration * distance);
  const targetSpeed = ship.subsystems.engine <= 0 ? 0 : Math.min(speedLimit, brakingSpeed);
  const desiredX = distance < 12 ? 0 : direction.x * targetSpeed;
  const desiredY = distance < 12 ? 0 : direction.y * targetSpeed;
  // Main drive accelerates along the bow. RCS provides weaker lateral
  // corrections and limited reverse thrust while preserving existing momentum.
  const changeX = desiredX - ship.velocity.x;
  const changeY = desiredY - ship.velocity.y;
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  const longitudinal = changeX * forwardX + changeY * forwardY;
  const lateral = -changeX * forwardY + changeY * forwardX;
  const mainStep = acceleration * dt;
  const forwardStep = clamp(longitudinal, -mainStep * 0.25, mainStep);
  const lateralStep = clamp(lateral, -mainStep * 0.12, mainStep * 0.12);
  if (ship.subsystems.engine > 0) {
    ship.velocity.x += forwardX * forwardStep - forwardY * lateralStep;
    ship.velocity.y += forwardY * forwardStep + forwardX * lateralStep;
  }
  const nextX = ship.position.x + ship.velocity.x * dt;
  const nextY = ship.position.y + ship.velocity.y * dt;
  ship.position.x = clamp(nextX, EDGE_PADDING, arena.width - EDGE_PADDING);
  ship.position.y = clamp(nextY, EDGE_PADDING, arena.height - EDGE_PADDING);
  if (ship.position.x !== nextX) ship.velocity.x = 0;
  if (ship.position.y !== nextY) ship.velocity.y = 0;
  ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
}

import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import type { CombatAction, CombatReaction, CombatExchange } from './combat-exchange-machine';
import { combatRouteHeading } from './combat-asteroid-routing';
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
  // Shared passing corridor: the two pilots use opposite WORLD-SIDE lanes.
  // This avoids the head-on case where both autonomous pilots dodge into each other.
  const lateral = { x: -toward.y, y: toward.x };
  const separation = 175;
  const attackingLane = {
    x: attacking.x + lateral.x * separation,
    y: attacking.y + lateral.y * separation,
  };
  const defenderLane = {
    x: defender.x - lateral.x * separation,
    y: defender.y - lateral.y * separation,
  };
  const facing = Math.atan2(toward.y, toward.x);
  const broadside = action === 'broadside_pass' ? Math.PI / 2 : 0;
  const defendingBroadside =
    reaction === 'counter_pass' || reaction === 'counterfire' ? Math.PI / 2 : 0;
  return {
    initiatorGoal: attackingLane,
    reactorGoal: defenderLane,
    initiatorHeading: facing + broadside,
    reactorHeading:
      facing + Math.PI + defendingBroadside + (reaction === 'turn_to_face' ? 0.12 : 0),
  };
}

export const BOOST_DURATION_SECONDS = 3.5;
export const BOOST_COOLDOWN_SECONDS = 14;

export function activateExchangeBoost(ship: MutableCombatant): boolean {
  if (ship.subsystems.engine <= 0 || (ship.boostSeconds ?? BOOST_DURATION_SECONDS) <= 0)
    return false;
  ship.boostActive = true;
  return true;
}

export function stopExchangeBoost(ship: MutableCombatant): void {
  ship.boostActive = false;
}

export function updateExchangeBoost(ship: MutableCombatant, dt: number): void {
  const charge = ship.boostSeconds ?? BOOST_DURATION_SECONDS;
  const active = ship.boostActive === true && ship.subsystems.engine > 0 && charge > 0;
  if (active) {
    ship.boostSeconds = Math.max(0, charge - dt);
    if (ship.boostSeconds === 0) ship.boostActive = false;
  } else {
    ship.boostActive = false;
    // A completely depleted tank takes 14 seconds to refill:
    // first third 6s, middle third 4.5s, final third 3.5s.
    const third = BOOST_DURATION_SECONDS / 3;
    let remaining = Math.max(0, dt);
    let energy = charge;
    while (remaining > 0 && energy < BOOST_DURATION_SECONDS) {
      const stage = energy < third ? 0 : energy < third * 2 ? 1 : 2;
      const boundary = stage === 0 ? third : stage === 1 ? third * 2 : BOOST_DURATION_SECONDS;
      const secondsPerThird = stage === 0 ? 6 : stage === 1 ? 4.5 : 3.5;
      const rate = third / secondsPerThird;
      const timeToBoundary = (boundary - energy) / rate;
      const elapsed = Math.min(remaining, timeToBoundary);
      energy = Math.min(boundary, energy + elapsed * rate);
      remaining -= elapsed;
    }
    ship.boostSeconds = energy;
  }
  const energy = ship.boostSeconds ?? BOOST_DURATION_SECONDS;
  const third = BOOST_DURATION_SECONDS / 3;
  ship.boostCooldownSeconds =
    (energy < third ? (third - energy) * (6 / third) + 8 : 0) +
    (energy >= third && energy < third * 2 ? (third * 2 - energy) * (4.5 / third) + 3.5 : 0) +
    (energy >= third * 2 ? (BOOST_DURATION_SECONDS - energy) * (3.5 / third) : 0);
}

function accelerateExchangeShip(
  ship: MutableCombatant,
  goal: CombatPoint,
  distance: number,
  boosting: boolean,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const dx = goal.x - ship.position.x;
  const dy = goal.y - ship.position.y;
  // Keep the established flight vector after crossing a waypoint;
  // chasing a point behind the ship would cause a stationary spin.
  const direction =
    distance < 95
      ? normalize(
          ship.velocity.x || Math.cos(ship.headingRadians),
          ship.velocity.y || Math.sin(ship.headingRadians)
        )
      : normalize(dx, dy);
  const acceleration = Math.max(
    12,
    ship.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  const speedLimit = Math.max(65, ship.setup.combatSpeed ?? 120) * (boosting ? 1.65 : 1);
  const brakingSpeed = distance < 95 ? speedLimit : Math.sqrt(2 * acceleration * distance);
  const targetSpeed = ship.subsystems.engine <= 0 ? 0 : Math.min(speedLimit, brakingSpeed);
  // Do not park at the waypoint during an exchange: continue a controlled pass.
  const desiredX = direction.x * targetSpeed;
  const desiredY = direction.y * targetSpeed;
  // Main drive accelerates along the bow. RCS provides weaker lateral
  // corrections and limited reverse thrust while preserving existing momentum.
  const changeX = desiredX - ship.velocity.x;
  const changeY = desiredY - ship.velocity.y;
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  const longitudinal = changeX * forwardX + changeY * forwardY;
  const lateral = -changeX * forwardY + changeY * forwardX;
  const boostStrength = boosting ? 1 + 2.5 * Math.min(1, (ship.boostRampSeconds ?? 0) / 2) : 1;
  const mainStep = acceleration * dt * boostStrength;
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

export function pilotExchangeShip(
  ship: MutableCombatant,
  role: 'initiator' | 'reactor',
  plan: ExchangeFlightPlan,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  updateExchangeBoost(ship, dt);
  const boosting = ship.boostActive === true;
  if (boosting) ship.boostRampSeconds = Math.min(2, (ship.boostRampSeconds ?? 0) + dt);
  else ship.boostRampSeconds = 0;
  const planned = role === 'initiator' ? plan.initiatorGoal : plan.reactorGoal;
  const goal =
    ship.tactic === 'flee' && arena.exitPoint
      ? arena.exitPoint
      : {
          x: clamp(planned.x, EDGE_PADDING + 100, arena.width - EDGE_PADDING - 100),
          y: clamp(planned.y, EDGE_PADDING + 100, arena.height - EDGE_PADDING - 100),
        };
  // Route is established before thrust. Follow a navigable waypoint rather than
  // cutting through a rock on the way to the tactical maneuver destination.
  const route = combatRouteHeading(ship, goal, arena, dt);
  const safeGoal = route
    ? { x: ship.position.x + route.x * 200, y: ship.position.y + route.y * 200 }
    : goal;
  const weaponFacing = role === 'initiator' ? plan.initiatorHeading : plan.reactorHeading;
  const dx = safeGoal.x - ship.position.x;
  const dy = safeGoal.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  // Accelerate on the navigation heading first. Only rotate into a firing
  // posture after the ship has established real forward momentum.
  const navigationHeading = distance < 95 ? ship.headingRadians : Math.atan2(dy, dx);
  const forwardVelocity =
    ship.velocity.x * Math.cos(ship.headingRadians) +
    ship.velocity.y * Math.sin(ship.headingRadians);
  const facing =
    !route && (distance < 90 || (forwardVelocity >= 45 && distance < 260))
      ? weaponFacing
      : navigationHeading;
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const error = wrapAngle(facing - ship.headingRadians);
  const turn = clamp(error, -turnRate * dt, turnRate * dt);
  ship.headingRadians = wrapAngle(ship.headingRadians + turn);
  ship.turnRateRadiansPerSecond = turn / Math.max(dt, 0.001);
  ship.angularThrust = clamp(error / turnRate, -1, 1);
  accelerateExchangeShip(ship, safeGoal, distance, boosting && !route, arena, dt);
}

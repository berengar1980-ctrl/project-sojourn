import { createCombatFlightOrder } from './combat-flight-order';
import { pilotCombatFlight } from './combat-flight-controller';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import type { CombatAction, CombatReaction, CombatExchange } from './combat-exchange-machine';
import { combatRouteHeading } from './combat-asteroid-routing';
import { clamp, normalize, DEFAULT_ACCELERATION, EDGE_PADDING } from './strategic-combat-geometry';

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

function interceptPoint(chaser: MutableCombatant, target: MutableCombatant): CombatPoint {
  const distance = Math.hypot(
    target.position.x - chaser.position.x,
    target.position.y - chaser.position.y
  );
  const speed = Math.max(65, chaser.setup.combatSpeed ?? 120);
  const leadSeconds = clamp(distance / speed, 0.5, 5);
  return {
    x: target.position.x + target.velocity.x * leadSeconds,
    y: target.position.y + target.velocity.y * leadSeconds,
  };
}

function reactionGoal(
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  toward: CombatPoint,
  side: number,
  reaction: CombatReaction
): CombatPoint {
  return reaction === 'evade'
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
              ? interceptPoint(reactor, initiator)
              : reaction === 'pursue'
                ? offsetPoint(initiator.position, toward, -140, 0)
                : reaction === 'cross_pass'
                  ? offsetPoint(initiator.position, toward, -170, -240 * side)
                  : reaction === 'counter_pass'
                    ? offsetPoint(initiator.position, toward, 0, 250 * side)
                    : { ...reactor.position };
}

export function planExchangeFlight(
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  action: CombatAction,
  reaction: CombatReaction,
  quality: CombatExchange['quality'],
  deliberateRam = false
): ExchangeFlightPlan {
  const toward = normalize(
    reactor.position.x - initiator.position.x,
    reactor.position.y - initiator.position.y
  );
  const side = quality === 'failed' ? -1 : 1;
  // Each action represents a distinct, committed flight trajectory.
  const attacking =
    action === 'frontal_pass'
      ? offsetPoint(reactor.position, toward, deliberateRam ? 55 : -110, 0)
      : action === 'broadside_pass'
        ? offsetPoint(reactor.position, toward, -60, side * 290)
        : action === 'disengage_fire'
          ? offsetPoint(initiator.position, toward, -460, side * 60)
          : offsetPoint(reactor.position, toward, 170, side * 460);
  const defender = reactionGoal(initiator, reactor, toward, side, reaction);
  // Shared passing corridor: the two pilots use opposite WORLD-SIDE lanes.
  // This avoids the head-on case where both autonomous pilots dodge into each other.
  const lateral = { x: -toward.y, y: toward.x };
  const separation = 175;
  const attackingLane = {
    x: attacking.x + lateral.x * (action === 'frontal_pass' ? 0 : separation),
    y: attacking.y + lateral.y * (action === 'frontal_pass' ? 0 : separation),
  };
  const defenderLane = {
    x: defender.x - lateral.x * (reaction === 'intercept' ? 0 : separation),
    y: defender.y - lateral.y * (reaction === 'intercept' ? 0 : separation),
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

function desiredExchangeVelocity(
  ship: MutableCombatant,
  goal: CombatPoint,
  targetSpeed: number,
  opponent?: MutableCombatant
): CombatPoint {
  const range = opponent
    ? Math.hypot(opponent.position.x - ship.position.x, opponent.position.y - ship.position.y)
    : Infinity;
  const match = range < 650 && ship.tactic !== 'flee' ? 0.65 : 0;
  const direction = normalize(goal.x - ship.position.x, goal.y - ship.position.y);
  return {
    x: direction.x * targetSpeed + (opponent?.velocity.x ?? 0) * match,
    y: direction.y * targetSpeed + (opponent?.velocity.y ?? 0) * match,
  };
}

function exchangeFacing(
  ship: MutableCombatant,
  opponent: MutableCombatant | undefined,
  trackTarget: boolean,
  route: CombatPoint | null,
  distance: number,
  forwardVelocity: number,
  weaponFacing: number,
  navigationHeading: number
): number {
  if (trackTarget && opponent && !route)
    return Math.atan2(opponent.position.y - ship.position.y, opponent.position.x - ship.position.x);
  return !route && (distance < 90 || (forwardVelocity >= 45 && distance < 260))
    ? weaponFacing
    : navigationHeading;
}

export function pilotExchangeShip(
  ship: MutableCombatant,
  role: 'initiator' | 'reactor',
  plan: ExchangeFlightPlan,
  arena: StrategicCombatArenaOptions,
  dt: number,
  opponent?: MutableCombatant,
  frontalApproach = false,
  trackTarget = false
): void {
  updateExchangeBoost(ship, dt);
  const boosting = ship.boostActive === true;
  if (boosting) ship.boostRampSeconds = Math.min(2, (ship.boostRampSeconds ?? 0) + dt);
  else ship.boostRampSeconds = 0;
  const planned = role === 'initiator' ? plan.initiatorGoal : plan.reactorGoal;
  const liveTarget = frontalApproach && opponent ? interceptPoint(ship, opponent) : planned;
  const goal = exchangeGoal(ship, liveTarget, arena, opponent);
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
  const navigationHeading =
    ship.tactic !== 'flee' && distance < 95 ? ship.headingRadians : Math.atan2(dy, dx);
  const forwardVelocity =
    ship.velocity.x * Math.cos(ship.headingRadians) +
    ship.velocity.y * Math.sin(ship.headingRadians);
  // Tracking must use the opponent's CURRENT position on every tick;
  // the maneuver's originally selected heading can become stale.
  let facing =
    ship.tactic === 'flee'
      ? navigationHeading
      : exchangeFacing(
          ship,
          opponent,
          trackTarget,
          route,
          distance,
          forwardVelocity,
          weaponFacing,
          navigationHeading
        );
  facing = liveWeaponFacing(ship, opponent, arena, route, facing);
  const acceleration = Math.max(
    12,
    ship.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  const speedLimit = Math.max(65, ship.setup.combatSpeed ?? 120) * (boosting && !route ? 1.65 : 1);
  const targetSpeed = Math.min(
    speedLimit,
    Math.sqrt(2 * acceleration * 0.32 * Math.max(0, distance - 35))
  );
  const velocity = desiredExchangeVelocity(
    ship,
    safeGoal,
    targetSpeed,
    route ? undefined : opponent
  );
  pilotCombatFlight(ship, { velocity, heading: facing }, arena, dt);
}

function liveWeaponFacing(
  ship: MutableCombatant,
  opponent: MutableCombatant | undefined,
  arena: StrategicCombatArenaOptions,
  route: CombatPoint | null,
  fallback: number
): number {
  let facing = fallback;
  // A maneuver supplies a destination, never a stale or wrong-side firing angle.
  if (ship.tactic !== 'flee' && !route && opponent && ship.setup.weapons?.length) {
    const range = Math.hypot(
      opponent.position.x - ship.position.x,
      opponent.position.y - ship.position.y
    );
    const weaponRange = Math.max(
      ...ship.setup.weapons.map(({ weapon }) => weapon?.rangeMeters ?? 0)
    );
    if (range <= weaponRange) facing = createCombatFlightOrder(ship, opponent, arena).heading;
  }
  return facing;
}

function exchangeGoal(
  ship: MutableCombatant,
  target: CombatPoint,
  arena: StrategicCombatArenaOptions,
  opponent?: MutableCombatant
): CombatPoint {
  if (ship.tactic === 'flee') {
    if (arena.exitPoint) return arena.exitPoint;
    if (opponent) {
      const away = normalize(
        ship.position.x - opponent.position.x,
        ship.position.y - opponent.position.y
      );
      return { x: ship.position.x + away.x * 600, y: ship.position.y + away.y * 600 };
    }
  }
  return {
    x: clamp(target.x, EDGE_PADDING + 100, arena.width - EDGE_PADDING - 100),
    y: clamp(target.y, EDGE_PADDING + 100, arena.height - EDGE_PADDING - 100),
  };
}

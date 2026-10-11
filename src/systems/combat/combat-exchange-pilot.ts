import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatSide,
} from './strategic-combat-types';
import type { CombatAction, CombatReaction, CombatExchange } from './combat-exchange-machine';
import { clamp, normalize, wrapAngle, DEFAULT_ACCELERATION, DEFAULT_TURN_RATE, EDGE_PADDING } from './strategic-combat-geometry';

export interface ExchangeFlightPlan {
  readonly attackerGoal: CombatPoint;
  readonly defenderGoal: CombatPoint;
  readonly attackerHeading: number;
  readonly defenderHeading: number;
}

function offsetPoint(point: CombatPoint, toward: CombatPoint, forward: number, side: number): CombatPoint {
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
  const toward = normalize(reactor.position.x - initiator.position.x, reactor.position.y - initiator.position.y);
  const side = quality === 'failed' ? -1 : 1;
  const spacing = action === 'flanking_pass' ? 300 : action === 'broadside_pass' ? 220 : 120;
  const attacking = action === 'disengage_fire'
    ? offsetPoint(initiator.position, toward, -420, 0)
    : offsetPoint(reactor.position, toward, action === 'frontal_pass' ? 150 : -80, side * spacing);
  const defender = reaction === 'evade' || reaction === 'accelerate_clear'
    ? offsetPoint(reactor.position, toward, 0, -330 * side)
    : reaction === 'extend_range' || reaction === 'break_contact'
      ? offsetPoint(reactor.position, toward, 0, 390)
      : reaction === 'close_gap' || reaction === 'intercept' || reaction === 'pursue'
        ? offsetPoint(reactor.position, toward, -350, 0)
        : { ...reactor.position };
  const facing = Math.atan2(toward.y, toward.x);
  const broadside = action === 'broadside_pass' ? Math.PI / 2 : 0;
  const defendingBroadside = reaction === 'counter_pass' || reaction === 'counterfire' || reaction === 'turn_to_face'
    ? Math.PI / 2
    : 0;
  return {
    attackerGoal: attacking,
    defenderGoal: defender,
    attackerHeading: facing + broadside,
    defenderHeading: facing + Math.PI + defendingBroadside,
  };
}

export function pilotExchangeShip(
  ship: MutableCombatant,
  side: StrategicCombatSide,
  plan: ExchangeFlightPlan,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const goal = side === 'attacker' ? plan.attackerGoal : plan.defenderGoal;
  const facing = side === 'attacker' ? plan.attackerHeading : plan.defenderHeading;
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const error = wrapAngle(facing - ship.headingRadians);
  const turn = clamp(error, -turnRate * dt, turnRate * dt);
  ship.headingRadians = wrapAngle(ship.headingRadians + turn);
  ship.turnRateRadiansPerSecond = turn / Math.max(dt, 0.001);
  ship.angularThrust = clamp(error / turnRate, -1, 1);
  const dx = goal.x - ship.position.x;
  const dy = goal.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  const direction = normalize(dx, dy);
  const acceleration = Math.max(12, ship.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION);
  const speedLimit = Math.max(65, ship.setup.combatSpeed ?? 120);
  const brakingSpeed = Math.sqrt(2 * acceleration * distance);
  const targetSpeed = ship.subsystems.engine <= 0 ? 0 : Math.min(speedLimit, brakingSpeed);
  const desiredX = distance < 12 ? 0 : direction.x * targetSpeed;
  const desiredY = distance < 12 ? 0 : direction.y * targetSpeed;
  const changeX = desiredX - ship.velocity.x;
  const changeY = desiredY - ship.velocity.y;
  const magnitude = Math.hypot(changeX, changeY);
  const fraction = Math.min(1, (acceleration * dt) / Math.max(0.001, magnitude));
  if (ship.subsystems.engine > 0) {
    ship.velocity.x += changeX * fraction;
    ship.velocity.y += changeY * fraction;
  }
  const nextX = ship.position.x + ship.velocity.x * dt;
  const nextY = ship.position.y + ship.velocity.y * dt;
  ship.position.x = clamp(nextX, EDGE_PADDING, arena.width - EDGE_PADDING);
  ship.position.y = clamp(nextY, EDGE_PADDING, arena.height - EDGE_PADDING);
  if (ship.position.x !== nextX) ship.velocity.x = 0;
  if (ship.position.y !== nextY) ship.velocity.y = 0;
  ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
}

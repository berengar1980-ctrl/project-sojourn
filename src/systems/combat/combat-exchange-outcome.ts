import type { CombatAction, CombatReaction } from './combat-exchange-machine';
import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { distance, wrapAngle } from './strategic-combat-geometry';

export interface ExchangeGeometry {
  readonly startingRange: number;
  readonly closestRange: number;
  readonly initiatorStart: CombatPoint;
  readonly reactorStart: CombatPoint;
}

export interface ExchangeOutcome {
  readonly actionSucceeded: boolean;
  readonly reactionSucceeded: boolean;
  readonly startingRange: number;
  readonly finalRange: number;
  readonly closestRange: number;
}

function facingTarget(ship: MutableCombatant, target: MutableCombatant): number {
  const bearing = Math.atan2(
    target.position.y - ship.position.y,
    target.position.x - ship.position.x
  );
  return Math.abs(wrapAngle(bearing - ship.headingRadians));
}

function actionSucceeded(
  action: CombatAction,
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  geometry: ExchangeGeometry,
  endRange: number
): boolean {
  const targetAngle = facingTarget(initiator, reactor);
  if (action === 'frontal_pass') {
    return (
      geometry.closestRange < 320 && distance(initiator.position, geometry.initiatorStart) > 130
    );
  }
  if (action === 'broadside_pass') {
    return endRange < 650 && Math.abs(targetAngle - Math.PI / 2) < 0.65;
  }
  if (action === 'disengage_fire') {
    return endRange > geometry.startingRange + 120;
  }
  // Flanking requires a reachable rear or lateral firing position, not a timer.
  return (
    endRange < 650 &&
    facingTarget(reactor, initiator) > Math.PI * 0.55 &&
    targetAngle < Math.PI * 0.6
  );
}

function reactionSucceeded(
  reaction: CombatReaction,
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  geometry: ExchangeGeometry,
  endRange: number
): boolean {
  const change = endRange - geometry.startingRange;
  const reactorAngle = facingTarget(reactor, initiator);
  const attackerAngle = facingTarget(initiator, reactor);
  if (reaction === 'evade' || reaction === 'accelerate_clear') {
    return geometry.closestRange > 210 || attackerAngle > Math.PI * 0.4;
  }
  if (reaction === 'extend_range' || reaction === 'break_contact') return change > 100;
  if (reaction === 'close_gap' || reaction === 'pursue' || reaction === 'intercept') {
    return change < -100;
  }
  if (reaction === 'turn_to_face' || reaction === 'counterfire') {
    return reactorAngle < Math.PI * 0.4 && endRange < 850;
  }
  if (reaction === 'hold_fire') return Math.abs(change) < 110;
  return geometry.closestRange < 440 && distance(reactor.position, geometry.reactorStart) > 110;
}

export function evaluateExchangeOutcome(
  action: CombatAction,
  reaction: CombatReaction,
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  geometry: ExchangeGeometry
): ExchangeOutcome {
  const finalRange = distance(initiator.position, reactor.position);
  return {
    actionSucceeded: actionSucceeded(action, initiator, reactor, geometry, finalRange),
    reactionSucceeded: reactionSucceeded(reaction, initiator, reactor, geometry, finalRange),
    startingRange: geometry.startingRange,
    finalRange,
    closestRange: geometry.closestRange,
  };
}

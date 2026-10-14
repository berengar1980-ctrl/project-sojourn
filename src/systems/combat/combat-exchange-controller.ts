import {
  chooseReactiveDecision,
  commitReactiveDecision,
  initialReactionMemory,
  type ReactionMemory,
} from './combat-exchange-reactions';
import {
  evaluateExchangeOutcome,
  type ExchangeGeometry,
  type ExchangeOutcome,
} from './combat-exchange-outcome';
import type { StrategicCombatRuntime } from './strategic-combat-types';
import { combatRouteHeading } from './combat-asteroid-routing';
import { asteroidCoverHeading } from './combat-asteroid-cover';
import { advanceExchange, initialExchange, type CombatExchange } from './combat-exchange-machine';
import {
  planExchangeFlight,
  pilotExchangeShip,
  activateExchangeBoost,
  stopExchangeBoost,
  type ExchangeFlightPlan,
} from './combat-exchange-pilot';

export interface ActiveExchange {
  exchange: CombatExchange;
  flight: ExchangeFlightPlan | null;
  geometry: ExchangeGeometry | null;
  reactions: { attacker: ReactionMemory; defender: ReactionMemory };
  reactiveGoals: {
    attacker: { x: number; y: number } | null;
    defender: { x: number; y: number } | null;
  };
  attackerHp: number;
  defenderHp: number;
}

function coverGoal(
  ship: StrategicCombatRuntime['attacker'],
  enemy: StrategicCombatRuntime['attacker'],
  arena: StrategicCombatRuntime['arena']
): { x: number; y: number } | null {
  const direction = asteroidCoverHeading(ship, enemy, arena);
  if (!direction) return null;
  return {
    x: ship.position.x + direction.x * 240,
    y: ship.position.y + direction.y * 240,
  };
}

export function createActionExchange(runtime: StrategicCombatRuntime): ActiveExchange {
  return {
    exchange: initialExchange(runtime.firstPlanner),
    flight: null,
    geometry: null,
    reactions: {
      attacker: initialReactionMemory(runtime.attacker, runtime),
      defender: initialReactionMemory(runtime.defender, runtime),
    },
    reactiveGoals: { attacker: null, defender: null },
    attackerHp: runtime.attacker.shieldHp + runtime.attacker.hullHp,
    defenderHp: runtime.defender.shieldHp + runtime.defender.hullHp,
  };
}

function updateExchangeIntents(
  initiator: StrategicCombatRuntime['attacker'],
  opponent: StrategicCombatRuntime['defender'],
  next: CombatExchange
): void {
  const actionNames: Record<string, string> = {
    frontal_pass: 'FRONTALANFLUG',
    broadside_pass: 'BREITSEITENPASSAGE',
    disengage_fire: 'ABSTAND GEWINNEN',
    flanking_pass: 'FLANKIEREN',
  };
  const reactionNames: Record<string, string> = {
    evade: 'AUSWEICHEN',
    accelerate_clear: 'BESCHLEUNIGEN',
    extend_range: 'ABSTAND HALTEN',
    break_contact: 'KONTAKT LÖSEN',
    close_gap: 'ANNÄHERN',
    intercept: 'ABFANGEN',
    pursue: 'VERFOLGEN',
    cross_pass: 'KREUZEN',
    counter_pass: 'GEGENPASSAGE',
    counterfire: 'GEGENFEUER',
    turn_to_face: 'ZIEL ANVISIEREN',
    hold_fire: 'POSITION HALTEN',
  };
  initiator.combatIntent =
    initiator.tactic === 'flee' ? 'FLIEHEN' : (actionNames[next.action ?? ''] ?? 'KURS HALTEN');
  opponent.combatIntent =
    opponent.tactic === 'flee' ? 'FLIEHEN' : (reactionNames[next.reaction ?? ''] ?? 'KURS HALTEN');
}

function useBoostForExchange(
  ship: StrategicCombatRuntime['attacker'],
  goal: { x: number; y: number },
  urgent: boolean,
  separation: number,
  remaining: number
): void {
  const dx = goal.x - ship.position.x;
  const dy = goal.y - ship.position.y;
  const range = Math.hypot(dx, dy);
  const aligned = dx * Math.cos(ship.headingRadians) + dy * Math.sin(ship.headingRadians);
  const forwardSpeed =
    ship.velocity.x * Math.cos(ship.headingRadians) +
    ship.velocity.y * Math.sin(ship.headingRadians);
  const useful =
    urgent &&
    separation > 300 &&
    range > 250 &&
    aligned > range * 0.92 &&
    forwardSpeed >= 0 &&
    !ship.asteroidRoute?.length &&
    remaining > 0.7;
  if (useful) activateExchangeBoost(ship);
  else stopExchangeBoost(ship);
}

function resolveExchange(
  runtime: StrategicCombatRuntime,
  state: ActiveExchange,
  current: CombatExchange,
  next: CombatExchange,
  context: { attackerDamage: number; defenderDamage: number },
  outcome: ExchangeOutcome | null
): void {
  if (current.phase === 'resolve') {
    if (outcome)
      runtime.combatLog.push({
        timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
        side: 'system',
        event: 'result',
        detail:
          'EXCHANGE_OUTCOME ' +
          current.action +
          '/' +
          current.reaction +
          ' action=' +
          (outcome.actionSucceeded ? 'success' : 'failed') +
          ' reaction=' +
          (outcome.reactionSucceeded ? 'success' : 'failed') +
          ' range=' +
          Math.round(outcome.startingRange) +
          '->' +
          Math.round(outcome.finalRange) +
          ' closest=' +
          Math.round(outcome.closestRange),
      });
    runtime.combatLog.push({
      timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
      side: 'system',
      event: 'phase',
      detail:
        'Manöver beendet · Schaden Angreifer ' +
        Math.max(0, context.attackerDamage).toFixed(1) +
        ' · Verteidiger ' +
        Math.max(0, context.defenderDamage).toFixed(1) +
        ' · Initiative ' +
        next.initiative,
    });
    state.flight = null;
    state.geometry = null;
  }
}

function reactToCombatEvents(
  runtime: StrategicCombatRuntime,
  state: ActiveExchange,
  side: 'attacker' | 'defender',
  ship: StrategicCombatRuntime['attacker'],
  enemy: StrategicCombatRuntime['defender']
): { x: number; y: number } | null {
  const memory = state.reactions[side];
  const event = chooseReactiveDecision(runtime, ship, enemy, side, memory);
  const accepted = commitReactiveDecision(memory, event, runtime.elapsedSeconds);
  memory.shieldHp = ship.shieldHp;
  memory.lastTractorCount = runtime.thrownAsteroids.length;
  if (!event || !accepted) {
    return runtime.elapsedSeconds - memory.lastReactionAt < 1.5 ? state.reactiveGoals[side] : null;
  }
  state.reactiveGoals[side] = event.goal;
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: 'REACTIVE_' + event.kind.toUpperCase() + ' priority=' + event.priority,
  });
  return event.goal;
}

function flyExchange(
  runtime: StrategicCombatRuntime,
  state: ActiveExchange,
  initiator: StrategicCombatRuntime['attacker'],
  opponent: StrategicCombatRuntime['defender'],
  next: CombatExchange,
  dt: number
): void {
  if (!state.flight || next.phase !== 'execute') return;
  const remaining = next.duration - next.elapsed;
  if (state.geometry) {
    const closest = Math.hypot(
      initiator.position.x - opponent.position.x,
      initiator.position.y - opponent.position.y
    );
    state.geometry = {
      ...state.geometry,
      closestRange: Math.min(state.geometry.closestRange, closest),
    };
  }
  const separation = Math.hypot(
    initiator.position.x - opponent.position.x,
    initiator.position.y - opponent.position.y
  );
  useBoostForExchange(
    initiator,
    state.flight.initiatorGoal,
    next.action === 'disengage_fire' || next.action === 'frontal_pass',
    separation,
    remaining
  );
  useBoostForExchange(
    opponent,
    state.flight.reactorGoal,
    next.reaction === 'pursue' || next.reaction === 'accelerate_clear',
    separation,
    remaining
  );
  const initiativeSide = next.initiative;
  const opposingSide = initiativeSide === 'attacker' ? 'defender' : 'attacker';
  const initiatorOverride = reactToCombatEvents(
    runtime,
    state,
    initiativeSide,
    initiator,
    opponent
  );
  const opponentOverride = reactToCombatEvents(runtime, state, opposingSide, opponent, initiator);
  const flight = {
    ...state.flight,
    initiatorGoal: initiatorOverride ?? coverGoal(initiator, opponent, runtime.arena) ?? state.flight.initiatorGoal,
    reactorGoal: opponentOverride ?? coverGoal(opponent, initiator, runtime.arena) ?? state.flight.reactorGoal,
  };
  pilotExchangeShip(
    initiator,
    'initiator',
    flight,
    runtime.arena,
    dt,
    opponent,
    next.action === 'frontal_pass'
  );
  pilotExchangeShip(
    opponent,
    'reactor',
    flight,
    runtime.arena,
    dt,
    initiator,
    false,
    next.reaction === 'turn_to_face'
  );
}

export function tickActionExchange(
  runtime: StrategicCombatRuntime,
  state: ActiveExchange,
  dt: number
): void {
  const current = state.exchange;
  const initiator = current.initiative === 'attacker' ? runtime.attacker : runtime.defender;
  const opponent = current.initiative === 'attacker' ? runtime.defender : runtime.attacker;
  const outcome =
    current.phase === 'resolve' && current.action && current.reaction && state.geometry
      ? evaluateExchangeOutcome(
          current.action,
          current.reaction,
          initiator,
          opponent,
          state.geometry
        )
      : null;
  const context = {
    frontWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'forward').length,
    broadsideWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'broadside').length,
    guidedWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'guided').length,
    attackerDamage: state.defenderHp - runtime.defender.shieldHp - runtime.defender.hullHp,
    defenderDamage: state.attackerHp - runtime.attacker.shieldHp - runtime.attacker.hullHp,
    roll: runtime.random,
    ...(outcome
      ? { actionSucceeded: outcome.actionSucceeded, reactionSucceeded: outcome.reactionSucceeded }
      : {}),
  };
  const next = advanceExchange(current, dt, context);
  if (current.phase === 'choose' && next.action && next.reaction) {
    const range = Math.hypot(
      initiator.position.x - opponent.position.x,
      initiator.position.y - opponent.position.y
    );
    state.geometry = {
      startingRange: range,
      closestRange: range,
      initiatorStart: { ...initiator.position },
      reactorStart: { ...opponent.position },
    };
    state.flight = planExchangeFlight(
      initiator,
      opponent,
      next.action,
      next.reaction,
      next.quality
    );
    // Preplan both routes at the moment the exchange is chosen, before any thrust.
    combatRouteHeading(initiator, state.flight.initiatorGoal, runtime.arena, 0);
    combatRouteHeading(opponent, state.flight.reactorGoal, runtime.arena, 0);
    state.attackerHp = runtime.attacker.shieldHp + runtime.attacker.hullHp;
    state.defenderHp = runtime.defender.shieldHp + runtime.defender.hullHp;
    runtime.lastEvent = next.action + ' / ' + next.reaction;
    runtime.combatLog.push({
      timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
      side: next.initiative,
      event: 'plan',
      detail:
        runtime.lastEvent +
        ' · Würfel ' +
        next.roll +
        ' · Qualität ' +
        next.quality +
        ' · Dauer ' +
        next.duration +
        's',
    });
  }
  if (current.phase === 'resolve') resolveExchange(runtime, state, current, next, context, outcome);
  state.exchange = next;
  updateExchangeIntents(initiator, opponent, next);
  flyExchange(runtime, state, initiator, opponent, next, dt);
}

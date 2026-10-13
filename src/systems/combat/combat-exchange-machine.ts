/**
 * Deterministic combat exchange scheduler. The physical pilot, weapon system
 * and damage application run continuously while an exchange is executing.
 * No movement commands are issued by this module.
 */
export type CombatAction = 'frontal_pass' | 'broadside_pass' | 'disengage_fire' | 'flanking_pass';
export type CombatReaction =
  | 'evade'
  | 'counterfire'
  | 'cross_pass'
  | 'close_gap'
  | 'extend_range'
  | 'counter_pass'
  | 'pursue'
  | 'hold_fire'
  | 'break_contact'
  | 'intercept'
  | 'turn_to_face'
  | 'accelerate_clear';
export type ExchangeSide = 'attacker' | 'defender';
export type ExchangePhase = 'choose' | 'execute' | 'resolve';
export interface CombatExchange {
  readonly phase: ExchangePhase;
  readonly initiative: ExchangeSide;
  readonly action: CombatAction | null;
  readonly reaction: CombatReaction | null;
  readonly roll: number;
  readonly quality: 'failed' | 'partial' | 'strong' | null;
  readonly duration: number;
  readonly elapsed: number;
  readonly previousAction: CombatAction | null;
  readonly actionBeforePrevious: CombatAction | null;
}
export interface ExchangeContext {
  readonly frontWeapons: number;
  readonly broadsideWeapons: number;
  readonly guidedWeapons: number;
  readonly attackerDamage: number;
  readonly defenderDamage: number;
  readonly roll: () => number;
  readonly actionSucceeded?: boolean;
  readonly reactionSucceeded?: boolean;
}
export const REACTIONS: Readonly<
  Record<CombatAction, readonly [CombatReaction, CombatReaction, CombatReaction]>
> = {
  frontal_pass: ['evade', 'counterfire', 'cross_pass'],
  broadside_pass: ['close_gap', 'extend_range', 'counter_pass'],
  disengage_fire: ['pursue', 'hold_fire', 'break_contact'],
  flanking_pass: ['intercept', 'turn_to_face', 'accelerate_clear'],
};

export function initialExchange(initiative: ExchangeSide): CombatExchange {
  return {
    phase: 'choose',
    initiative,
    action: null,
    reaction: null,
    roll: 0,
    quality: null,
    duration: 0,
    elapsed: 0,
    previousAction: null,
    actionBeforePrevious: null,
  };
}

function chooseAction(
  context: ExchangeContext,
  previous: CombatAction | null,
  beforePrevious: CombatAction | null
): CombatAction {
  const actions: CombatAction[] = [
    'frontal_pass',
    'broadside_pass',
    'disengage_fire',
    'flanking_pass',
  ];
  const scores = actions.map((action) => {
    const weaponScore =
      action === 'frontal_pass'
        ? context.frontWeapons * 3
        : action === 'broadside_pass'
          ? context.broadsideWeapons * 3
          : action === 'disengage_fire'
            ? context.guidedWeapons * 2
            : 2;
    return {
      action,
      score: weaponScore - (action === previous ? 100 : 0) - (action === beforePrevious ? 50 : 0),
    };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0]!.action;
}

export function advanceExchange(
  current: CombatExchange,
  deltaSeconds: number,
  context: ExchangeContext
): CombatExchange {
  if (current.phase === 'choose') {
    const action = chooseAction(context, current.previousAction, current.actionBeforePrevious);
    const reactions = REACTIONS[action];
    const roll = 1 + Math.min(19, Math.floor(context.roll() * 20));
    const reaction = reactions[Math.floor(context.roll() * reactions.length)]!;
    return {
      ...current,
      phase: 'execute',
      action,
      reaction,
      roll,
      quality: roll <= 6 ? 'failed' : roll <= 14 ? 'partial' : 'strong',
      elapsed: 0,
      duration: action === 'flanking_pass' ? 14 : 10,
    };
  }
  if (current.phase === 'execute') {
    const elapsed = current.elapsed + Math.max(0, deltaSeconds);
    return {
      ...current,
      elapsed,
      phase: elapsed >= current.duration ? 'resolve' : 'execute',
    };
  }
  const geometryResult =
    context.actionSucceeded === true && context.reactionSucceeded !== true
      ? current.initiative
      : context.reactionSucceeded === true && context.actionSucceeded !== true
        ? current.initiative === 'attacker'
          ? 'defender'
          : 'attacker'
        : null;
  const difference = context.attackerDamage - context.defenderDamage;
  const initiative =
    geometryResult ??
    (difference > 0
      ? 'attacker'
      : difference < 0
        ? 'defender'
        : current.initiative === 'attacker'
          ? 'defender'
          : 'attacker');
  return {
    ...initialExchange(initiative),
    previousAction: current.action,
    actionBeforePrevious: current.previousAction,
  };
}

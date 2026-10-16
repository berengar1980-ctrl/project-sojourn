import type {
  MutableCombatant,
  CombatStrategyPlan,
  StrategicCombatSide,
} from './strategic-combat-types';

import { scoreWeaponPosture, type WeaponPostureGroup } from './combat-weapon-posture-score';

const PERIOD = 8;
const SWITCH_MARGIN = 0.16;

/** Disable the highest immediate threat before trying to destroy the hull. */
export function targetSubsystem(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  elapsed = 0
): 'hull' | 'tractor' | 'engine' {
  if (enemy.subsystems.engine > 0) {
    const relative = Math.hypot(
      (enemy.velocity?.x ?? 0) - (ship.velocity?.x ?? 0),
      (enemy.velocity?.y ?? 0) - (ship.velocity?.y ?? 0)
    );
    if (enemy.tactic === 'flee' || (ship.tactic === 'flee' && relative > 35)) return 'engine';
  }
  const tractor = enemy.setup.tractorRangeMeters ?? 0;
  const proximity = Math.hypot(
    ship.position.x - enemy.position.x,
    ship.position.y - enemy.position.y
  );
  if (
    enemy.subsystems.tractor > 0 &&
    tractor > 0 &&
    enemy.shieldHp <= 0 &&
    (ship.tractorThreatenedUntil ?? -1) > elapsed &&
    proximity <= tractor * 1.1
  )
    return 'tractor';
  return 'hull';
}

function scoreWeaponGroup(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  group: WeaponPostureGroup,
  enemyRange: number,
  currentRange: number,
  speedRatio: number,
  turnRatio: number,
  targetSubsystemChoice: 'hull' | 'engine' | 'tractor'
): CombatStrategyPlan | null {
  const usable = scoreWeaponPosture(ship, enemy, group);
  if (!usable) return null;
  const range = usable.effectiveRange;
  const maintainRange = range > enemyRange && speedRatio >= 1.02;
  const effectiveRange = Math.max(180, range * (maintainRange ? 0.82 : 0.68));
  const travelPenalty = Math.max(0.55, 1 - Math.abs(currentRange - effectiveRange) / 6000);
  const relativeMobility = Math.min(1.3, Math.max(0.7, speedRatio));
  const turnFactor = group.focus === 'turret' ? 1 : Math.min(1.2, Math.max(0.75, turnRatio));
  const readiness = 1 / (1 + Math.min(12, usable.turnSeconds) * 0.06);
  return {
    kind:
      group.focus === 'forward'
        ? 'frontal'
        : group.focus === 'broadside'
          ? 'broadside'
          : 'skirmish',
    focus: group.focus,
    ...(group.facing ? { broadsideFacing: group.facing } : {}),
    targetSubsystem: targetSubsystemChoice,
    desiredRange: effectiveRange,
    score:
      usable.firepower *
      travelPenalty *
      relativeMobility *
      turnFactor *
      readiness *
      (maintainRange ? 1.2 : 1),
    reason: 'Nutzbare Waffenwirkung, Schusswinkel, Reichweite und Ausrichtungszeit abwägen',
  };
}

function canUseTractorLock(ship: MutableCombatant, enemy: MutableCombatant): boolean {
  return (
    ship.subsystems.tractor > 0 &&
    (ship.setup.tractorRangeMeters ?? 0) > 0 &&
    enemy.shieldHp <= 0 &&
    enemy.tactic === 'flee'
  );
}

function candidatePlans(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  elapsed: number
): CombatStrategyPlan[] {
  const enemyRange = Math.max(
    0,
    ...enemy.setup.weapons.flatMap((component) =>
      component.weapon ? [component.weapon.rangeMeters] : []
    )
  );
  const currentRange = Math.hypot(
    ship.position.x - enemy.position.x,
    ship.position.y - enemy.position.y
  );
  const targetSubsystemChoice = targetSubsystem(ship, enemy, elapsed);
  const speedRatio =
    ship.subsystems.engine > 0
      ? (ship.setup.combatSpeed ?? 120) /
        Math.max(65, enemy.subsystems.engine > 0 ? (enemy.setup.combatSpeed ?? 120) : 1)
      : 0.35;
  const turnRatio =
    (ship.setup.turnRateRadiansPerSecond ?? 1) /
    Math.max(0.4, enemy.setup.turnRateRadiansPerSecond ?? 1);
  const plans: CombatStrategyPlan[] = [];
  const groups: readonly WeaponPostureGroup[] = [
    { focus: 'forward' },
    { focus: 'broadside', facing: 'port' },
    { focus: 'broadside', facing: 'starboard' },
    { focus: 'turret' },
  ];
  for (const group of groups) {
    const plan = scoreWeaponGroup(
      ship,
      enemy,
      group,
      enemyRange,
      currentRange,
      speedRatio,
      turnRatio,
      targetSubsystemChoice
    );
    if (plan) plans.push(plan);
  }
  if (canUseTractorLock(ship, enemy)) {
    plans.push({
      kind: 'tractor_lock',
      focus: 'turret',
      targetSubsystem: targetSubsystemChoice,
      desiredRange: Math.max(160, (ship.setup.tractorRangeMeters ?? 0) * 0.7),
      score: Math.max(1, ...plans.map((plan) => plan.score)) * 1.4,
      reason: 'Flucht mit intaktem Traktorstrahl unterbinden',
    });
  }
  if (ship.mineStock.length && ship.subsystems.engine > 0) {
    plans.push({
      kind: 'minefield',
      focus: 'mine',
      targetSubsystem: targetSubsystemChoice,
      desiredRange: 460,
      score:
        (ship.hullHp / ship.hullMaxHp < 0.55 ? 1.4 : 0.6) *
        Math.max(1, ...plans.map((plan) => plan.score)),
      reason: 'Minen als Rückzugs- und Distanzkontrolle einsetzen',
    });
  }
  if (!plans.length) {
    plans.push({
      kind: 'approach',
      focus: 'turret',
      targetSubsystem: targetSubsystemChoice,
      desiredRange: 300,
      score: 1,
      reason: 'Waffenposition suchen',
    });
  }
  // A disabled opponent cannot sustain a chase: close to the optimal weapon envelope
  // rather than endlessly kiting at the far edge of the nominal range.
  if (enemy.subsystems.engine <= 0 && ship.subsystems.engine > 0) {
    return plans.map((plan) => ({
      ...plan,
      desiredRange: Math.min(plan.desiredRange, Math.max(180, plan.desiredRange * 0.75)),
      reason: plan.reason + ' · Gegner ohne Hauptantrieb',
    }));
  }
  return plans;
}

/** Only strategic reviews can replace a plan; movement ticks never replan. */
export function reviewCombatStrategy(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  _side: StrategicCombatSide,
  elapsed: number
): void {
  if (elapsed + 0.00001 < ship.nextStrategyReviewAt || ship.hullHp <= 0) return;
  // The first planning side is selected per fight. Keep each ship's own
  // eight-second cadence, without using attacker/defender as the fixed offset.
  ship.nextStrategyReviewAt +=
    (Math.floor((elapsed - ship.nextStrategyReviewAt) / PERIOD) + 1) * PERIOD;
  if (ship.tactic === 'flee') {
    ship.strategy = {
      kind: 'escape',
      focus: 'turret',
      desiredRange: 1000,
      score: 999,
      reason: 'Flucht befohlen oder notwendig',
    };
    return;
  }

  // A selected minefield tactic is an instruction, not a low-scoring weapon plan.
  // Keep deploying while there is stock and an operational main engine.
  if (ship.tactic === 'minefield' && ship.mineStock.length > 0 && ship.subsystems.engine > 0) {
    ship.strategy = {
      kind: 'minefield',
      focus: 'mine',
      desiredRange: 460,
      score: 999,
      reason: 'Angewiesene Minentaktik ausführen',
    };
    return;
  }
  // Reassess a doctrine that has dealt no meaningful damage for 24 seconds.
  // Penalize only that weapon posture; a fallback can be selected at the
  // normal eight-second strategic review rather than on every motion tick.
  const enemyHp = enemy.shieldHp + enemy.hullHp;
  if (ship.lastEnemyHpObserved === undefined || enemyHp < ship.lastEnemyHpObserved - 1) {
    ship.lastProgressAt = elapsed;
    delete ship.stalledPlanKind;
    delete ship.stalledPlanFacing;
  }
  ship.lastEnemyHpObserved = enemyHp;
  if (elapsed - (ship.lastProgressAt ?? elapsed) >= 24 && ship.strategy) {
    ship.stalledPlanKind = ship.strategy.kind;
    ship.stalledPlanFacing = ship.strategy.broadsideFacing;
  }
  const candidates = candidatePlans(ship, enemy, elapsed);
  const stalled = candidates.find(
    (option) =>
      option.kind === ship.stalledPlanKind && option.broadsideFacing === ship.stalledPlanFacing
  );
  const alternative = candidates
    .filter((option) => option !== stalled)
    .reduce((highest, option) => Math.max(highest, option.score), 0);
  // Never abandon a dominant hardpoint group for a drastically weaker angle
  // merely because a well-armoured enemy took little damage recently.
  const viableFallback = stalled && alternative >= stalled.score * 0.7;
  const options = candidates
    .map((option) =>
      viableFallback && option === stalled
        ? {
            ...option,
            score: option.score * 0.7,
            reason: 'Vergleichbar wirksame Waffenposition als Ausweichplan',
          }
        : option
    )
    .sort((a, b) => b.score - a.score);
  const best = options[0]!;
  const current = ship.strategy;
  const equivalent = options.find(
    (option) => option.kind === current?.kind && option.broadsideFacing === current?.broadsideFacing
  );
  if (equivalent && equivalent.score >= best.score * (1 - SWITCH_MARGIN)) {
    ship.strategy = { ...equivalent, reason: current!.reason };
  } else {
    ship.strategy = best;
  }
  // Combat commitment owns fight/flee; the planner only selects combat posture.
  if (!ship.combatTacticLocked) {
    ship.tactic =
      ship.strategy.kind === 'minefield'
        ? 'minefield'
        : ship.strategy.kind === 'skirmish'
          ? 'kite'
          : 'fight';
  }
}

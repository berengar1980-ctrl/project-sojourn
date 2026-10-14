import { describeCombatIntent } from './combat-intent-labels';
import { usefulRamAttempt } from './combat-ram-opportunity';
import { reviewCombatStrategy } from './combat-strategy-planner';
import { reviewCombatCommitment } from './combat-commitment';
import { classifyCombatDoctrine, executeCombatPlan } from './combat-plan-executor';
import { distance } from './strategic-combat-geometry';
import type { MutableCombatant, StrategicCombatRuntime } from './strategic-combat-types';

export function recordCombatLog(
  runtime: StrategicCombatRuntime,
  side: 'attacker' | 'defender' | 'system',
  event: 'start' | 'plan' | 'phase' | 'state' | 'impact' | 'result',
  detail: string
): void {
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event,
    detail,
  });
}
export function reviewAndExecute(
  runtime: StrategicCombatRuntime,
  ship: MutableCombatant,
  enemy: MutableCombatant,
  side: 'attacker' | 'defender'
): void {
  const previous = ship.strategy;
  reviewCombatCommitment(ship, enemy, runtime.arena, runtime.elapsedSeconds);
  reviewCombatStrategy(ship, enemy, side, runtime.elapsedSeconds);
  if (previous !== ship.strategy && ship.strategy) {
    ship.strategy = {
      ...ship.strategy,
      doctrine: classifyCombatDoctrine(ship, enemy),
    };
    recordCombatLog(
      runtime,
      side,
      'plan',
      ship.strategy.doctrine +
        ' · ' +
        ship.strategy.reason +
        ' · Distanz ' +
        Math.round(ship.strategy.desiredRange) +
        'm' +
        ' · Fokus ' +
        ship.strategy.focus +
        ' · Gegner Schild ' +
        Math.round(enemy.shieldHp) +
        ' · Hülle ' +
        Math.round(enemy.hullHp)
    );
  }
  ship.combatIntent = describeCombatIntent(ship);
  if (usefulRamAttempt(ship, enemy)) ship.combatIntent = 'RAMMEN';
  if (!ship.strategy) return;
  const nextPhase = executeCombatPlan(ship, enemy);
  if (ship.strategy.phase !== nextPhase) {
    ship.strategy = { ...ship.strategy, phase: nextPhase };
    recordCombatLog(runtime, side, 'phase', nextPhase);
  }
}
export function recordCombatMotion(runtime: StrategicCombatRuntime): void {
  const sampleSecond = Math.floor(runtime.elapsedSeconds);
  if (sampleSecond > runtime.lastLoggedSampleSecond) {
    runtime.lastLoggedSampleSecond = sampleSecond;
    const range = Math.round(distance(runtime.attacker.position, runtime.defender.position));
    for (const [side, ship] of [
      ['attacker', runtime.attacker],
      ['defender', runtime.defender],
    ] as const) {
      recordCombatLog(
        runtime,
        side,
        'state',
        'Abstand ' +
          range +
          'm · Tempo ' +
          Math.round(ship.speed) +
          'm/s · Bug ' +
          Math.round((ship.headingRadians * 180) / Math.PI) +
          '° · Flugrichtung ' +
          Math.round((Math.atan2(ship.velocity.y, ship.velocity.x) * 180) / Math.PI) +
          '° · Boost ' +
          (ship.boostSeconds ?? 0).toFixed(1) +
          's · Schild ' +
          Math.round(ship.shieldHp) +
          ' · Hülle ' +
          Math.round(ship.hullHp) +
          ' · Phase ' +
          (ship.strategy?.phase ?? 'Standardtaktik')
      );
    }
  }
}
export function reviewShieldBreakthroughs(
  runtime: StrategicCombatRuntime,
  previous: readonly number[]
): void {
  // Important tactical milestones can transition to the next doctrine immediately.
  if (previous[0]! > 0 && runtime.attacker.shieldHp <= 0) {
    runtime.defender.nextStrategyReviewAt = runtime.elapsedSeconds;
    recordCombatLog(
      runtime,
      'system',
      'phase',
      'Angreiferschild ausgefallen · Gegenplan jetzt neu bewerten'
    );
  }
  if (previous[1]! > 0 && runtime.defender.shieldHp <= 0) {
    runtime.attacker.nextStrategyReviewAt = runtime.elapsedSeconds;
    recordCombatLog(
      runtime,
      'system',
      'phase',
      'Verteidigerschild ausgefallen · Gegenplan jetzt neu bewerten'
    );
  }
}
export function reviewSubsystemBreakthroughs(
  runtime: StrategicCombatRuntime,
  previous: readonly [number, number, number, number]
): void {
  const ships = [runtime.attacker, runtime.defender] as const;
  for (let index = 0; index < ships.length; index += 1) {
    const damaged = ships[index]!;
    const opponent = ships[1 - index]!;
    const beforeEngine = previous[index * 2]!;
    const beforeTractor = previous[index * 2 + 1]!;
    const engineLost = beforeEngine > 0 && damaged.subsystems.engine <= 0;
    const tractorLost = beforeTractor > 0 && damaged.subsystems.tractor <= 0;
    if (!engineLost && !tractorLost) continue;
    opponent.nextStrategyReviewAt = runtime.elapsedSeconds;
    damaged.nextStrategyReviewAt = runtime.elapsedSeconds;
    recordCombatLog(
      runtime,
      'system',
      'phase',
      (index === 0 ? 'Angreifer' : 'Verteidiger') +
        (engineLost ? ' · Antrieb ausgefallen' : ' · Traktor ausgefallen') +
        ' · beide Taktiken neu bewerten'
    );
  }
}

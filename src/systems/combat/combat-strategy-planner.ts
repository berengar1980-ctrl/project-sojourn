import type { MutableCombatant, CombatStrategyPlan, StrategicCombatSide } from './strategic-combat-types';

const PERIOD = 8;
const SWITCH_MARGIN = 0.16;

function candidatePlans(ship: MutableCombatant, enemy: MutableCombatant): CombatStrategyPlan[] {
  const weapons = ship.setup.weapons.flatMap((component, slotIndex) =>
    component.weapon ? [{ ...component.weapon, slotIndex }] : []
  );
  const enemyWeapons = enemy.setup.weapons.flatMap((component) =>
    component.weapon ? [component.weapon] : []
  );
  const enemyRange = Math.max(0, ...enemyWeapons.map((weapon) => weapon.rangeMeters));
  const hp = ship.hullHp / ship.hullMaxHp;
  const enemyShielded = enemy.shieldHp > 0;
  const ownSpeed = ship.setup.combatSpeed ?? 120;
  const enemySpeed = enemy.setup.combatSpeed ?? 120;
  const ownTurn = ship.setup.turnRateRadiansPerSecond ?? 1;
  const enemyTurn = enemy.setup.turnRateRadiansPerSecond ?? 1;
  const plans: CombatStrategyPlan[] = [];

  for (const focus of ['forward', 'broadside', 'turret'] as const) {
    const relevant = weapons.filter((weapon) =>
      focus === 'turret'
        ? weapon.mount === 'turret' || weapon.mount === 'guided'
        : weapon.mount === focus
    );
    if (!relevant.length) continue;
    const bestRange = Math.max(...relevant.map((weapon) => weapon.rangeMeters));
    const score = relevant.reduce(
      (total, weapon) =>
        total + (enemyShielded ? weapon.shieldDamage : weapon.hullDamage) /
          Math.max(0.45, weapon.cooldownSeconds),
      0
    );
    const mobility = ownSpeed / Math.max(65, enemySpeed);
    const distanceAdvantage = bestRange > enemyRange ? 1.22 : 1;
    const maneuverFactor = focus === 'turret' ? 1 : Math.min(1.2, Math.max(0.72, ownTurn / Math.max(0.4, enemyTurn)));
    plans.push({
      kind: focus === 'forward' ? 'frontal' : focus === 'broadside' ? 'broadside' : 'skirmish',
      focus,
      desiredRange: Math.max(180, bestRange * (bestRange > enemyRange ? 0.78 : 0.65)),
      score: score * distanceAdvantage * maneuverFactor * Math.min(1.2, mobility),
      reason: enemyShielded ? 'Schilde mit geeigneter Bewaffnung abbauen' : 'Hülle gezielt beschädigen',
    });
  }
  if (ship.mineStock.length) {
    plans.push({
      kind: 'minefield',
      focus: 'mine',
      desiredRange: 460,
      score: (hp < 0.55 ? 1.5 : 0.65) * Math.max(1, ...plans.map((plan) => plan.score)),
      reason: 'Minen zur Distanzkontrolle einsetzen',
    });
  }
  if (!plans.length) {
    plans.push({ kind: 'approach', focus: 'turret', desiredRange: 300, score: 1, reason: 'Waffenposition suchen' });
  }
  return plans;
}

/** Only strategic reviews can replace a plan; movement ticks never replan. */
export function reviewCombatStrategy(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  elapsed: number
): void {
  if (elapsed + 0.00001 < ship.nextStrategyReviewAt || ship.hullHp <= 0) return;
  ship.nextStrategyReviewAt = (side === 'attacker' ? 0 : 4) +
    (Math.floor((elapsed - (side === 'attacker' ? 0 : 4)) / PERIOD) + 1) * PERIOD;
  if (ship.tactic === 'flee') {
    ship.strategy = { kind: 'escape', focus: 'turret', desiredRange: 1000, score: 999, reason: 'Flucht befohlen oder notwendig' };
    return;
  }

  const hp = ship.hullHp / ship.hullMaxHp;
  const aggression = Math.max(0, Math.min(100, ship.setup.aiAggression ?? 50));
  if (ship.setup.aiControlled && hp <= 0.3 && aggression < 88) {
    ship.tactic = 'flee';
    ship.strategy = { kind: 'escape', focus: 'turret', desiredRange: 1000, score: 999, reason: 'Kritischer Hüllenschaden' };
    return;
  }
  const options = candidatePlans(ship, enemy).sort((a, b) => b.score - a.score);
  const best = options[0]!;
  const current = ship.strategy;
  const equivalent = options.find((option) => option.kind === current?.kind);
  if (equivalent && equivalent.score >= best.score * (1 - SWITCH_MARGIN)) {
    ship.strategy = { ...equivalent, reason: current!.reason };
  } else {
    ship.strategy = best;
  }
  ship.tactic = ship.strategy.kind === 'minefield' ? 'minefield' : ship.strategy.kind === 'skirmish' ? 'kite' : 'fight';
}

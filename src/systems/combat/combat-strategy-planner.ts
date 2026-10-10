import type {
  MutableCombatant,
  CombatStrategyPlan,
  StrategicCombatSide,
} from './strategic-combat-types';

const PERIOD = 8;
const SWITCH_MARGIN = 0.16;

function targetSubsystem(ship: MutableCombatant, enemy: MutableCombatant): 'hull' | 'tractor' | 'engine' {
  if (enemy.tactic === 'flee' && enemy.subsystems.engine > 0) return 'engine';
  if (
    ship.shieldHp <= 0 &&
    enemy.subsystems.tractor > 0 &&
    (enemy.setup.tractorRangeMeters ?? 0) > 0
  ) return 'tractor';
  return 'hull';
}

function candidatePlans(ship: MutableCombatant, enemy: MutableCombatant): CombatStrategyPlan[] {
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
  const targetSubsystemChoice = targetSubsystem(ship, enemy);
  const enemyShielded = enemy.shieldHp > 0;
  const speedRatio = ship.subsystems.engine > 0
    ? (ship.setup.combatSpeed ?? 120) / Math.max(
        65,
        enemy.subsystems.engine > 0 ? enemy.setup.combatSpeed ?? 120 : 1
      )
    : 0.35;
  const turnRatio = (ship.setup.turnRateRadiansPerSecond ?? 1) /
    Math.max(0.4, enemy.setup.turnRateRadiansPerSecond ?? 1);
  const plans: CombatStrategyPlan[] = [];
  const groups: readonly {
    readonly focus: 'forward' | 'broadside' | 'turret';
    readonly facing?: 'port' | 'starboard';
  }[] = [
    { focus: 'forward' },
    { focus: 'broadside', facing: 'port' },
    { focus: 'broadside', facing: 'starboard' },
    { focus: 'turret' },
  ];
  for (const group of groups) {
    const guns = ship.setup.weapons.flatMap((component, index) => {
      const weapon = component.weapon;
      if (!weapon) return [];
      const mount = ship.setup.weaponMounts?.find((entry) => entry.slotIndex === index);
      const facing = mount?.facing ?? (weapon.mount === 'broadside' ? 'port' : 'forward');
      const matching =
        group.focus === 'turret'
          ? weapon.mount === 'turret' || weapon.mount === 'guided'
          : group.focus === 'forward'
            ? weapon.mount === 'forward' && facing === 'forward'
            : weapon.mount === 'broadside' && facing === group.facing;
      return matching ? [weapon] : [];
    });
    if (!guns.length) continue;
    const range = Math.max(...guns.map((weapon) => weapon.rangeMeters));
    const dps = guns.reduce(
      (total, weapon) =>
        total + (enemyShielded ? weapon.shieldDamage : weapon.hullDamage) /
          Math.max(0.45, weapon.cooldownSeconds),
      0
    );
    const maintainRange = range > enemyRange && speedRatio >= 1.02;
    const effectiveRange = Math.max(180, range * (maintainRange ? 0.82 : 0.68));
    const travelPenalty = Math.max(0.55, 1 - Math.abs(currentRange - effectiveRange) / 6000);
    const relativeMobility = Math.min(1.3, Math.max(0.7, speedRatio));
    const turnFactor = group.focus === 'turret'
      ? 1
      : Math.min(1.2, Math.max(0.75, turnRatio));
    plans.push({
      kind: group.focus === 'forward'
        ? 'frontal'
        : group.focus === 'broadside' ? 'broadside' : 'skirmish',
      focus: group.focus,
      ...(group.facing ? { broadsideFacing: group.facing } : {}),
      targetSubsystem: targetSubsystemChoice,
      desiredRange: effectiveRange,
      score: dps * travelPenalty * relativeMobility * turnFactor *
        (maintainRange ? 1.2 : 1),
      reason: enemyShielded
        ? 'Gleichzeitig nutzbare Waffen gegen Schilde einsetzen'
        : 'Hardpoints und Reichweiten gegen das Ziel ausnutzen',
    });
  }
  if (ship.mineStock.length && ship.subsystems.engine > 0) {
    plans.push({
      kind: 'minefield',
      focus: 'mine',
      targetSubsystem: targetSubsystemChoice,
      desiredRange: 460,
      score: (ship.hullHp / ship.hullMaxHp < 0.55 ? 1.4 : 0.6) *
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
  ship.nextStrategyReviewAt =
    (side === 'attacker' ? 0 : 4) +
    (Math.floor((elapsed - (side === 'attacker' ? 0 : 4)) / PERIOD) + 1) * PERIOD;
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

  const hp = ship.hullHp / ship.hullMaxHp;
  const aggression = Math.max(0, Math.min(100, ship.setup.aiAggression ?? 50));
  if (ship.setup.aiControlled && hp <= 0.3 && aggression < 88) {
    ship.tactic = 'flee';
    ship.strategy = {
      kind: 'escape',
      focus: 'turret',
      desiredRange: 1000,
      score: 999,
      reason: 'Kritischer Hüllenschaden',
    };
    return;
  }
  const options = candidatePlans(ship, enemy).sort((a, b) => b.score - a.score);
  const best = options[0]!;
  const current = ship.strategy;
  const equivalent = options.find((option) =>
    option.kind === current?.kind && option.broadsideFacing === current?.broadsideFacing
  );
  if (equivalent && equivalent.score >= best.score * (1 - SWITCH_MARGIN)) {
    ship.strategy = { ...equivalent, reason: current!.reason };
  } else {
    ship.strategy = best;
  }
  ship.tactic =
    ship.strategy.kind === 'minefield'
      ? 'minefield'
      : ship.strategy.kind === 'skirmish'
        ? 'kite'
        : 'fight';
}

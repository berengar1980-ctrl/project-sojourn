import type {
  BoardingAttackResult,
  BoardingHex,
  BoardingMapDefinition,
  BoardingUnit,
} from '../../core/boarding-types';
import {
  boardingHasLineOfSight,
  boardingHexBlocked,
  boardingHexDistance,
  boardingHexPlane,
} from './boarding-geometry';
import { attackChance, damageAfterArmor } from './boarding-tactical-rules';

/**
 * A flamer attacks everything in the aimed 60-degree cone, INCLUDING friendlies.
 * Bulkheads and intervening walls protect each target independently.
 */
export function boardingConeTargets(
  map: BoardingMapDefinition,
  doors: Readonly<Record<string, boolean>>,
  units: readonly BoardingUnit[],
  shooter: BoardingUnit,
  aim: BoardingHex
): readonly BoardingUnit[] | null {
  if (shooter.weapon.spreadMode !== 'cone') return null;
  if (
    boardingHexDistance(shooter, aim) < 1 ||
    boardingHexDistance(shooter, aim) > shooter.weapon.range
  ) {
    return null;
  }
  if (
    aim.q < 0 ||
    aim.r < 0 ||
    aim.q >= map.columns ||
    aim.r >= map.rows ||
    boardingHexBlocked(map, doors, aim.q, aim.r) ||
    !boardingHasLineOfSight(map, doors, shooter, aim)
  ) {
    return null;
  }
  const origin = boardingHexPlane(shooter);
  const direction = boardingHexPlane(aim);
  const ax = direction.x - origin.x;
  const ay = direction.y - origin.y;
  const alength = Math.hypot(ax, ay);
  return units.filter((target) => {
    if (target.hp <= 0 || target.id === shooter.id) return false;
    if (boardingHexDistance(shooter, target) > shooter.weapon.range) return false;
    const point = boardingHexPlane(target);
    const bx = point.x - origin.x;
    const by = point.y - origin.y;
    const product = alength * Math.hypot(bx, by);
    return (
      product > 0 &&
      (ax * bx + ay * by) / product >= Math.cos(Math.PI / 6) - 1e-9 &&
      boardingHasLineOfSight(map, doors, shooter, target)
    );
  });
}

/** Resolves a whole cone once. Each affected unit gets an independent deterministic roll. */
export function resolveBoardingCone(
  map: BoardingMapDefinition,
  doors: Readonly<Record<string, boolean>>,
  units: readonly BoardingUnit[],
  shooter: BoardingUnit,
  aim: BoardingHex,
  roll: () => number,
  spendAction: boolean
): readonly BoardingAttackResult[] | null {
  const targets = boardingConeTargets(map, doors, units, shooter, aim);
  if (!targets) return null;
  if (spendAction) {
    if (shooter.ap < 1 || shooter.combatUsed) return null;
    shooter.ap -= 1;
    shooter.combatUsed = true;
  }
  shooter.rangedActions += 1;
  return targets.map((target) => {
    const chancePercent = attackChance(map, doors, shooter, target);
    const hit = roll() * 100 < chancePercent;
    const piercing = shooter.weapon.piercing;
    const bonus = piercing && target.armor <= piercing.maxArmor ? piercing.bonusDamage : 0;
    const damage = hit
      ? damageAfterArmor(shooter.weapon.damage, shooter.weapon.armorPenetration, target.armor) +
        bonus
      : 0;
    target.hp = Math.max(0, target.hp - damage);
    if (hit && target.hp > 0 && shooter.weapon.canSuppress) target.suppressed = true;
    return {
      attackerId: shooter.id,
      targetId: target.id,
      hit,
      chancePercent,
      damage,
      targetHp: target.hp,
      targetDefeated: target.hp <= 0,
    };
  });
}

import type {
  BoardingHex,
  BoardingMapDefinition,
  BoardingSuppressionZone,
  BoardingUnit,
} from '../../core/boarding-types';
import {
  boardingAllyInFiringLine,
  boardingHasLineOfSight,
  boardingHexDistance,
  boardingInOverwatchArc,
} from './boarding-geometry';
import { attackChance, clamp, meleeChance } from './boarding-tactical-rules';

type Reaction = (attacker: BoardingUnit, target: BoardingUnit, chance: number, melee: boolean) => void;

export function reactToDisengagement(
  units: readonly BoardingUnit[],
  mover: BoardingUnit,
  previous: BoardingHex,
  next: BoardingHex,
  react: Reaction,
  isActive: () => boolean
): void {
  for (const enemy of units) {
    if (
      enemy.team === mover.team ||
      enemy.hp <= 0 ||
      enemy.reactionUsed ||
      boardingHexDistance(enemy, previous) !== 1 ||
      boardingHexDistance(enemy, next) <= 1
    ) continue;
    enemy.reactionUsed = true;
    react(enemy, mover, Math.max(5, meleeChance(enemy) - 20), true);
    if (mover.hp <= 0 || !isActive()) break;
  }
}

export function reactToMovement(
  map: BoardingMapDefinition,
  doors: Readonly<Record<string, boolean>>,
  units: readonly BoardingUnit[],
  zones: readonly BoardingSuppressionZone[],
  mover: BoardingUnit,
  react: Reaction,
  isActive: () => boolean
): BoardingSuppressionZone[] {
  let remaining = [...zones];
  for (const zone of zones) {
    if (zone.team === mover.team || boardingHexDistance(zone.center, mover) > 1) continue;
    const owner = units.find((unit) => unit.id === zone.ownerId && unit.hp > 0);
    if (!owner || !boardingHasLineOfSight(map, doors, owner, mover)) continue;
    remaining = remaining.filter((entry) => entry !== zone);
    mover.suppressed = true;
    react(owner, mover, clamp(attackChance(map, doors, owner, mover) - 10, 5, 90), false);
    if (mover.hp <= 0 || !isActive()) return remaining;
  }
  for (const shooter of units) {
    if (
      shooter.team === mover.team ||
      shooter.hp <= 0 ||
      !shooter.overwatch ||
      !shooter.overwatchTarget ||
      !boardingInOverwatchArc(shooter, shooter.overwatchTarget, mover) ||
      boardingHexDistance(shooter, mover) > shooter.weapon.range ||
      !boardingHasLineOfSight(map, doors, shooter, mover) ||
      boardingAllyInFiringLine(units, shooter, mover)
    ) continue;
    // Suppression disrupts fire-watch; that shot is lost rather than saved indefinitely.
    shooter.overwatch = false;
    shooter.overwatchTarget = null;
    if (shooter.suppressed) continue;
    react(shooter, mover, attackChance(map, doors, shooter, mover), false);
    if (mover.hp <= 0 || !isActive()) return remaining;
  }
  return remaining;
}

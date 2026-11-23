import type { MutableCombatant } from './strategic-combat-types';
import { clamp, distance } from './strategic-combat-geometry';

export function preferredRange(combatant: MutableCombatant): number {
  const ranges = combatant.setup.weapons.flatMap((weapon) =>
    weapon.weapon ? [weapon.weapon.rangeMeters] : []
  );
  if (ranges.length === 0) return 300;
  const max = Math.max(...ranges);
  const min = Math.min(...ranges);
  if (combatant.tactic === 'kite') return Math.max(520, max * 0.84);
  if (combatant.tactic === 'minefield') return Math.max(430, min * 0.78);
  return Math.max(340, min * 0.72);
}

export function updateAiTactic(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  elapsedSeconds: number
): void {
  if (!combatant.setup.aiControlled || combatant.hullHp <= 0) return;
  const hullRatio = combatant.hullHp / Math.max(1, combatant.hullMaxHp);
  const shieldRatio =
    combatant.shieldMaxHp <= 0 ? 0 : combatant.shieldHp / Math.max(1, combatant.shieldMaxHp);
  const aggression = clamp(combatant.setup.aiAggression ?? 50, 0, 100);
  const range = distance(combatant.position, enemy.position);

  if (hullRatio <= 0.3 && aggression < 88 && !combatant.setup.id.startsWith('security-drone:')) {
    combatant.tactic = 'flee';
    return;
  }
  if (
    combatant.mineStock.length > 0 &&
    elapsedSeconds >= 5 &&
    range <= 700 &&
    aggression >= 58 &&
    Math.floor(elapsedSeconds / 10) % 2 === 0
  ) {
    combatant.tactic = 'minefield';
    return;
  }
  if (shieldRatio <= 0.25 && hullRatio > 0.45 && aggression < 78) {
    combatant.tactic = 'kite';
    return;
  }
  combatant.tactic = combatant.setup.preferredTactic ?? 'fight';
}

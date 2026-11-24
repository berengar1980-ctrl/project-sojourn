import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { VisibleCombatImpact } from './strategic-combat-renderer-types';

export function combatEffectSource(duel: StrategicCombatSnapshot): string {
  return JSON.stringify([duel.attacker.id, duel.defender.id]);
}

export function appendCombatImpacts(
  duel: StrategicCombatSnapshot,
  visible: VisibleCombatImpact[],
  seen: number,
  sharedElapsed: number
): number {
  const impacts = [
    ...(duel.recentImpacts ?? []),
    ...(duel.lastImpact ? [duel.lastImpact] : []),
  ].sort((first, second) => first.serial - second.serial);
  for (const impact of impacts) {
    if (impact.serial <= seen) continue;
    seen = impact.serial;
    const delay = impact.weaponFamily ? WEAPON_VISUALS[impact.weaponFamily].impactDelaySeconds : 0;
    visible.push({ impact, startedAt: sharedElapsed + delay });
  }
  return seen;
}

/**
 * The combat simulation stops at victory; short visual effects may continue
 * fading in wall time without changing any gameplay state.
 */
export class CombatEffectClock {
  private elapsedSeconds = 0;
  private finishedAt: number | null = null;

  update(simulationSeconds: number, finished: boolean, wallSeconds: number): void {
    this.elapsedSeconds = simulationSeconds;
    if (!finished) this.finishedAt = null;
    else if (this.finishedAt === null) this.finishedAt = wallSeconds;
  }

  elapsed(wallSeconds: number): number {
    const overtime = this.finishedAt === null ? 0 : Math.max(0, wallSeconds - this.finishedAt);
    return this.elapsedSeconds + overtime;
  }
}

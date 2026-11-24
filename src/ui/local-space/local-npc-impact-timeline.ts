import { appendCombatImpacts, combatEffectSource } from '../combat/combat-effect-clock';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { VisibleCombatImpact } from '../combat/strategic-combat-renderer-types';
import { VISION_IMPACT_SECONDS } from '../../core/combat-visual-timings';

interface ImpactHistory {
  elapsed: number;
  lastSerial: number;
  visible: VisibleCombatImpact[];
}

/** Each combat impact is inserted exactly once, not restarted on every canvas frame. */
export class LocalNpcImpactTimeline {
  private readonly histories = new Map<string, ImpactHistory>();

  visible(combat: StrategicCombatSnapshot): readonly VisibleCombatImpact[] {
    const key = combatEffectSource(combat);
    let history = this.histories.get(key);
    if (!history || combat.elapsedSeconds < history.elapsed) {
      history = { elapsed: 0, lastSerial: -1, visible: [] };
      this.histories.set(key, history);
    }
    history.elapsed = combat.elapsedSeconds;
    history.lastSerial = appendCombatImpacts(
      combat,
      history.visible,
      history.lastSerial,
      combat.elapsedSeconds
    );
    history.visible = history.visible.filter(
      (entry) => combat.elapsedSeconds - entry.startedAt < VISION_IMPACT_SECONDS
    );
    return history.visible;
  }

  retain(combats: readonly StrategicCombatSnapshot[]): void {
    const active = new Set(combats.map(combatEffectSource));
    for (const key of this.histories.keys()) if (!active.has(key)) this.histories.delete(key);
  }
}

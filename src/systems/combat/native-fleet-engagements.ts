import type { NativeFleetDriver } from './native-fleet-reassignment';
import type { StrategicCombatSnapshot } from './strategic-combat-types';

/** Live directed engagements for the FleetCombat map; no duplicate ship objects. */
export interface NativeFleetEngagement {
  readonly sourceId: string;
  readonly targetId: string;
  /** 1-based original duel index, or 1-based initial extra-attacker index. */
  readonly label: string;
  readonly role: 'duel' | 'support';
}

/** Mark original native pairs and the actors simulated by one-sided support ticks. */
export function activeNativeFleetEngagements(
  states: readonly StrategicCombatSnapshot[],
  drivers: readonly NativeFleetDriver[],
  pairedCount: number,
  escaped: ReadonlySet<string>
): NativeFleetEngagement[] {
  return states.flatMap((state, index) => {
    if (state.winner !== null) return [];
    const driver = drivers[index]!;
    const source = driver === 'both' ? state.attacker : state[driver];
    const target =
      driver === 'both' ? state.defender : state[driver === 'attacker' ? 'defender' : 'attacker'];
    if (
      source.hullHp <= 0 ||
      target.hullHp <= 0 ||
      escaped.has(source.id) ||
      escaped.has(target.id)
    ) {
      return [];
    }
    return [
      {
        sourceId: source.id,
        targetId: target.id,
        label: String(index < pairedCount ? index + 1 : index - pairedCount + 1),
        role: driver === 'both' ? ('duel' as const) : ('support' as const),
      },
    ];
  });
}

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

/** Mark original native pairs and any reciprocal single-owner pair as genuine duels. */
export function activeNativeFleetEngagements(
  states: readonly StrategicCombatSnapshot[],
  drivers: readonly NativeFleetDriver[],
  pairedCount: number,
  escaped: ReadonlySet<string>
): NativeFleetEngagement[] {
  const directed = states.flatMap((state, index) => {
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
        index,
      },
    ];
  });

  // A native 1v1 service may become one-sided when its enemy is destroyed.
  // If its survivor and an existing one-sided attacker now target each other,
  // their TWO original owners form the new logical main duel. They must never
  // become a 'both' driver: that would double-tick the promoted opponent.
  const main: NativeFleetEngagement[] = [];
  const claimed = new Set<string>();
  for (const link of directed) {
    if (link.role !== 'duel') continue;
    main.push(link);
    claimed.add(link.sourceId);
    claimed.add(link.targetId);
  }
  // Any two original, single-owner AI drivers can become a genuine new
  // 1v1. In dynamically joined encounters the second driver is often an
  // EXTRA service (index >= pairedCount), not another original pair.
  for (const link of directed) {
    if (link.role !== 'support') continue;
    if (claimed.has(link.sourceId) || claimed.has(link.targetId)) continue;
    const reciprocal = directed.find(
      (candidate) =>
        candidate !== link &&
        candidate.role === 'support' &&
        candidate.sourceId === link.targetId &&
        candidate.targetId === link.sourceId
    );
    if (!reciprocal) continue;
    main.push({
      sourceId: link.sourceId,
      targetId: link.targetId,
      label: link.label,
      role: 'duel',
    });
    claimed.add(link.sourceId);
    claimed.add(link.targetId);
  }
  return [
    ...main,
    ...directed.filter((link) => link.role === 'support' && !claimed.has(link.sourceId)),
  ];
}

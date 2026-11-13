import type { BoardingEncounterSnapshot } from '../../core/boarding-types';
import type { CampaignEvent } from '../../core/campaign-types';

export type BoardingOrigin = 'ship' | 'wreck' | 'distress';

export interface BoardingAfterAction {
  readonly event: Extract<CampaignEvent, { readonly type: 'boarding.ended' }>;
  readonly report: string;
}

/** Crew injuries are committed by encounter.settle(); this describes them without double-paying XP. */
export function boardingAfterAction(
  snapshot: BoardingEncounterSnapshot,
  source: BoardingOrigin,
  wreckId?: string
): BoardingAfterAction {
  const crew = snapshot.units.filter((unit) => unit.team === 'player');
  const incapacitated = crew.filter((unit) => unit.hp <= 0).length;
  const wounded = crew.filter(
    (unit) => unit.hp > 0 && unit.hp / Math.max(1, unit.maxHp) <= 0.9
  ).length;
  const enemiesDefeated = snapshot.units.filter(
    (unit) => unit.team === 'enemy' && unit.hp <= 0
  ).length;
  const outcome =
    snapshot.outcome === 'player_win'
      ? 'player_win'
      : snapshot.outcome === 'enemy_win'
        ? 'enemy_win'
        : 'draw';
  return {
    event: {
      type: 'boarding.ended',
      outcome,
      source,
      crewIncapacitated: incapacitated,
      crewWounded: wounded,
      enemiesDefeated,
      ...(wreckId ? { wreckId } : {}),
    },
    report:
      'ENTERKAMPF > BILANZ · ' +
      enemiesDefeated +
      ' GEGNER AUSGESCHALTET · ' +
      wounded +
      ' VERWUNDETE · ' +
      incapacitated +
      ' AUSGEFALLENE CREWMITGLIEDER',
  };
}

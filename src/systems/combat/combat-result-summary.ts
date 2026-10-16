import type { StrategicCombatSnapshot } from './strategic-combat-types';

export interface CampaignCombatResult {
  readonly outcome: string;
  readonly enemy: string;
  readonly playerHull: number;
  readonly playerHullMax: number;
  readonly enemyHull: number;
  readonly enemyHullMax: number;
  readonly duration: number;
  readonly boarding: boolean;
  readonly reason?: StrategicCombatSnapshot['outcomeReason'];
}

/** Pure projection: never award fabricated loot or replay economic effects. */
export function campaignCombatResult(snapshot: StrategicCombatSnapshot): CampaignCombatResult {
  return {
    outcome:
      snapshot.outcomeReason === 'escape' && snapshot.attacker.tactic === 'flee'
        ? 'FLUCHT'
        : snapshot.winner === 'attacker'
          ? 'SIEG'
          : snapshot.winner === 'defender'
            ? 'NIEDERLAGE'
            : 'UNENTSCHIEDEN',
    enemy: snapshot.defender.name,
    playerHull: Math.round(snapshot.attacker.hullHp),
    playerHullMax: Math.round(snapshot.attacker.hullMaxHp),
    enemyHull: Math.round(snapshot.defender.hullHp),
    enemyHullMax: Math.round(snapshot.defender.hullMaxHp),
    duration: Math.round(snapshot.elapsedSeconds),
    boarding: snapshot.boardingInitiator !== null,
    reason: snapshot.outcomeReason,
  };
}

export function combatResultMessage(snapshot: StrategicCombatSnapshot): string {
  const result = campaignCombatResult(snapshot);
  return (
    'KAMPFENDE > ' +
    result.outcome +
    ' GEGEN ' +
    result.enemy.toUpperCase() +
    ' · HÜLLE ' +
    result.playerHull +
    '/' +
    result.playerHullMax +
    ' · GEGNER ' +
    result.enemyHull +
    '/' +
    result.enemyHullMax +
    ' · ' +
    result.duration +
    ' S' +
    (result.boarding ? ' · BOARDING' : '') +
    (result.reason === 'surrender' ? ' · KAPITULATION' : '')
  );
}

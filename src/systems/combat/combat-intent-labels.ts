import type {
  CombatStrategyPlan,
  CombatTactic,
  MutableCombatant,
  StrategicCombatantSnapshot,
} from './strategic-combat-types';

/** Display labels only: no decisions or movement depend on these descriptions. */
function describeStrategy(
  tactic: CombatTactic,
  plan: CombatStrategyPlan | null | undefined,
  unarmed: boolean
): string {
  if (tactic === 'flee') return 'FLIEHEN';
  if (unarmed) return 'UNBEWAFFNET · DISTANZ HALTEN';
  if (tactic === 'minefield') return 'MINEN LEGEN';
  // A selected broadside must remain visible even during a kite or a flyby.
  if (plan?.kind === 'broadside') {
    const side =
      plan.broadsideFacing === 'port'
        ? 'BACKBORD'
        : plan.broadsideFacing === 'starboard'
          ? 'STEUERBORD'
          : null;
    return side ? 'BREITSEITE · ' + side : 'BREITSEITE';
  }
  if (tactic === 'kite') return 'ABSTAND HALTEN';
  switch (plan?.kind) {
    case 'frontal':
      return 'FRONTALANGRIFF';
    case 'skirmish':
      return 'GEFECHT AUF DISTANZ';
    case 'approach':
      return 'ANNÄHERN';
    case 'escape':
      return 'FLIEHEN';
    case 'tractor_lock':
      return 'TRAKTOR POSITIONIEREN';
    case 'minefield':
      return 'MINEN POSITIONIEREN';
    default:
      return 'KAMPFPOSITION SUCHEN';
  }
}

/** Existing telemetry label, kept for compatibility with the combat runtime. */
export function describeCombatIntent(ship: MutableCombatant): string {
  return describeStrategy(
    ship.tactic,
    ship.strategy,
    ship.setup?.weapons?.length === 0 && ship.mineStock?.length === 0
  );
}

/**
 * HUD-only view of independent status dimensions.
 * The planned weapon posture comes from the actual strategy, never from
 * combatIntent, which the movement and action systems may temporarily override.
 */
export function describeCombatStatus(
  ship: Pick<
    StrategicCombatantSnapshot,
    'tactic' | 'strategy' | 'combatIntent' | 'installedWeapons' | 'mineCount'
  >
): { readonly strategy: string; readonly maneuver: string | null } {
  const strategy = describeStrategy(
    ship.tactic,
    ship.strategy,
    ship.installedWeapons === 0 && ship.mineCount === 0
  );
  const currentAction = ship.combatIntent;
  const duplicateBroadside = strategy.startsWith('BREITSEITE') && currentAction === 'BREITSEITE';
  return {
    strategy,
    maneuver:
      currentAction && currentAction !== strategy && !duplicateBroadside ? currentAction : null,
  };
}

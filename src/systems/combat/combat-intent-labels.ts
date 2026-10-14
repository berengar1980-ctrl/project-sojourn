import type { MutableCombatant } from './strategic-combat-types';

export function describeCombatIntent(ship: MutableCombatant): string {
  if (ship.tactic === 'flee') return 'FLIEHEN';
  if (ship.setup.weapons.length === 0 && ship.mineStock.length === 0) {
    return 'UNBEWAFFNET · DISTANZ HALTEN';
  }
  if (ship.tactic === 'minefield') return 'MINEN LEGEN';
  if (ship.tactic === 'kite') return 'ABSTAND HALTEN';
  switch (ship.strategy?.kind) {
    case 'frontal':
      return 'FRONTALANGRIFF';
    case 'broadside':
      return 'BREITSEITE';
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

/**
 * HUD messages are presentation, not flight orders. Hold non-emergency
 * labels for two seconds so rapidly changing maneuver suggestions do not
 * make the status unreadable. An actual flight command always wins now.
 */
export function updateCombatIntent(
  ship: MutableCombatant,
  proposed: string,
  elapsedSeconds: number
): void {
  const next = ship.tactic === 'flee' ? 'FLIEHEN' : proposed;
  if (ship.combatIntent === next) return;
  if (
    next !== 'FLIEHEN' &&
    ship.combatIntent &&
    elapsedSeconds - (ship.lastCombatIntentChangeAt ?? -100) < 2
  ) return;
  ship.combatIntent = next;
  ship.lastCombatIntentChangeAt = elapsedSeconds;
}

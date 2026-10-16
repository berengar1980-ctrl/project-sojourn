import type { MutableCombatant } from './strategic-combat-types';

export function describeCombatIntent(ship: MutableCombatant): string {
  if (ship.tactic === 'flee') return 'FLIEHEN';
  if (ship.setup?.weapons?.length === 0 && ship.mineStock?.length === 0) {
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

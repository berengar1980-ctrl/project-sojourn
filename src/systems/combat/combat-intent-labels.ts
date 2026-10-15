import type { MutableCombatant } from './strategic-combat-types';

export function describeCombatIntent(ship: MutableCombatant): string {
  if (ship.tactic === 'flee') return 'FLIEHEN';
  if (ship.setup?.weapons?.length === 0 && ship.mineStock?.length === 0) {
    return 'UNBEWAFFNET · DISTANZ HALTEN';
  }
  if (ship.maneuver) return describeManeuver(ship);
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

/** Presentation reflects the selected order immediately; it is never a second state machine. */
export function updateCombatIntent(
  ship: MutableCombatant,
  proposed: string,
  _elapsedSeconds: number
): void {
  ship.combatIntent = ship.tactic === 'flee' ? 'FLIEHEN' : proposed;
}

function describeManeuver(ship: MutableCombatant): string {
  const labels = {
    intercept: 'ABFANGEN',
    hold: 'FEUERPOSITION HALTEN',
    pass: 'PASSAGE FLIEGEN',
    extend: 'ABSTAND HERSTELLEN',
    escape: 'FLIEHEN',
  };
  const focus =
    ship.strategy?.focus === 'broadside'
      ? ' · BREITSEITE'
      : ship.strategy?.focus === 'forward'
        ? ' · FRONTWAFFEN'
        : '';
  return labels[ship.maneuver!.kind] + focus;
}

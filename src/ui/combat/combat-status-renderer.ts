import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';
import { describeCombatStatus } from '../../systems/combat/combat-intent-labels';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

/** Labels show the selected weapon posture separately from the active maneuver. */
export function drawCombatShipStatus(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry,
  strategyVisible = true,
  maneuverVisible = true
): void {
  if (!strategyVisible && !maneuverVisible) return;
  const status = describeCombatStatus(combatant);
  const statusY = geometry.center.y - geometry.height * 0.8 - 13;
  context.save();
  context.textAlign = 'center';
  context.font = 'bold 9px ui-monospace, monospace';
  context.fillStyle = status.strategy === 'FLIEHEN' ? '#ffd18b' : '#95d9f2';
  if (strategyVisible)
    context.fillText(
      'STRATEGIE: ' + status.strategy,
      geometry.center.x,
      statusY - (status.maneuver && maneuverVisible ? 12 : 0)
    );
  if (status.maneuver && maneuverVisible) {
    context.font = '9px ui-monospace, monospace';
    context.fillStyle = status.maneuver.startsWith('RAMMKURS') ? '#eacb94' : '#a7bac7';
    context.fillText('MANÖVER: ' + status.maneuver, geometry.center.x, statusY);
  }
  context.restore();
}

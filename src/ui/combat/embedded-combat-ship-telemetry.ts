import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawCombatShipStatus } from './combat-status-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';

/** Render the same combat telemetry next to ships on either local field map. */
export function drawEmbeddedCombatShipTelemetry(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry
): void {
  drawCombatShipStatus(context, combatant, geometry);
  drawCombatBoostMeter(
    context,
    geometry.center,
    geometry.height,
    combatant.boostSeconds,
    combatant.boostActive
  );
}

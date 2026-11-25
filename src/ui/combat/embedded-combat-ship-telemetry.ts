import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawCombatShipStatus } from './combat-status-renderer';
import type { FleetDisplayPreferences } from './fleet-display-menu';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';

/** Render the same combat telemetry next to ships on either local field map. */
export function drawEmbeddedCombatShipTelemetry(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry,
  display?: FleetDisplayPreferences | null
): void {
  drawCombatShipStatus(context, combatant, geometry, display?.actions, display?.maneuvers);
  if (display?.boost === false) return;
  drawCombatBoostMeter(
    context,
    geometry.center,
    geometry.height,
    combatant.boostSeconds,
    combatant.boostActive
  );
}

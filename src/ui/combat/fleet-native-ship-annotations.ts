import { drawCombatRamEffect } from './combat-ram-effect-renderer';
import { drawCombatShipCaption } from './combat-ship-detail-renderer';
import { drawEmbeddedCombatShipTelemetry } from './embedded-combat-ship-telemetry';
import type { FleetDisplayPreferences } from './fleet-display-menu';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';

/** Same original 1vs1 ship labels/status/boost primitives, Fleet-only wrapper. */
export function paintFleetShipAnnotations(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry,
  hullRatio: number,
  visualElapsed: number,
  display?: FleetDisplayPreferences | null
): void {
  drawCombatRamEffect(context, combatant, geometry, visualElapsed);
  if (display?.names !== false) drawCombatShipCaption(context, combatant.name, hullRatio, geometry);
  drawEmbeddedCombatShipTelemetry(context, combatant, geometry, display);
}

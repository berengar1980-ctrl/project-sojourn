import { drawCombatRamEffect } from './combat-ram-effect-renderer';
import { drawCombatShipCaption } from './combat-ship-detail-renderer';
import { drawCombatShipStatus } from './combat-status-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';

/** Same original 1vs1 ship labels/status/boost primitives, Fleet-only wrapper. */
export function paintFleetShipAnnotations(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry,
  hullRatio: number,
  visualElapsed: number
): void {
  drawCombatRamEffect(context, combatant, geometry, visualElapsed);
  drawCombatShipCaption(context, combatant.name, hullRatio, geometry);
  drawCombatShipStatus(context, combatant, geometry);
  drawCombatBoostMeter(
    context,
    geometry.center,
    geometry.height,
    combatant.boostSeconds,
    combatant.boostActive
  );
}

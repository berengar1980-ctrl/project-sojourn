import type { ShipEffectLayer, ShipHardpoints } from '../../core/ship-types';
import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

const engines = new ShipEngineEffectsRenderer();
const maneuver = new ShipManeuverEffectsRenderer();

/** The identical combat RCS and burst exhaust calculations used by the duel renderer. */
export function drawEmbeddedCombatThrusters(
  context: CanvasRenderingContext2D,
  source: ShipHardpoints,
  geometry: ShipScreenGeometry,
  combatant: StrategicCombatantSnapshot,
  timeSeconds: number,
  layer: ShipEffectLayer
): void {
  const intensity =
    combatant.subsystems.engine > 0 ? Math.max(0, Math.min(1, combatant.speed / 120)) : 0;
  const demand = {
    turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
    angularThrust: combatant.angularThrust,
    lateralThrust: combatant.lateralThrust ?? 0,
    longitudinalThrust: combatant.longitudinalThrust ?? 0,
  };
  if (layer === 'below') {
    engines.drawExhaust(
      context,
      source,
      geometry,
      intensity,
      timeSeconds,
      layer,
      combatant.boostActive
    );
    maneuver.drawExhaust(context, source, geometry, demand, timeSeconds, layer);
  } else {
    engines.drawGlow(context, source, geometry, intensity, timeSeconds, layer);
    maneuver.drawGlow(context, source, geometry, demand, timeSeconds, layer);
  }
}

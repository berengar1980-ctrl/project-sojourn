import type { ShipEffectLayer, ShipHardpoints } from '../../core/ship-types';
import { longitudinalManeuverDemand } from '../../systems/ships/ship-maneuver-thrusters';
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

interface OperationalThrust {
  readonly speed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
}

/** Preserve operational thrusters outside combat; switch to duel authority in combat. */
export function drawFieldPlayerThrusters(
  context: CanvasRenderingContext2D,
  source: ShipHardpoints,
  geometry: ShipScreenGeometry,
  ship: OperationalThrust,
  combat: StrategicCombatantSnapshot | null,
  timeSeconds: number,
  layer: ShipEffectLayer,
  engineRenderer: ShipEngineEffectsRenderer,
  maneuverRenderer: ShipManeuverEffectsRenderer,
  kind: 'mining' | 'salvage'
): void {
  if (combat) {
    drawEmbeddedCombatThrusters(context, source, geometry, combat, timeSeconds, layer);
    return;
  }
  const intensity = Math.max(0, Math.min(1, ship.speed / (kind === 'mining' ? 240 : 100)));
  const demand = {
    turnRateRadiansPerSecond: ship.turnRateRadiansPerSecond,
    angularThrust: ship.angularThrust,
    lateralThrust: ship.lateralThrust,
    longitudinalThrust: longitudinalManeuverDemand(ship.speed),
  };
  if (kind === 'mining') {
    engineRenderer.draw(context, source, geometry, intensity, timeSeconds, layer);
    maneuverRenderer.draw(context, source, geometry, demand, timeSeconds, layer);
  } else if (layer === 'below') {
    engineRenderer.drawExhaust(context, source, geometry, intensity, timeSeconds);
    maneuverRenderer.drawExhaust(context, source, geometry, demand, timeSeconds);
  } else {
    engineRenderer.drawGlow(context, source, geometry, intensity, timeSeconds);
    maneuverRenderer.drawGlow(context, source, geometry, demand, timeSeconds);
  }
}

/** NPCs share combat thrust visuals, but retain their job-specific glow while working. */
export function drawFieldNpcThrusters(
  context: CanvasRenderingContext2D,
  source: ShipHardpoints,
  geometry: ShipScreenGeometry,
  speed: number,
  combat: StrategicCombatantSnapshot | null,
  timeSeconds: number,
  layer: ShipEffectLayer,
  engineRenderer: ShipEngineEffectsRenderer,
  kind: 'mining' | 'salvage'
): void {
  if (combat) {
    drawEmbeddedCombatThrusters(context, source, geometry, combat, timeSeconds, layer);
    return;
  }
  if (speed <= 1) return;
  const intensity = Math.max(
    kind === 'mining' ? 0.35 : 0.32,
    Math.min(1, speed / (kind === 'mining' ? 110 : 100))
  );
  if (kind === 'mining') {
    engineRenderer.draw(context, source, geometry, intensity, timeSeconds, layer);
  } else if (layer === 'below') {
    engineRenderer.drawExhaust(context, source, geometry, intensity, timeSeconds);
  } else {
    engineRenderer.drawGlow(context, source, geometry, intensity, timeSeconds);
  }
}

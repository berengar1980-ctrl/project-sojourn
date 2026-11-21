import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { DistressDamageParticles } from '../salvage/distress-damage-particles';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawCombatDamageParticles } from './combat-damage-visual';

type Fighter = StrategicCombatSnapshot['attacker'];

/** Fleet-only particle filter. Shared ships must emit damage effects once. */
export function drawFleetCombatDamageShip(
  context: CanvasRenderingContext2D,
  fighter: Fighter,
  geometry: (fighter: Fighter) => ShipScreenGeometry,
  particles: Map<string, DistressDamageParticles>,
  now: number,
  width: number,
  height: number,
  hidden: ReadonlySet<string>,
  painted: Set<string>
): void {
  if (hidden.has(fighter.id) || painted.has(fighter.id)) return;
  painted.add(fighter.id);
  drawCombatDamageParticles(context, fighter, geometry(fighter), particles, now, width, height);
}

export function drawFleetCombatDamagePair(
  context: CanvasRenderingContext2D,
  combatants: readonly [Fighter, Fighter],
  geometryFor: (combatant: Fighter) => ShipScreenGeometry,
  particlesById: Map<string, DistressDamageParticles>,
  now: number,
  width: number,
  height: number,
  hiddenIds: ReadonlySet<string> = new Set(),
  paintedIds: Set<string> = new Set()
): void {
  for (const fighter of combatants) {
    drawFleetCombatDamageShip(
      context,
      fighter,
      geometryFor,
      particlesById,
      now,
      width,
      height,
      hiddenIds,
      paintedIds
    );
  }
}

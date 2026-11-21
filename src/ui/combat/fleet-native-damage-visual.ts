import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { DistressDamageParticles } from '../salvage/distress-damage-particles';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawCombatDamageParticles } from './combat-damage-visual';

/** Fleet-only damage filter. The original 1vs1 particle renderer is unchanged. */
export function drawFleetCombatDamagePair(
  context: CanvasRenderingContext2D,
  combatants: readonly [StrategicCombatSnapshot['attacker'], StrategicCombatSnapshot['defender']],
  geometryFor: (combatant: StrategicCombatSnapshot['attacker']) => ShipScreenGeometry,
  particlesById: Map<string, DistressDamageParticles>,
  now: number,
  width: number,
  height: number,
  hiddenIds: ReadonlySet<string> = new Set()
): void {
  for (const combatant of combatants) {
    if (hiddenIds.has(combatant.id)) continue;
    drawCombatDamageParticles(
      context,
      combatant,
      geometryFor(combatant),
      particlesById,
      now,
      width,
      height
    );
  }
}

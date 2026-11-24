import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

export function drawCombatDamageParticles(
  context: CanvasRenderingContext2D,
  combatant: StrategicCombatSnapshot['attacker'],
  geometry: ShipScreenGeometry,
  particlesById: Map<string, DistressDamageParticles>,
  now: number,
  width: number,
  height: number
): void {
  const fraction = Math.max(0, Math.min(1, combatant.hullHp / Math.max(1, combatant.hullMaxHp)));
  if (fraction > 0.85 && !particlesById.has(combatant.id)) return;
  let particles = particlesById.get(combatant.id);
  if (!particles) {
    particles = new DistressDamageParticles();
    particlesById.set(combatant.id, particles);
  }
  const camera = {
    worldToScreen: (point: { x: number; y: number }) => point,
    scale: (meters: number) => meters,
  };
  particles.update(
    now,
    geometry.center,
    geometry.angle,
    geometry.width,
    camera,
    context,
    width,
    height,
    fraction
  );
}

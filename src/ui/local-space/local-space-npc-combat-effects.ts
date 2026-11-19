import { getShipDefinition } from '../../systems/ships';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { MapCamera } from '../map/map-camera';
import { drawCombatBeamVisual } from '../combat/combat-beam-visual';
import { drawCombatImpactBatch } from '../combat/combat-impact-visual-batch';
import { drawVisionProjectile } from '../combat/combat-weapon-vision-renderer';
import { LocalNpcImpactTimeline } from './local-npc-impact-timeline';
import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawShipDestruction } from '../combat/ship-destruction-visual';

const impactTimeline = new LocalNpcImpactTimeline();
const damageParticles = new Map<string, DistressDamageParticles>();
const destructionStarts = new Map<string, number>();

/** A background NPC duel is rendered in the existing mining scene, without
 * replacing the player's mining controls or invoking another combat renderer.
 * Weapon beams, projectile bodies and shield/hull hits reuse native PvP FX.
 */
export function drawLocalNpcCombatEffects(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  combats: readonly StrategicCombatSnapshot[],
  width: number,
  height: number
): void {
  const screen = (position: { readonly x: number; readonly y: number }) =>
    camera.worldToScreen(position, width, height);
  impactTimeline.retain(combats);
  const active = new Set<string>();
  for (const duel of combats) {
    const duelKey = duel.attacker.id + ':' + duel.defender.id;
    active.add(duelKey);
    for (const ship of [duel.attacker, duel.defender]) {
      active.add(ship.id);
      const fraction = ship.hullHp / Math.max(1, ship.hullMaxHp);
      if (fraction > 0.85) continue;
      let effect = damageParticles.get(ship.id);
      if (!effect) {
        effect = new DistressDamageParticles();
        damageParticles.set(ship.id, effect);
      }
      effect.update(
        performance.now() / 1000,
        ship.position,
        ship.headingRadians,
        getShipDefinition(ship.shipId)?.nominalLengthMeters ?? 20,
        camera,
        context,
        width,
        height,
        fraction
      );
    }
    if (duel.winner !== null) {
      const now = performance.now() / 1000;
      if (!destructionStarts.has(duelKey)) destructionStarts.set(duelKey, now);
      const loser = duel.winner === 'attacker' ? duel.defender : duel.attacker;
      if (loser.hullHp <= 0) {
        const point = screen(loser.position);
        const radius =
          camera.scale(getShipDefinition(loser.shipId)?.nominalLengthMeters ?? 20) * 0.55;
        drawShipDestruction(
          context,
          point.x,
          point.y,
          radius,
          now - destructionStarts.get(duelKey)!
        );
      }
    }

    // The simulation clock freezes after a winner; any last-frame beam or
    // tractor tether would otherwise remain permanently visible in the world.
    if (duel.winner !== null) continue;
    for (const beam of duel.beams) {
      if (beam.ttlSeconds <= 0) continue;
      drawCombatBeamVisual(context, beam, screen(beam.origin), screen(beam.end));
    }
    for (const projectile of duel.projectiles) {
      const point = screen(projectile.position);
      const drawn = drawVisionProjectile(
        context,
        projectile.family,
        point,
        projectile.direction,
        duel.elapsedSeconds,
        projectile.id
      );
      if (!drawn) {
        context.save();
        context.fillStyle = 'rgba(245, 211, 156, .95)';
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1.2, camera.scale(3)), 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    drawCombatImpactBatch(
      context,
      impactTimeline.visible(duel),
      duel.elapsedSeconds,
      screen,
      (side) => {
        const ship = duel[side];
        return camera.scale(getShipDefinition(ship.shipId)?.nominalLengthMeters ?? 60) / 2;
      }
    );
  }
  for (const key of damageParticles.keys())
    if (!active.has(key)) damageParticles.delete(key);
  for (const key of destructionStarts.keys())
    if (!active.has(key)) destructionStarts.delete(key);
}

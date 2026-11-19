import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { MapCamera } from '../map/map-camera';
import { drawCombatBeamVisual } from '../combat/combat-beam-visual';
import { drawCombatImpactBatch } from '../combat/combat-impact-visual-batch';
import { drawVisionProjectile } from '../combat/combat-weapon-vision-renderer';

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
  for (const duel of combats) {
    for (const beam of duel.beams) {
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
    const impacts = duel.recentImpacts.length
      ? duel.recentImpacts
      : duel.lastImpact
        ? [duel.lastImpact]
        : [];
    drawCombatImpactBatch(
      context,
      impacts.map((impact) => ({ impact, startedAt: duel.elapsedSeconds - 0.12 })),
      duel.elapsedSeconds,
      screen,
      (side) => {
        const ship = duel[side];
        return camera.scale(ship.nominalLengthMeters) / 2;
      }
    );
  }
}

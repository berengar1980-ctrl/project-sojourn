import { drawCombatWreck3d } from '../salvage/combat-wreck-mesh';
import { combatWreckVariantFor } from '../../core/combat-wreck-variant';
import { drawShipDestruction } from './ship-destruction-visual';

export function drawDestroyedCombatant(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  size: number,
  headingRadians: number,
  shipId: string,
  arenaSeed: number,
  combatElapsedSeconds: number,
  age: number
): void {
  if (age >= 0.28 && !shipId.startsWith('security-drone:')) {
    const variant = combatWreckVariantFor(arenaSeed, shipId, combatElapsedSeconds);
    context.save();
    context.translate(center.x, center.y);
    context.globalAlpha = Math.min(1, (age - 0.28) * 3);
    drawCombatWreck3d(
      context,
      variant,
      size * 0.65,
      {
        x: 0.19,
        y: 0.16,
        z: headingRadians,
      },
      age,
      arenaSeed
    );
    context.restore();
  }
  drawShipDestruction(context, center.x, center.y, size * 0.6, age);
}

import type { ShipEffectLayer, ShipHardpoints } from '../../core/ship-types';
import { projectHardpoint, type ShipScreenGeometry } from './ship-hardpoint-projector';
import { ThrusterGlowRenderer } from './thruster-glow-renderer';

function engineFlicker(timeSeconds: number, index: number): number {
  const slow = Math.sin(timeSeconds * 9.5 + index * 0.83) * 0.09;
  const fast = Math.sin(timeSeconds * 24.5 + index * 1.67) * 0.05;
  const micro = Math.sin(timeSeconds * 47 + index * 2.13) * 0.025;
  return 0.9 + slow + fast + micro;
}

export class ShipEngineEffectsRenderer {
  private readonly glow = new ThrusterGlowRenderer();

  drawExhaust(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    intensity: number,
    timeSeconds: number,
    layer: ShipEffectLayer = 'below',
    boosted = false
  ): void {
    if (intensity <= 0) return;
    const normalizedIntensity = Math.min(1, Math.max(0, intensity));

    source.engines.forEach((hardpoint, index) => {
      if ((hardpoint.layer ?? 'below') !== layer) return;
      const nozzle = projectHardpoint(hardpoint, source, geometry);
      const flicker = engineFlicker(timeSeconds, index);
      const baseWidth = Math.max(2, (hardpoint.width / source.sourceWidth) * geometry.width);
      const length = baseWidth * (0.58 + normalizedIntensity * 0.92) * flicker * (boosted ? 2.3 : 1);
      const thickness = baseWidth * (0.34 + normalizedIntensity * 0.13) * (boosted ? 1.65 : 1);
      const backwards = {
        x: -Math.cos(geometry.angle),
        y: -Math.sin(geometry.angle),
      };
      const tail = {
        x: nozzle.x + backwards.x * length,
        y: nozzle.y + backwards.y * length,
      };

      context.save();
      context.lineCap = 'round';
      context.shadowColor = 'rgba(77, 181, 255, .9)';
      context.shadowBlur = 7 + normalizedIntensity * 8;
      context.strokeStyle =
        'rgba(69, 161, 255, ' + (0.22 + normalizedIntensity * 0.32) * flicker + ')';
      context.lineWidth = thickness * 2.2;
      context.beginPath();
      context.moveTo(nozzle.x, nozzle.y);
      context.lineTo(tail.x, tail.y);
      context.stroke();

      context.shadowBlur = 4;
      context.strokeStyle =
        'rgba(224, 249, 255, ' + (0.58 + normalizedIntensity * 0.28) * flicker + ')';
      context.lineWidth = Math.max(1, thickness * 0.72);
      context.beginPath();
      context.moveTo(nozzle.x, nozzle.y);
      context.lineTo(
        nozzle.x + backwards.x * length * 0.72,
        nozzle.y + backwards.y * length * 0.72
      );
      context.stroke();
      context.restore();
    });
  }

  drawGlow(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    intensity: number,
    timeSeconds: number,
    layer: ShipEffectLayer = 'below'
  ): void {
    if (intensity <= 0) return;
    const normalizedIntensity = Math.min(1, Math.max(0, intensity));

    source.engines.forEach((hardpoint, index) => {
      if ((hardpoint.layer ?? 'below') !== layer) return;
      const nozzle = projectHardpoint(hardpoint, source, geometry);
      const flicker = engineFlicker(timeSeconds, index);
      const baseWidth = Math.max(2, (hardpoint.width / source.sourceWidth) * geometry.width);
      this.glow.draw(context, {
        center: nozzle,
        radius: baseWidth * 2.5,
        intensity: 0.34 + normalizedIntensity * 0.66,
        flicker,
      });
    });
  }

  draw(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    intensity: number,
    timeSeconds: number,
    layer: ShipEffectLayer = 'below'
  ): void {
    this.drawExhaust(context, source, geometry, intensity, timeSeconds, layer);
    this.drawGlow(context, source, geometry, intensity, timeSeconds, layer);
  }
}

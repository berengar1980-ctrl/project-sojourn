import type { ShipHardpoints } from '../../core/ship-types';
import { projectHardpoint, type ShipScreenGeometry } from './ship-hardpoint-projector';
import { ThrusterGlowRenderer } from './thruster-glow-renderer';

export class ShipEngineEffectsRenderer {
  private readonly glow = new ThrusterGlowRenderer();

  draw(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    intensity: number,
    timeSeconds: number
  ): void {
    if (intensity <= 0) return;

    const normalizedIntensity = Math.min(1, Math.max(0, intensity));

    source.engines.forEach((hardpoint, index) => {
      const nozzle = projectHardpoint(hardpoint, source, geometry);
      const slowPulse = Math.sin(timeSeconds * 10.5 + index * 0.8) * 0.055;
      const fastPulse = Math.sin(timeSeconds * 24 + index * 1.6) * 0.025;
      const flicker = 0.93 + slowPulse + fastPulse;
      const baseWidth = Math.max(2, (hardpoint.width / source.sourceWidth) * geometry.width);
      const length = baseWidth * (0.58 + normalizedIntensity * 0.92) * flicker;
      const thickness = baseWidth * (0.34 + normalizedIntensity * 0.13);
      const backwards = {
        x: -Math.cos(geometry.angle),
        y: -Math.sin(geometry.angle),
      };
      const tail = {
        x: nozzle.x + backwards.x * length,
        y: nozzle.y + backwards.y * length,
      };

      this.glow.draw(context, {
        center: nozzle,
        radius: baseWidth * 1.65,
        intensity: 0.24 + normalizedIntensity * 0.76,
        flicker,
      });

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
}

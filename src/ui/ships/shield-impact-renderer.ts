import type { ShieldImpactEffect } from '../../core/shield-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { MapCamera, ScreenPoint } from '../map/map-camera';
import { projectShieldGeometry, type ShipScreenGeometry } from './ship-hardpoint-projector';

function rotate(point: ScreenPoint, angle: number): ScreenPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class ShieldImpactRenderer {
  draw(
    context: CanvasRenderingContext2D,
    camera: MapCamera,
    impacts: readonly ShieldImpactEffect[],
    hardpoints: ShipHardpoints,
    geometry: ShipScreenGeometry,
    viewWidth: number,
    viewHeight: number
  ): void {
    if (impacts.length === 0) return;
    const shield = projectShieldGeometry(hardpoints.shield, hardpoints, geometry);

    for (const impact of impacts) {
      const progress = clamp01(impact.ageSeconds / impact.lifetimeSeconds);
      const fade = Math.pow(1 - progress, 1.45);
      if (fade <= 0.001) continue;

      const point = camera.worldToScreen(impact.point, viewWidth, viewHeight);
      const relative = rotate(
        { x: point.x - shield.center.x, y: point.y - shield.center.y },
        -shield.angle
      );
      const impactAngle = Math.atan2(relative.y / shield.radiusY, relative.x / shield.radiusX);
      const expansion = 1 - Math.pow(1 - progress, 2.2);
      const halfSpan = 0.06 + expansion * (0.3 + impact.strength * 0.5);

      context.save();
      context.translate(shield.center.x, shield.center.y);
      context.rotate(shield.angle);

      for (let layer = 0; layer < 3; layer += 1) {
        const spread = halfSpan * (1 - layer * 0.14);
        const alpha = fade * (0.2 + impact.strength * 0.34) * (1 - layer * 0.22);
        context.beginPath();
        context.ellipse(
          0,
          0,
          shield.radiusX,
          shield.radiusY,
          0,
          impactAngle - spread,
          impactAngle + spread
        );
        context.strokeStyle = `rgba(92, 190, 255, ${alpha})`;
        context.lineWidth = 2 + impact.strength * 4.5 + layer * 2.5;
        context.shadowColor = 'rgba(140, 220, 255, .9)';
        context.shadowBlur = 8 + impact.strength * 18;
        context.stroke();
      }
      context.restore();

      this.drawCore(context, point, impact, fade, progress);
      this.drawLightning(context, point, impact, fade, progress);
    }
  }

  private drawCore(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    const radius = 5 + impact.strength * 12 + progress * 5;
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(225, 248, 255, ${0.88 * fade})`);
    gradient.addColorStop(0.35, `rgba(132, 214, 255, ${0.58 * fade})`);
    gradient.addColorStop(1, 'rgba(66, 139, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawLightning(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    if (progress > 0.58 || impact.strength < 0.16) return;
    const count = Math.max(1, Math.round(impact.strength * 5));
    const alpha = fade * (0.45 + impact.strength * 0.5);

    context.save();
    context.strokeStyle = `rgba(220, 247, 255, ${alpha})`;
    context.lineWidth = 0.8 + impact.strength * 1.2;
    context.shadowColor = 'rgba(180, 232, 255, .95)';
    context.shadowBlur = 6;

    for (let branch = 0; branch < count; branch += 1) {
      const phase = impact.id * 1.73 + branch * 2.19 + Math.floor(progress * 18) * 0.71;
      const angle = phase + Math.sin(phase * 1.9) * 0.8;
      const length = 5 + impact.strength * 13 * (0.6 + Math.abs(Math.sin(phase)));
      const tangent = { x: Math.cos(angle), y: Math.sin(angle) };

      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(
        point.x + tangent.x * length * 0.48 + Math.sin(phase * 3.1) * 3,
        point.y + tangent.y * length * 0.48 + Math.cos(phase * 2.7) * 3
      );
      context.lineTo(point.x + tangent.x * length, point.y + tangent.y * length);
      context.stroke();
    }
    context.restore();
  }
}

import type { ShieldImpactEffect } from '../../core/shield-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { MapCamera, ScreenPoint } from '../map/map-camera';
import { projectShieldGeometry, type ShipScreenGeometry } from './ship-hardpoint-projector';

interface ShieldEllipse {
  readonly center: ScreenPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
}

function rotate(point: ScreenPoint, angle: number): ScreenPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ellipsePoint(shield: ShieldEllipse, angle: number): ScreenPoint {
  return {
    x: Math.cos(angle) * shield.radiusX,
    y: Math.sin(angle) * shield.radiusY,
  };
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
      const fade = Math.pow(1 - progress, 1.65);
      if (fade <= 0.001) continue;

      const worldPoint = camera.worldToScreen(impact.point, viewWidth, viewHeight);
      const relative = rotate(
        { x: worldPoint.x - shield.center.x, y: worldPoint.y - shield.center.y },
        -shield.angle
      );
      const impactAngle = Math.atan2(relative.y / shield.radiusY, relative.x / shield.radiusX);

      this.drawSurfaceImpact(context, shield, impact, impactAngle, fade, progress);
    }
  }

  private drawSurfaceImpact(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactAngle: number,
    fade: number,
    progress: number
  ): void {
    context.save();
    context.translate(shield.center.x, shield.center.y);
    context.rotate(shield.angle);

    this.drawRipple(context, shield, impact, impactAngle, fade, progress);
    this.drawCore(context, shield, impact, impactAngle, fade, progress);
    this.drawLightning(context, shield, impact, impactAngle, fade, progress);

    context.restore();
  }

  private drawRipple(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactAngle: number,
    fade: number,
    progress: number
  ): void {
    const expansion = 1 - Math.pow(1 - progress, 2.4);
    const halfSpan = 0.035 + expansion * (0.13 + impact.strength * 0.16);
    const alpha = fade * (0.36 + impact.strength * 0.36);

    context.save();
    context.strokeStyle = `rgba(112, 205, 255, ${alpha})`;
    context.lineWidth = 0.75 + impact.strength * 0.8;
    context.shadowColor = 'rgba(150, 220, 255, .62)';
    context.shadowBlur = 2.5 + impact.strength * 3.5;
    context.beginPath();
    context.ellipse(
      0,
      0,
      shield.radiusX,
      shield.radiusY,
      0,
      impactAngle - halfSpan,
      impactAngle + halfSpan
    );
    context.stroke();
    context.restore();
  }

  private drawCore(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactAngle: number,
    fade: number,
    progress: number
  ): void {
    const point = ellipsePoint(shield, impactAngle);
    const radius = 2.5 + impact.strength * 5.5 + progress * 1.5;
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(238, 252, 255, ${0.94 * fade})`);
    gradient.addColorStop(0.3, `rgba(142, 222, 255, ${0.62 * fade})`);
    gradient.addColorStop(1, 'rgba(68, 151, 255, 0)');

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawLightning(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactAngle: number,
    fade: number,
    progress: number
  ): void {
    if (progress > 0.5 || impact.strength < 0.16) return;

    const branchCount = Math.max(1, Math.round(1 + impact.strength * 3));
    const alpha = fade * (0.48 + impact.strength * 0.34);
    context.save();
    context.strokeStyle = `rgba(224, 248, 255, ${alpha})`;
    context.lineWidth = 0.35 + impact.strength * 0.45;
    context.shadowColor = 'rgba(180, 232, 255, .72)';
    context.shadowBlur = 2.2;

    for (let branch = 0; branch < branchCount; branch += 1) {
      this.drawLightningBranch(context, shield, impact, impactAngle, branch, progress);
    }

    context.restore();
  }

  private drawLightningBranch(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactAngle: number,
    branch: number,
    progress: number
  ): void {
    const phase = impact.id * 1.71 + branch * 2.37 + Math.floor(progress * 16) * 0.53;
    const direction = branch % 2 === 0 ? 1 : -1;
    const totalSpan = 0.08 + impact.strength * 0.13;
    const segments = 5;
    const start = ellipsePoint(shield, impactAngle);

    context.beginPath();
    context.moveTo(start.x, start.y);

    for (let segment = 1; segment <= segments; segment += 1) {
      const t = segment / segments;
      const jitter = Math.sin(phase + segment * 2.41) * 0.018 * (1 - t);
      const angle = impactAngle + direction * totalSpan * t + jitter;
      const point = ellipsePoint(shield, angle);
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }
}

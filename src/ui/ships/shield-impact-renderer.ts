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

function projectToEllipse(point: ScreenPoint, shield: ShieldEllipse): ScreenPoint {
  const normalized = Math.hypot(point.x / shield.radiusX, point.y / shield.radiusY) || 1;
  return {
    x: point.x / normalized,
    y: point.y / normalized,
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
      const fade = Math.pow(1 - progress, 1.7);
      if (fade <= 0.001) continue;

      const impactPoint = impact.surfacePoint
        ? {
            x: impact.surfacePoint.x * shield.radiusX,
            y: impact.surfacePoint.y * shield.radiusY,
          }
        : this.projectWorldImpact(camera, impact, shield, viewWidth, viewHeight);
      this.drawSurfaceImpact(context, shield, impact, impactPoint, fade, progress);
    }
  }

  private projectWorldImpact(
    camera: MapCamera,
    impact: ShieldImpactEffect,
    shield: ShieldEllipse,
    viewWidth: number,
    viewHeight: number
  ): ScreenPoint {
    const worldPoint = camera.worldToScreen(impact.point, viewWidth, viewHeight);
    const relative = rotate(
      { x: worldPoint.x - shield.center.x, y: worldPoint.y - shield.center.y },
      -shield.angle
    );
    return projectToEllipse(relative, shield);
  }

  private drawSurfaceImpact(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    impactPoint: ScreenPoint,
    fade: number,
    progress: number
  ): void {
    context.save();
    context.translate(shield.center.x, shield.center.y);
    context.rotate(shield.angle);
    context.beginPath();
    context.ellipse(0, 0, shield.radiusX, shield.radiusY, 0, 0, Math.PI * 2);
    context.clip();

    this.drawSurfaceFlash(context, shield, impactPoint, impact, fade, progress);
    this.drawRipple(context, shield, impactPoint, impact, fade, progress);
    this.drawLightning(context, shield, impactPoint, impact, fade, progress);
    this.drawCore(context, impactPoint, impact, fade, progress);

    context.restore();
  }

  private drawSurfaceFlash(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    const maxRadius = Math.min(shield.radiusX, shield.radiusY) * (0.72 + impact.strength * 0.48);
    const radius = maxRadius * (0.34 + progress * 0.66);
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(202, 244, 255, ${fade * 0.42})`);
    gradient.addColorStop(0.42, `rgba(105, 203, 255, ${fade * 0.2})`);
    gradient.addColorStop(1, 'rgba(70, 150, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(-shield.radiusX, -shield.radiusY, shield.radiusX * 2, shield.radiusY * 2);
  }

  private drawRipple(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    const maxRadius = Math.min(shield.radiusX, shield.radiusY) * (1.02 + impact.strength * 0.62);
    const radius = 3 + maxRadius * (1 - Math.pow(1 - progress, 2.2));
    const alpha = fade * (0.58 + impact.strength * 0.38);

    context.save();
    context.strokeStyle = `rgba(138, 220, 255, ${alpha})`;
    context.lineWidth = 0.65 + impact.strength * 0.7;
    context.shadowColor = 'rgba(154, 225, 255, .7)';
    context.shadowBlur = 3.5 + impact.strength * 4.8;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.stroke();

    if (progress > 0.12) {
      context.globalAlpha = 0.45;
      context.beginPath();
      context.arc(point.x, point.y, radius * 0.64, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private drawCore(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    const radius = 3.2 + impact.strength * 7.2 + progress * 1.6;
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(244, 253, 255, ${0.98 * fade})`);
    gradient.addColorStop(0.28, `rgba(151, 228, 255, ${0.68 * fade})`);
    gradient.addColorStop(1, 'rgba(68, 151, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawLightning(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    fade: number,
    progress: number
  ): void {
    if (progress > 0.52 || impact.strength < 0.14) return;

    const branchCount = Math.max(2, Math.round(2 + impact.strength * 3));
    context.save();
    context.strokeStyle = `rgba(226, 249, 255, ${fade * (0.5 + impact.strength * 0.3)})`;
    context.lineWidth = 0.28 + impact.strength * 0.38;
    context.shadowColor = 'rgba(180, 232, 255, .68)';
    context.shadowBlur = 1.8;

    for (let branch = 0; branch < branchCount; branch += 1) {
      this.drawLightningBranch(context, shield, point, impact, branch, progress);
    }
    context.restore();
  }

  private drawLightningBranch(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    start: ScreenPoint,
    impact: ShieldImpactEffect,
    branch: number,
    progress: number
  ): void {
    const phase = impact.id * 1.73 + branch * 2.31 + Math.floor(progress * 18) * 0.47;
    const tangent = { x: -start.y / shield.radiusY, y: start.x / shield.radiusX };
    const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
    const tangentUnit = { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
    const side = (branch % 2 === 0 ? 1 : -1) * (0.18 + branch * 0.035);
    const inward = 0.42 + impact.strength * 0.2;
    const segments = 6;

    context.beginPath();
    context.moveTo(start.x, start.y);

    for (let segment = 1; segment <= segments; segment += 1) {
      const t = segment / segments;
      const zig = Math.sin(phase + segment * 2.7) * (1 - t) * 3.2;
      const x =
        start.x * (1 - inward * t) +
        tangentUnit.x * shield.radiusX * side * t +
        tangentUnit.x * zig;
      const y =
        start.y * (1 - inward * t) +
        tangentUnit.y * shield.radiusY * side * t +
        tangentUnit.y * zig;
      context.lineTo(x, y);
    }

    context.stroke();
  }
}

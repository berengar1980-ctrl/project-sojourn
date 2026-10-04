import type { ShieldImpactEffect } from '../../core/shield-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { ScreenPoint } from '../map/map-camera';
import { projectShieldGeometry, type ShipScreenGeometry } from './ship-hardpoint-projector';

interface ShieldEllipse {
  readonly center: ScreenPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function irregularity(seed: number, index: number): number {
  const first = Math.sin(seed * 1.713 + index * 2.417);
  const second = Math.sin(seed * 0.731 + index * 5.113);
  return first * 0.11 + second * 0.055;
}

function surfacePoint(impact: ShieldImpactEffect, shield: ShieldEllipse): ScreenPoint {
  return {
    x: impact.surfaceAnchor.x * shield.radiusX,
    y: impact.surfaceAnchor.y * shield.radiusY,
  };
}

export class ShieldImpactRenderer {
  draw(
    context: CanvasRenderingContext2D,
    impacts: readonly ShieldImpactEffect[],
    hardpoints: ShipHardpoints,
    geometry: ShipScreenGeometry
  ): void {
    if (impacts.length === 0) return;
    const shield = projectShieldGeometry(hardpoints.shield, hardpoints, geometry);

    for (const impact of impacts) {
      const progress = clamp01(impact.ageSeconds / impact.lifetimeSeconds);
      const point = surfacePoint(impact, shield);
      this.drawSurfaceImpact(context, shield, impact, point, progress);
    }
  }

  private drawSurfaceImpact(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    impact: ShieldImpactEffect,
    point: ScreenPoint,
    progress: number
  ): void {
    context.save();
    context.translate(shield.center.x, shield.center.y);
    context.rotate(shield.angle);
    context.beginPath();
    context.ellipse(0, 0, shield.radiusX, shield.radiusY, 0, 0, Math.PI * 2);
    context.clip();

    this.drawEnergyPatch(context, shield, point, impact, progress);
    this.drawLightning(context, shield, point, impact, progress);
    this.drawCore(context, point, impact, progress);

    context.restore();
  }

  private drawEnergyPatch(
    context: CanvasRenderingContext2D,
    shield: ShieldEllipse,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    progress: number
  ): void {
    const growth = clamp01(progress / 0.58);
    const decay = clamp01((progress - 0.52) / 0.48);
    const maximumRadius =
      Math.min(shield.radiusX, shield.radiusY) * (0.62 + impact.strength * 0.42);
    const radius = maximumRadius * (0.16 + 0.84 * (1 - Math.pow(1 - growth, 2.1)));
    const alpha = 0.2 + impact.strength * 0.34;

    context.save();
    this.traceIrregularPatch(context, point, radius, impact.id);
    context.clip();

    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    if (decay <= 0) {
      gradient.addColorStop(0, `rgba(194, 241, 255, ${alpha * 1.25})`);
      gradient.addColorStop(0.42, `rgba(96, 198, 255, ${alpha})`);
      gradient.addColorStop(0.82, `rgba(70, 158, 255, ${alpha * 0.48})`);
      gradient.addColorStop(1, 'rgba(55, 135, 255, 0)');
    } else {
      const clearRadius = Math.min(0.82, decay * 0.82);
      const liveStart = Math.min(0.9, clearRadius + 0.09);
      gradient.addColorStop(0, 'rgba(90, 190, 255, 0)');
      gradient.addColorStop(clearRadius, 'rgba(90, 190, 255, 0)');
      gradient.addColorStop(liveStart, `rgba(111, 213, 255, ${alpha * (1 - decay * 0.35)})`);
      gradient.addColorStop(1, 'rgba(55, 135, 255, 0)');
    }

    context.fillStyle = gradient;
    context.shadowColor = 'rgba(99, 201, 255, .55)';
    context.shadowBlur = 4 + impact.strength * 5;
    context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    context.restore();
  }

  private traceIrregularPatch(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    radius: number,
    seed: number
  ): void {
    const segments = 32;
    context.beginPath();

    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const wobble = 1 + irregularity(seed, index);
      const radial = radius * wobble;
      const x = point.x + Math.cos(angle) * radial;
      const y = point.y + Math.sin(angle) * radial * (0.72 + 0.08 * Math.sin(seed * 0.37));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.closePath();
  }

  private drawCore(
    context: CanvasRenderingContext2D,
    point: ScreenPoint,
    impact: ShieldImpactEffect,
    progress: number
  ): void {
    const decay = clamp01((progress - 0.42) / 0.28);
    const alpha = 1 - decay;
    if (alpha <= 0.001) return;

    const radius = 3 + impact.strength * 5.8;
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(247, 254, 255, ${0.96 * alpha})`);
    gradient.addColorStop(0.32, `rgba(155, 232, 255, ${0.64 * alpha})`);
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
    progress: number
  ): void {
    if (progress > 0.56 || impact.strength < 0.14) return;

    const fade = Math.pow(1 - progress / 0.56, 1.3);
    const branchCount = Math.max(3, Math.round(3 + impact.strength * 4));
    context.save();
    context.strokeStyle = `rgba(226, 249, 255, ${fade * (0.52 + impact.strength * 0.32)})`;
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
    const side = (branch % 2 === 0 ? 1 : -1) * (0.2 + branch * 0.04);
    const inward = 0.5 + impact.strength * 0.24;
    const segments = 7;

    context.beginPath();
    context.moveTo(start.x, start.y);

    for (let segment = 1; segment <= segments; segment += 1) {
      const t = segment / segments;
      const zig = Math.sin(phase + segment * 2.7) * (1 - t) * 4.1;
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

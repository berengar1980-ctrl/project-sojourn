import type { ShipHardpoint } from '../../core/ship-types';
import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera, ScreenPoint } from '../map/map-camera';

export interface ShipScreenGeometry {
  readonly center: ScreenPoint;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

function rotatePoint(x: number, y: number, angle: number): ScreenPoint {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function hardpointScreen(
  hardpoint: ShipHardpoint,
  geometry: ShipScreenGeometry,
  model: LocalSpaceViewModel
): ScreenPoint {
  const source = model.ship.hardpoints;
  const localX = ((hardpoint.x - source.pivot.x) / source.sourceWidth) * geometry.width;
  const localY = ((hardpoint.y - source.pivot.y) / source.sourceHeight) * geometry.height;
  const rotated = rotatePoint(localX, localY, geometry.angle);
  return {
    x: geometry.center.x + rotated.x,
    y: geometry.center.y + rotated.y,
  };
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

function surfaceImpactPoint(center: ScreenPoint, ship: ScreenPoint, radius: number): ScreenPoint {
  const dx = ship.x - center.x;
  const dy = ship.y - center.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  return {
    x: center.x + (dx / length) * radius,
    y: center.y + (dy / length) * radius,
  };
}

export class MiningEffectsRenderer {
  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly camera: MapCamera
  ) {}

  drawMining(
    model: LocalSpaceViewModel,
    geometry: ShipScreenGeometry,
    viewportWidth: number,
    viewportHeight: number,
    timeSeconds: number
  ): void {
    if (!model.laserActive || !model.miningTarget) return;

    const targetCenter = this.camera.worldToScreen(
      model.miningTarget.position,
      viewportWidth,
      viewportHeight
    );
    const impactRadius = Math.max(4, this.camera.scale(model.miningTarget.radius) * 0.82);
    const target = surfaceImpactPoint(targetCenter, geometry.center, impactRadius);
    const pulse = 0.72 + Math.sin(timeSeconds * 13) * 0.22;

    this.context.save();
    this.context.shadowColor = 'rgba(255, 54, 30, .85)';
    this.context.shadowBlur = 5 + pulse * 6;
    this.context.strokeStyle = 'rgba(238, 62, 40, ' + (0.62 + pulse * 0.3) + ')';

    for (const hardpoint of model.ship.hardpoints.miningLasers) {
      const start = hardpointScreen(hardpoint, geometry, model);
      const baseWidth = Math.max(
        1.1,
        (hardpoint.width / model.ship.hardpoints.sourceWidth) * geometry.width * 0.72
      );
      this.context.lineWidth = baseWidth * (0.72 + pulse * 0.55);
      this.context.beginPath();
      this.context.moveTo(start.x, start.y);
      this.context.lineTo(target.x, target.y);
      this.context.stroke();
    }

    this.context.restore();
    this.drawImpactSparks(target, model.miningTarget.radius, timeSeconds);
    this.drawImpactDust(target, model.miningTarget.radius, timeSeconds);
  }

  drawTractorFields(
    model: LocalSpaceViewModel,
    viewportWidth: number,
    viewportHeight: number,
    timeSeconds: number
  ): void {
    const ship = this.camera.worldToScreen(model.ship.position, viewportWidth, viewportHeight);
    this.context.save();

    model.chunks.forEach((chunk, index) => {
      if (!chunk.tractorActive) return;
      const point = this.camera.worldToScreen(chunk.position, viewportWidth, viewportHeight);
      const pulse = 0.58 + Math.sin(timeSeconds * 8.5 + index * 0.9) * 0.28;

      this.context.shadowColor = 'rgba(74, 255, 140, .82)';
      this.context.shadowBlur = 7 + pulse * 8;
      this.context.strokeStyle = 'rgba(54, 229, 117, ' + (0.12 + pulse * 0.2) + ')';
      this.context.lineWidth = 4 + pulse * 3;
      this.context.beginPath();
      this.context.moveTo(point.x, point.y);
      this.context.lineTo(ship.x, ship.y);
      this.context.stroke();

      this.context.shadowBlur = 2 + pulse * 2;
      this.context.strokeStyle = 'rgba(166, 255, 195, ' + (0.42 + pulse * 0.42) + ')';
      this.context.lineWidth = 0.9 + pulse * 1.4;
      this.context.beginPath();
      this.context.moveTo(point.x, point.y);
      this.context.lineTo(ship.x, ship.y);
      this.context.stroke();
    });

    this.context.restore();
  }

  private drawImpactSparks(target: ScreenPoint, radius: number, timeSeconds: number): void {
    this.context.save();
    this.context.lineCap = 'round';

    for (let index = 0; index < 8; index += 1) {
      const phase = fractional(timeSeconds * 2.7 + index * 0.173);
      const angle = index * 2.399 + Math.sin(timeSeconds * 1.8 + index) * 0.32;
      const travel = (8 + Math.min(18, radius * 0.18)) * phase;
      const x = target.x + Math.cos(angle) * travel;
      const y = target.y + Math.sin(angle) * travel;
      const tail = 3 + phase * 6;
      const alpha = Math.max(0, 1 - phase) * 0.88;

      this.context.strokeStyle = 'rgba(255, 177, 82, ' + alpha + ')';
      this.context.shadowColor = 'rgba(255, 98, 45, .8)';
      this.context.shadowBlur = 4;
      this.context.lineWidth = 1 + (1 - phase) * 1.2;
      this.context.beginPath();
      this.context.moveTo(x, y);
      this.context.lineTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail);
      this.context.stroke();
    }

    this.context.restore();
  }

  private drawImpactDust(target: ScreenPoint, radius: number, timeSeconds: number): void {
    this.context.save();

    for (let index = 0; index < 6; index += 1) {
      const phase = fractional(timeSeconds * 0.72 + index * 0.161);
      const angle = index * 1.73 + 0.6;
      const drift = (5 + Math.min(16, radius * 0.14)) * phase;
      const x = target.x + Math.cos(angle) * drift;
      const y = target.y + Math.sin(angle) * drift;
      const size = 4 + phase * 10;
      const alpha = Math.max(0, 1 - phase) * 0.16;

      this.context.fillStyle = 'rgba(150, 136, 119, ' + alpha + ')';
      this.context.beginPath();
      this.context.arc(x, y, size, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.restore();
  }
}

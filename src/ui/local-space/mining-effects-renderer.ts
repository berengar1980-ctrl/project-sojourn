import { drawMiningLaserBeam, drawMiningTractorBeam } from './mining-beam-visuals';
import type { ShipEffectLayer } from '../../core/ship-types';
import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera, ScreenPoint } from '../map/map-camera';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

function fractional(value: number): number {
  return value - Math.floor(value);
}

function normalized(point: ScreenPoint): ScreenPoint {
  const length = Math.max(0.001, Math.hypot(point.x, point.y));
  return { x: point.x / length, y: point.y / length };
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
    timeSeconds: number,
    layer: ShipEffectLayer
  ): void {
    if (model.combat || !model.laserActive || !model.miningImpact) return;

    const target = this.camera.worldToScreen(
      model.miningImpact.point,
      viewportWidth,
      viewportHeight
    );
    const normal = normalized(model.miningImpact.normal);
    const pulse = 0.72 + Math.sin(timeSeconds * 13) * 0.22;
    const hardpoints = model.ship.hardpoints.miningLasers.filter(
      (hardpoint) => (hardpoint.layer ?? 'below') === layer
    );

    this.context.save();
    for (const [index, hardpoint] of hardpoints.entries()) {
      const start = projectHardpoint(hardpoint, model.ship.hardpoints, geometry);
      const baseWidth = Math.max(
        1.1,
        (hardpoint.width / model.ship.hardpoints.sourceWidth) * geometry.width * 0.72
      );
      const interferenceSeed = Math.sin(
        Math.floor(timeSeconds * 9 + index * 3.7) * 12.9898 + index * 78.233
      );
      const interference = fractional(Math.abs(interferenceSeed) * 43758.5453);
      const interferenceStrength = interference < 0.055 ? 0.08 : interference < 0.13 ? 0.42 : 1;
      const width =
        baseWidth * (0.72 + pulse * 0.55) * (interferenceStrength < 1 ? 0.72 : 1);
      drawMiningLaserBeam(
        this.context,
        start,
        target,
        width,
        interferenceStrength,
        pulse
      );

      if (interferenceStrength < 0.5) {
        const phase = 0.28 + fractional(timeSeconds * 3.1 + index * 0.23) * 0.44;
        const x = start.x + (target.x - start.x) * phase;
        const y = start.y + (target.y - start.y) * phase;
        this.context.globalAlpha = 0.75;
        this.context.fillStyle = 'rgba(255, 205, 170, .9)';
        this.context.fillRect(x - 2.5, y - 1, 5, 2);
      }
    }
    this.context.globalAlpha = 1;

    this.context.restore();
    if (layer === 'above') {
      this.drawImpactSparks(target, normal, timeSeconds);
      this.drawImpactDust(target, normal, timeSeconds);
    }
  }

  drawTractorFields(
    model: LocalSpaceViewModel,
    geometry: ShipScreenGeometry,
    viewportWidth: number,
    viewportHeight: number,
    timeSeconds: number,
    layer: ShipEffectLayer
  ): void {
    // Mining tractor work must not masquerade as a combat weapon tether.
    if (model.combat) return;
    const hardpoints = (model.ship.hardpoints.tractorBeams ?? []).filter(
      (hardpoint) => (hardpoint.layer ?? 'below') === layer
    );
    if (hardpoints.length === 0) return;

    this.context.save();

    model.chunks.forEach((chunk, index) => {
      if (!chunk.tractorActive) return;
      const point = this.camera.worldToScreen(chunk.position, viewportWidth, viewportHeight);
      const pulse = 0.58 + Math.sin(timeSeconds * 8.5 + index * 0.9) * 0.28;

      for (const hardpoint of hardpoints) {
        const ship = projectHardpoint(hardpoint, model.ship.hardpoints, geometry);
        drawMiningTractorBeam(this.context, point, ship, pulse);
      }
    });

    this.context.restore();
  }

  private drawImpactSparks(target: ScreenPoint, normal: ScreenPoint, timeSeconds: number): void {
    const tangent = { x: -normal.y, y: normal.x };
    this.context.save();
    this.context.lineCap = 'round';

    for (let index = 0; index < 8; index += 1) {
      const phase = fractional(timeSeconds * 2.7 + index * 0.173);
      const spread = Math.sin(index * 2.31 + timeSeconds * 0.8) * 0.72;
      const direction = normalized({
        x: normal.x + tangent.x * spread,
        y: normal.y + tangent.y * spread,
      });
      const travel = (8 + index * 1.25) * phase;
      const x = target.x + direction.x * travel;
      const y = target.y + direction.y * travel;
      const tail = 3 + phase * 6;
      const alpha = Math.max(0, 1 - phase) * 0.88;

      this.context.strokeStyle = 'rgba(255, 177, 82, ' + alpha + ')';
      this.context.shadowColor = 'rgba(255, 98, 45, .8)';
      this.context.shadowBlur = 4;
      this.context.lineWidth = 1 + (1 - phase) * 1.2;
      this.context.beginPath();
      this.context.moveTo(x, y);
      this.context.lineTo(x - direction.x * tail, y - direction.y * tail);
      this.context.stroke();
    }

    this.context.restore();
  }

  private drawImpactDust(target: ScreenPoint, normal: ScreenPoint, timeSeconds: number): void {
    const tangent = { x: -normal.y, y: normal.x };
    this.context.save();

    for (let index = 0; index < 6; index += 1) {
      const phase = fractional(timeSeconds * 0.72 + index * 0.161);
      const spread = Math.sin(index * 1.73 + 0.6) * 0.85;
      const direction = normalized({
        x: normal.x * 0.9 + tangent.x * spread,
        y: normal.y * 0.9 + tangent.y * spread,
      });
      const drift = (5 + index * 2.1) * phase;
      const x = target.x + direction.x * drift;
      const y = target.y + direction.y * drift;
      const size = 3 + phase * 8;
      const alpha = Math.max(0, 1 - phase) * 0.14;

      this.context.fillStyle = 'rgba(150, 136, 119, ' + alpha + ')';
      this.context.beginPath();
      this.context.arc(x, y, size, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.restore();
  }
}

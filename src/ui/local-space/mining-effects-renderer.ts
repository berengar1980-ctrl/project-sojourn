import { drawMiningLaserBeam, drawMiningTractorBeam } from './mining-beam-visuals';
import type { ShipEffectLayer } from '../../core/ship-types';
import type {
  LocalAsteroidView,
  LocalChunkView,
  LocalNpcShipView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import type { MapCamera, ScreenPoint } from '../map/map-camera';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { hashId } from './local-space-visual-hash';

function fractional(value: number): number {
  return value - Math.floor(value);
}

export function drawMiningChunkVisual(
  context: CanvasRenderingContext2D,
  point: ScreenPoint,
  id: string
): void {
  const variation = (hashId(id) % 100) / 100;
  const radius = 1.5 + variation * 2.2;
  context.fillStyle = '#a88f73';
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
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

  /** NPC work runs through the exact same player laser, impact and ore-tractor
   * drawing routines. Only the input ship/target/ore state differs.
   */
  drawNpcMining(
    model: LocalSpaceViewModel,
    npc: LocalNpcShipView,
    asteroid: LocalAsteroidView,
    geometry: ShipScreenGeometry,
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const dx = npc.position.x - asteroid.position.x;
    const dy = npc.position.y - asteroid.position.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: dx / length, y: dy / length };
    const impact = {
      point: {
        x: asteroid.position.x + normal.x * asteroid.radius * 0.86,
        y: asteroid.position.y + normal.y * asteroid.radius * 0.86,
      },
      normal,
    };
    const tractorPort = npc.hardpoints.tractorBeams?.[0];
    const relative = tractorPort
      ? {
          x: (tractorPort.x - npc.hardpoints.pivot.x) / npc.hardpoints.sourceWidth,
          y: (tractorPort.y - npc.hardpoints.pivot.y) / npc.hardpoints.sourceHeight,
        }
      : { x: 0, y: 0 };
    const cos = Math.cos(npc.headingRadians);
    const sin = Math.sin(npc.headingRadians);
    const destination = {
      x: npc.position.x + (relative.x * cos - relative.y * sin) * npc.nominalLengthMeters,
      y: npc.position.y + (relative.x * sin + relative.y * cos) * npc.nominalLengthMeters,
    };
    // The NPC's actual successful extraction event owns the collection,
    // rather than a perpetual loop of imaginary tractor targets.
    const extraction = npc.oreCollection;
    const travel = extraction
      ? Math.max(0, Math.min(1, 1 - extraction.remainingSeconds / extraction.durationSeconds))
      : 0;
    const chunks: LocalChunkView[] = [];
    if (extraction) {
      chunks.push({
        id: npc.id + ':ore:' + extraction.resourceId,
        amount: 1,
        position: {
          x: impact.point.x + (destination.x - impact.point.x) * travel,
          y: impact.point.y + (destination.y - impact.point.y) * travel,
        },
        tractorActive: true,
      });
    }
    const workModel: LocalSpaceViewModel = {
      ...model,
      combat: null,
      laserActive: true,
      miningImpact: impact,
      ship: {
        ...model.ship,
        position: npc.position,
        headingRadians: npc.headingRadians,
        nominalLengthMeters: npc.nominalLengthMeters,
        spriteUrl: npc.spriteUrl,
        spriteAspectRatio: npc.spriteAspectRatio,
        hardpoints: npc.hardpoints,
      },
      chunks,
    };
    this.drawTractorFields(workModel, geometry, width, height, timeSeconds, 'below');
    this.drawMining(workModel, geometry, width, height, timeSeconds, 'below');
    this.drawMining(workModel, geometry, width, height, timeSeconds, 'above');
    this.drawTractorFields(workModel, geometry, width, height, timeSeconds, 'above');
    for (const chunk of chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      drawMiningChunkVisual(this.context, point, chunk.id);
    }
  }

  drawMining(
    model: LocalSpaceViewModel,
    geometry: ShipScreenGeometry,
    viewportWidth: number,
    viewportHeight: number,
    timeSeconds: number,
    layer: ShipEffectLayer
  ): void {
    if (model.combat || !model.laserActive || !model.miningImpact) return;

    // Move the surface hit slightly inside the irregular rock silhouette.
    // The renderer remains paint-only: the simulation's impact is unchanged.
    const impact = model.miningImpact.point;
    const rock = model.miningTarget;
    const distance = rock ? Math.hypot(impact.x - rock.position.x, impact.y - rock.position.y) : 0;
    const inset =
      rock && distance > rock.radius * 0.78
        ? Math.min(rock.radius * 0.14, distance - rock.radius * 0.78)
        : 0;
    const adjusted =
      rock && distance > 0
        ? {
            x: impact.x + ((rock.position.x - impact.x) * inset) / distance,
            y: impact.y + ((rock.position.y - impact.y) * inset) / distance,
          }
        : impact;
    const target = this.camera.worldToScreen(adjusted, viewportWidth, viewportHeight);
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
      const width = baseWidth * (0.72 + pulse * 0.55) * (interferenceStrength < 1 ? 0.72 : 1);
      drawMiningLaserBeam(this.context, start, target, width, interferenceStrength, pulse);

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
    const scale = Math.max(1, Math.min(3.2, Math.sqrt(this.camera.getRelativeZoom())));
    this.context.save();
    this.context.lineCap = 'round';

    for (let index = 0; index < 8; index += 1) {
      const phase = fractional(timeSeconds * 2.7 + index * 0.173);
      const spread = Math.sin(index * 2.31 + timeSeconds * 0.8) * 0.72;
      const direction = normalized({
        x: normal.x + tangent.x * spread,
        y: normal.y + tangent.y * spread,
      });
      const travel = (8 + index * 1.25) * phase * scale;
      const x = target.x + direction.x * travel;
      const y = target.y + direction.y * travel;
      const tail = (3 + phase * 6) * scale;
      const alpha = Math.max(0, 1 - phase) * 0.88;

      this.context.strokeStyle = 'rgba(255, 177, 82, ' + alpha + ')';
      this.context.shadowColor = 'rgba(255, 98, 45, .8)';
      this.context.shadowBlur = 4;
      this.context.lineWidth = (1 + (1 - phase) * 1.2) * Math.sqrt(scale);
      this.context.beginPath();
      this.context.moveTo(x, y);
      this.context.lineTo(x - direction.x * tail, y - direction.y * tail);
      this.context.stroke();
    }

    this.context.restore();
  }

  private drawImpactDust(target: ScreenPoint, normal: ScreenPoint, timeSeconds: number): void {
    const tangent = { x: -normal.y, y: normal.x };
    const scale = Math.max(1, Math.min(3.2, Math.sqrt(this.camera.getRelativeZoom())));
    this.context.save();

    for (let index = 0; index < 12; index += 1) {
      const phase = fractional(timeSeconds * 0.56 + index * 0.093);
      const spread = Math.sin(index * 1.73 + 0.6) * 0.85;
      const direction = normalized({
        x: normal.x * 0.9 + tangent.x * spread,
        y: normal.y * 0.9 + tangent.y * spread,
      });
      const drift = (5 + index * 1.8) * phase * scale;
      const x = target.x + direction.x * drift;
      const y = target.y + direction.y * drift;
      const size = (4 + phase * 10) * scale;
      const alpha = Math.max(0, 1 - phase) * 0.115;

      this.context.fillStyle = 'rgba(150, 136, 119, ' + alpha + ')';
      this.context.beginPath();
      this.context.arc(x, y, size, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.restore();
  }
}

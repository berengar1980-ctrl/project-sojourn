import type { ShipHardpoints } from '../../core/ship-types';
import {
  activeManeuverThrusterBursts,
  type ManeuverDemand,
} from '../../systems/ships/ship-maneuver-thrusters';
import { projectHardpoint, type ShipScreenGeometry } from './ship-hardpoint-projector';
import { ThrusterGlowRenderer } from './thruster-glow-renderer';

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class ShipManeuverEffectsRenderer {
  private readonly glow = new ThrusterGlowRenderer();

  drawExhaust(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    demand: ManeuverDemand,
    timeSeconds: number
  ): void {
    const bursts = activeManeuverThrusterBursts(source, demand, timeSeconds);
    for (const burst of bursts) {
      const thruster = source.maneuverThrusters.find((candidate) => candidate.id === burst.id);
      if (!thruster) continue;
      this.drawThruster(context, source, geometry, thruster, burst.intensity, timeSeconds);
    }
  }

  drawGlow(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    demand: ManeuverDemand,
    timeSeconds: number
  ): void {
    const bursts = activeManeuverThrusterBursts(source, demand, timeSeconds);
    for (const burst of bursts) {
      const thruster = source.maneuverThrusters.find((candidate) => candidate.id === burst.id);
      if (!thruster) continue;

      const nozzle = projectHardpoint(thruster, source, geometry);
      const flicker =
        0.84 +
        Math.sin(timeSeconds * 31 + (hashId(thruster.id) % 11)) * 0.12 +
        Math.sin(timeSeconds * 53 + (hashId(thruster.id) % 7)) * 0.04;
      const nozzleWidth = Math.max(1.5, (thruster.width / source.sourceWidth) * geometry.width);

      this.glow.draw(context, {
        center: nozzle,
        radius: nozzleWidth * 2.7,
        intensity: 0.4 + burst.intensity * 0.6,
        flicker,
        warmth: 0.08,
      });
    }
  }

  draw(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    demand: ManeuverDemand,
    timeSeconds: number
  ): void {
    this.drawExhaust(context, source, geometry, demand, timeSeconds);
    this.drawGlow(context, source, geometry, demand, timeSeconds);
  }

  private drawThruster(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    thruster: ShipHardpoints['maneuverThrusters'][number],
    intensity: number,
    timeSeconds: number
  ): void {
    const nozzle = projectHardpoint(thruster, source, geometry);
    const exhaustLocal = {
      x: -thruster.forceX,
      y: -thruster.forceY,
    };
    const exhaustWorld = {
      x: exhaustLocal.x * Math.cos(geometry.angle) - exhaustLocal.y * Math.sin(geometry.angle),
      y: exhaustLocal.x * Math.sin(geometry.angle) + exhaustLocal.y * Math.cos(geometry.angle),
    };
    const flicker =
      0.84 +
      Math.sin(timeSeconds * 31 + (hashId(thruster.id) % 11)) * 0.12 +
      Math.sin(timeSeconds * 53 + (hashId(thruster.id) % 7)) * 0.04;
    const nozzleWidth = Math.max(1.5, (thruster.width / source.sourceWidth) * geometry.width);
    const length = nozzleWidth * (1.5 + intensity * 1.8) * flicker;
    const tail = {
      x: nozzle.x + exhaustWorld.x * length,
      y: nozzle.y + exhaustWorld.y * length,
    };

    context.save();
    context.lineCap = 'round';
    context.shadowColor = 'rgba(177, 229, 255, .95)';
    context.shadowBlur = 4 + intensity * 5;
    context.strokeStyle = 'rgba(213, 244, 255, ' + (0.55 + intensity * 0.4) + ')';
    context.lineWidth = Math.max(1, nozzleWidth * 0.72);
    context.beginPath();
    context.moveTo(nozzle.x, nozzle.y);
    context.lineTo(tail.x, tail.y);
    context.stroke();

    context.strokeStyle = 'rgba(114, 190, 255, ' + (0.2 + intensity * 0.35) + ')';
    context.lineWidth = Math.max(1, nozzleWidth * 1.35);
    context.beginPath();
    context.moveTo(nozzle.x, nozzle.y);
    context.lineTo(
      nozzle.x + exhaustWorld.x * length * 0.72,
      nozzle.y + exhaustWorld.y * length * 0.72
    );
    context.stroke();
    context.restore();
  }
}

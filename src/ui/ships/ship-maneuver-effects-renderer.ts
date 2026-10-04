import type { ShipHardpoints, ShipManeuverThruster } from '../../core/ship-types';
import { projectHardpoint, type ShipScreenGeometry } from './ship-hardpoint-projector';
import { ThrusterGlowRenderer } from './thruster-glow-renderer';

interface ManeuverDemand {
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
}

function torqueSign(thruster: ShipManeuverThruster, source: ShipHardpoints): number {
  const leverX = thruster.x - source.pivot.x;
  const leverY = thruster.y - source.pivot.y;
  const torque = leverX * thruster.forceY - leverY * thruster.forceX;
  return Math.sign(torque);
}

function demandForThruster(
  thruster: ShipManeuverThruster,
  source: ShipHardpoints,
  demand: ManeuverDemand
): number {
  const turnCommand =
    Math.abs(demand.angularThrust) > 0.02
      ? demand.angularThrust
      : demand.turnRateRadiansPerSecond / 1.15;
  const turnSign = Math.sign(turnCommand);
  const lateralSign = Math.sign(demand.lateralThrust);
  let intensity = 0;

  if (turnSign !== 0 && torqueSign(thruster, source) === turnSign) {
    intensity = Math.max(intensity, Math.min(1, Math.abs(turnCommand)));
  }

  if (lateralSign !== 0 && Math.sign(thruster.forceY) === lateralSign) {
    intensity = Math.max(intensity, Math.min(1, Math.abs(demand.lateralThrust)));
  }

  return intensity;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shouldBurst(id: string, intensity: number, timeSeconds: number): boolean {
  if (intensity >= 0.72) return true;

  const phase = hashId(id) % 17;
  const pulse = Math.sin(timeSeconds * (13 + intensity * 8) + phase);
  if (intensity < 0.32) return pulse > 0.72;
  return pulse > 0.15;
}

export class ShipManeuverEffectsRenderer {
  private readonly glow = new ThrusterGlowRenderer();

  draw(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    demand: ManeuverDemand,
    timeSeconds: number
  ): void {
    for (const thruster of source.maneuverThrusters) {
      const intensity = demandForThruster(thruster, source, demand);
      if (intensity <= 0.03 || !shouldBurst(thruster.id, intensity, timeSeconds)) continue;
      this.drawThruster(context, source, geometry, thruster, intensity, timeSeconds);
    }
  }

  private drawThruster(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry,
    thruster: ShipManeuverThruster,
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
    const flicker = 0.9 + Math.sin(timeSeconds * 31 + (hashId(thruster.id) % 11)) * 0.1;
    const nozzleWidth = Math.max(1.5, (thruster.width / source.sourceWidth) * geometry.width);
    const length = nozzleWidth * (1.5 + intensity * 1.8) * flicker;
    const tail = {
      x: nozzle.x + exhaustWorld.x * length,
      y: nozzle.y + exhaustWorld.y * length,
    };

    this.glow.draw(context, {
      center: nozzle,
      radius: nozzleWidth * 1.9,
      intensity: 0.32 + intensity * 0.68,
      flicker,
      warmth: 0.08,
    });

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

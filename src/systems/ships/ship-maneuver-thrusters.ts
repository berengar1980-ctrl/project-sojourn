import type { ShipHardpoints, ShipManeuverThruster } from '../../core/ship-types';

const REVERSE_REFERENCE_SPEED = 18;

export interface ManeuverDemand {
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly longitudinalThrust: number;
}

export interface ManeuverThrusterBurst {
  readonly id: string;
  readonly intensity: number;
}

function torqueSign(thruster: ShipManeuverThruster, source: ShipHardpoints): number {
  const leverX = thruster.x - source.pivot.x;
  const leverY = thruster.y - source.pivot.y;
  const torque = leverX * thruster.forceY - leverY * thruster.forceX;
  return Math.sign(torque);
}

function isAxialThruster(thruster: ShipManeuverThruster): boolean {
  return Math.abs(thruster.forceX) > Math.abs(thruster.forceY);
}

export function longitudinalManeuverDemand(speed: number): number {
  if (speed >= -0.5) return 0;
  return Math.max(-1, Math.min(0, speed / REVERSE_REFERENCE_SPEED));
}

function demandForThruster(
  thruster: ShipManeuverThruster,
  source: ShipHardpoints,
  demand: ManeuverDemand
): number {
  if (isAxialThruster(thruster)) {
    const longitudinalSign = Math.sign(demand.longitudinalThrust);
    if (longitudinalSign !== 0 && Math.sign(thruster.forceX) === longitudinalSign) {
      return Math.min(1, Math.abs(demand.longitudinalThrust));
    }
    return 0;
  }

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

export function activeManeuverThrusterBursts(
  source: ShipHardpoints,
  demand: ManeuverDemand,
  timeSeconds: number
): readonly ManeuverThrusterBurst[] {
  return source.maneuverThrusters.flatMap((thruster) => {
    const intensity = demandForThruster(thruster, source, demand);
    if (intensity <= 0.03 || !shouldBurst(thruster.id, intensity, timeSeconds)) return [];
    return [{ id: thruster.id, intensity }];
  });
}

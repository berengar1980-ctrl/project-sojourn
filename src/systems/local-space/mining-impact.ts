import type { LocalAsteroid, LocalShipState, MiningImpact } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';

function rotate(point: WorldPoint, angle: number): WorldPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function averageEmitterOffset(hardpoints: ShipHardpoints, nominalLengthMeters: number): WorldPoint {
  if (hardpoints.miningLasers.length === 0) return { x: 0, y: 0 };

  const scale = nominalLengthMeters / hardpoints.sourceWidth;
  let x = 0;
  let y = 0;

  for (const hardpoint of hardpoints.miningLasers) {
    x += (hardpoint.x - hardpoints.pivot.x) * scale;
    y += (hardpoint.y - hardpoints.pivot.y) * scale;
  }

  return {
    x: x / hardpoints.miningLasers.length,
    y: y / hardpoints.miningLasers.length,
  };
}

export function calculateMiningImpact(
  ship: LocalShipState,
  asteroid: LocalAsteroid,
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): MiningImpact {
  const emitterOffset = rotate(
    averageEmitterOffset(hardpoints, nominalLengthMeters),
    ship.headingRadians
  );
  const emitter = {
    x: ship.position.x + emitterOffset.x,
    y: ship.position.y + emitterOffset.y,
  };
  const towardCenter = {
    x: asteroid.position.x - emitter.x,
    y: asteroid.position.y - emitter.y,
  };
  const length = Math.max(0.001, Math.hypot(towardCenter.x, towardCenter.y));
  const direction = {
    x: towardCenter.x / length,
    y: towardCenter.y / length,
  };

  return {
    point: {
      x: asteroid.position.x - direction.x * asteroid.radius,
      y: asteroid.position.y - direction.y * asteroid.radius,
    },
    normal: {
      x: -direction.x,
      y: -direction.y,
    },
  };
}

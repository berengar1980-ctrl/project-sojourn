import type { LocalAsteroid, LocalShipState, MiningChunk } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { calculateMiningImpact } from './mining-impact';

function heading(from: WorldPoint, to: WorldPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function createMiningChunk(
  asteroid: LocalAsteroid,
  ship: LocalShipState,
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number,
  seed: number,
  chunkCounter: number
): MiningChunk | null {
  if (!asteroid.resourceId || asteroid.oreRemaining <= 0) return null;

  const impact = calculateMiningImpact(ship, asteroid, hardpoints, nominalLengthMeters);
  const amount = Math.min(6, asteroid.oreRemaining);
  asteroid.oreRemaining -= amount;

  const tangent = { x: -impact.normal.y, y: impact.normal.x };
  const spread = Math.sin(chunkCounter * 2.17) * 0.42;
  const speed = 24 + (chunkCounter % 4) * 4;
  const direction = {
    x: impact.normal.x + tangent.x * spread,
    y: impact.normal.y + tangent.y * spread,
  };
  const directionLength = Math.max(0.001, Math.hypot(direction.x, direction.y));

  return {
    id: 'chunk-' + seed + '-' + chunkCounter,
    resourceId: asteroid.resourceId,
    position: {
      x: impact.point.x + impact.normal.x * 2,
      y: impact.point.y + impact.normal.y * 2,
    },
    velocity: {
      x: (direction.x / directionLength) * speed,
      y: (direction.y / directionLength) * speed,
    },
    amount,
    ageSeconds: 0,
    tractorActive: false,
  };
}

export function advanceMiningChunk(
  chunk: MiningChunk,
  shipPosition: WorldPoint,
  deltaSeconds: number
): void {
  chunk.ageSeconds += deltaSeconds;
  if (chunk.ageSeconds > 0.42) chunk.tractorActive = true;

  if (chunk.tractorActive) {
    const angle = heading(chunk.position, shipPosition);
    chunk.velocity = {
      x: Math.cos(angle) * 190,
      y: Math.sin(angle) * 190,
    };
  }

  chunk.position = {
    x: chunk.position.x + chunk.velocity.x * deltaSeconds,
    y: chunk.position.y + chunk.velocity.y * deltaSeconds,
  };
}

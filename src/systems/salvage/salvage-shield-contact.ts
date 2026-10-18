import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { createLocalSpaceShipSystems } from '../local-space/local-space-ship-systems';

export function applySalvageShieldContact(
  shields: ReturnType<typeof createLocalSpaceShipSystems>,
  ship: LocalShipState,
  normal: WorldPoint,
  overlap: number,
  shipLengthMeters: number
): void {
  const cos = Math.cos(ship.headingRadians);
  const sin = Math.sin(ship.headingRadians);
  const local = { x: normal.x * cos + normal.y * sin, y: -normal.x * sin + normal.y * cos };
  const scale = 0.4 * shipLengthMeters;
  const contactPoint = {
    x: ship.position.x + normal.x * scale,
    y: ship.position.y + normal.y * scale,
  };
  const kineticEnergy = 3500 + Math.min(15000, overlap * 650);
  shields.applyCollision({
    asteroidId: 'npc-contact',
    point: contactPoint,
    normal,
    surfaceAnchor: local,
    mass: 350,
    impactSpeed: Math.sqrt((2 * kineticEnergy) / 350),
    kineticEnergy,
  });
}

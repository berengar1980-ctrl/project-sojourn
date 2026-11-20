import { AsteroidSecurityDrone } from '../operations/asteroid-security-drone';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { DRONE_SHIELD_RADIUS_METERS } from '../operations/security-drone-debris-contact';

export interface FleetDroneContact {
  readonly id: string;
  readonly factionId: string;
  readonly position: WorldPoint;
  readonly operational: boolean;
}

export interface FleetDroneInterceptSnapshot {
  readonly targetId: string | null;
  readonly position: WorldPoint;
  readonly detectedPirateIds: readonly string[];
  readonly inAttackRange: boolean;
}

export interface FleetDroneInterceptor {
  tick(
    dt: number,
    contacts: readonly FleetDroneContact[],
    nearbyShips?: readonly FieldRouteObstacle[]
  ): FleetDroneInterceptSnapshot;
  snapshot(): FleetDroneInterceptSnapshot;
}

/**
 * Drone pursuit uses the SAME AsteroidSecurityDrone authority and its
 * occlusion-tested detect() and obstacle-aware tick() used in career.
 * This adapter only assigns targets and reports physical approach.
 * Combat entry/damage are intentionally separate, not a fabricated hull.
 */
export function createFleetDroneInterceptor(
  drone: AsteroidSecurityDrone,
  asteroids: readonly LocalAsteroid[],
  attackRangeMeters = 110
): FleetDroneInterceptor {
  if (!Number.isFinite(attackRangeMeters) || attackRangeMeters <= DRONE_SHIELD_RADIUS_METERS)
    throw new Error('Invalid drone combat engagement range');
  let selected: string | null = null;
  let detectedPirateIds: string[] = [];
  let inAttackRange = false;
  const snapshot = (): FleetDroneInterceptSnapshot => ({
    targetId: selected,
    position: { ...drone.position },
    detectedPirateIds: [...detectedPirateIds],
    inAttackRange,
  });
  return {
    snapshot,
    tick(dt, contacts, nearbyShips = []) {
      if (!Number.isFinite(dt) || dt <= 0) return snapshot();
      const pirates = contacts
        .filter(
          (ship) =>
            ship.operational &&
            (ship.factionId === 'pirate-a' || ship.factionId === 'pirate-b') &&
            drone.detect(ship.position, asteroids)
        )
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - drone.position.x, a.position.y - drone.position.y) -
              Math.hypot(b.position.x - drone.position.x, b.position.y - drone.position.y) ||
            a.id.localeCompare(b.id)
        );
      detectedPirateIds = pirates.map((ship) => ship.id);
      const current = pirates.find((ship) => ship.id === selected);
      const target = current ?? pirates[0] ?? null;
      selected = target?.id ?? null;
      // Only genuine physical movement: the drone approaches its detected
      // pirate through career field-routing and obstacle response.
      drone.tick(dt, asteroids, [], nearbyShips, target?.position);
      inAttackRange = !!target &&
        Math.hypot(target.position.x - drone.position.x, target.position.y - drone.position.y) <=
          attackRangeMeters;
      return snapshot();
    },
  };
}

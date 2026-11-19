import type { LocalAsteroid } from '../core/local-space-types';
import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';

/** Deterministic patrol markers independent of destructible wrecks and loot. */
function salvagePatrolMarkers(field: SalvageField): readonly LocalAsteroid[] {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 8;
    return {
      id: 'salvage-patrol-' + index,
      kind: 'resource',
      position: {
        x: field.width * (0.5 + Math.cos(angle) * 0.28),
        y: field.height * (0.5 + Math.sin(angle) * 0.28),
      },
      radius: 10,
      routeBlocking: false,
    } as LocalAsteroid;
  });
}

/** Adapt genuine physical wreck geometry to the shared local-route planner. */
function wreckObstacles(field: SalvageField): readonly LocalAsteroid[] {
  const solids = [
    ...field.wrecks.map((wreck) => ({
      id: wreck.id,
      position: wreck.position,
      radius: wreck.radius,
    })),
    ...(field.sections ?? []).map((section) => ({
      id: section.id,
      position: section.position,
      radius: section.radius,
    })),
  ];
  return solids.map((solid) => ({
    ...solid,
    kind: 'debris',
    collisionRadius: solid.radius,
    routeBlocking: true,
  })) as unknown as LocalAsteroid[];
}

export function createSalvageSecurityDrone(
  field: SalvageField,
  claims: WreckClaimRegistry
): AsteroidSecurityDrone {
  const markers = salvagePatrolMarkers(field);
  const checkpoint = claims.droneCheckpoint(field.sourceLocationId);
  return checkpoint
    ? AsteroidSecurityDrone.fromCheckpoint(field.width, field.height, markers, checkpoint)
    : new AsteroidSecurityDrone(field.width, field.height, markers);
}

export function tickSalvageSecurityDrone(
  drone: AsteroidSecurityDrone,
  field: SalvageField,
  seconds: number,
  ships: readonly FieldRouteObstacle[]
): void {
  drone.tick(seconds, wreckObstacles(field), [], ships);
}

export function salvageDroneShipObstacles(
  ships: readonly { readonly id: string; readonly position: WorldPoint; readonly radius: number }[],
  playerPosition: WorldPoint,
  playerRadius: number
): readonly FieldRouteObstacle[] {
  return [
    ...ships.map((ship) => ({
      id: ship.id,
      position: ship.position,
      radius: ship.radius,
    })),
    { id: 'player', position: playerPosition, radius: playerRadius },
  ];
}

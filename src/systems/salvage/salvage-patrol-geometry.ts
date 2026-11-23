import type { LocalAsteroid } from '../../core/local-space-types';
import type { SalvageField } from '../../core/salvage-types';

/** Deterministic patrol markers independent of destructible wrecks and loot. */
export function salvagePatrolMarkers(field: SalvageField): readonly LocalAsteroid[] {
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
export function salvageDroneObstacleAsteroids(field: SalvageField): readonly LocalAsteroid[] {
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

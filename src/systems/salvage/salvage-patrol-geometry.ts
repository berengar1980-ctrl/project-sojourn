import { salvageFieldPhysicsBodies } from './salvage-container-motion';
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
  const moving = salvageFieldPhysicsBodies(field);
  const movingIds = new Set(moving.map((body) => body.id));
  return [
    ...moving,
    ...field.wrecks
      .filter((wreck) => !movingIds.has(wreck.id))
      .map((wreck) => ({
        id: wreck.id,
        position: wreck.position,
        radius: wreck.radius,
        rotation: wreck.rotation,
        kind: 'resource' as const,
        routeBlocking: true,
        physics: {
          mass: Infinity,
          momentOfInertia: Infinity,
          centerOfMassOffset: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          angularVelocity: 0,
        },
        deposits: [],
        scanLevel: 'unscanned' as const,
      })),
  ];
}

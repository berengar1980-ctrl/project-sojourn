import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { longRangeScanRadius } from '../scanning/scanner-service';
import type { ShieldWorldGeometry } from './local-space-collision';
import type { RoutePlanningOptions } from './local-space-navigation';

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function selectedAsteroid(
  instance: LocalSpaceInstance,
  selectedId: string | null
): LocalAsteroid | null {
  if (!selectedId) return null;
  return instance.asteroids.find((asteroid) => asteroid.id === selectedId) ?? null;
}

export function selectedRouteOptions(
  instance: LocalSpaceInstance,
  selectedId: string | null,
  shield: ShieldWorldGeometry
): RoutePlanningOptions | null {
  const target = selectedAsteroid(instance, selectedId);
  if (!target) return null;

  return {
    start: instance.ship.position,
    target,
    asteroids: instance.asteroids,
    clearance: Math.max(shield.radiusX, shield.radiusY) + 24,
    width: instance.width,
    height: instance.height,
  };
}

export function runLongRangeAsteroidScan(
  instance: LocalSpaceInstance,
  sensorModifier: number,
  crewSkill: number
): void {
  const radius = longRangeScanRadius({ sensorModifier, crewSkill });

  for (const asteroid of instance.asteroids) {
    if (asteroid.kind !== 'resource') continue;
    if (distance(instance.ship.position, asteroid.position) > radius) continue;
    if (asteroid.scanLevel === 'unscanned') asteroid.scanLevel = 'surveyed';
  }
}

import type { FieldRouteState } from '../navigation/field-ship-routing';
import type { WorldPoint } from '../../core/world-types';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface SecurityDroneCheckpoint {
  readonly version: 1;
  readonly position: WorldPoint;
  readonly routeState?: FieldRouteState;
  readonly scanRadius: number;
  readonly operational: boolean;
  readonly nextWaypoint: number;
  readonly patrolSize: number;
  readonly observed: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validNumber(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

/** All checks run before applying a saved state to a newly constructed drone. */
export function stageSecurityDroneCheckpoint(
  candidate: unknown,
  scanRadius: number,
  patrolSize: number
): SecurityDroneCheckpoint {
  const value = cloneCareerJson(candidate);
  if (!record(value) || value.version !== 1) {
    throw new Error('Unbekannte Drohnen-Spielstandversion.');
  }
  const point = value.position;
  if (!record(point) || !validNumber(point.x, -Infinity) || !validNumber(point.y, -Infinity)) {
    throw new Error('Ungültige Drohnenposition.');
  }
  if (value.routeState !== undefined) {
    const route = value.routeState;
    if (
      !record(route) ||
      !record(route.target) ||
      !validNumber(route.target.x, -Infinity) ||
      !validNumber(route.target.y, -Infinity) ||
      !Array.isArray(route.points) ||
      !route.points.length ||
      !route.points.every(
        (entry: unknown) =>
          record(entry) &&
          validNumber(entry.x, -Infinity) &&
          validNumber(entry.y, -Infinity)
      ) ||
      !Number.isInteger(route.index) ||
      (route.index as number) < 0 ||
      (route.index as number) >= route.points.length
    ) {
      throw new Error('Ungültige gespeicherte Drohnenroute.');
    }
  }
  if (value.scanRadius !== scanRadius || value.patrolSize !== patrolSize) {
    throw new Error('Drohnen-Checkpoint passt nicht zur Asteroidenkarte.');
  }
  if (!validNumber(value.nextWaypoint) || !Number.isInteger(value.nextWaypoint)) {
    throw new Error('Ungültiger Drohnen-Wegpunkt.');
  }
  if ((value.nextWaypoint as number) >= patrolSize || typeof value.operational !== 'boolean') {
    throw new Error('Ungültiger Drohnenzustand.');
  }
  if (!Array.isArray(value.observed) || value.observed.length > 10000) {
    throw new Error('Ungültige Drohnen-Beobachtungen.');
  }
  if (!value.observed.every((entry) => typeof entry === 'string')) {
    throw new Error('Ungültige Drohnen-Beobachtungen.');
  }
  if (new Set(value.observed).size !== value.observed.length) {
    throw new Error('Doppelte Drohnen-Beobachtung.');
  }
  return value as unknown as SecurityDroneCheckpoint;
}

import type { WorldPoint } from '../../core/world-types';
import { squaredDistance } from '../../core/field-geometry';
import {
  shipTrafficObstacle,
  type FieldTrafficProvider,
} from '../navigation/field-traffic-obstacles';
import type { FieldRouteObstacle } from '../navigation/field-ship-routing';
import { getShipDefinition } from '../ships';

interface WorkerPose {
  readonly npcId: string;
  readonly shipId: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
}

function footprintsOverlap(first: FieldRouteObstacle, second: FieldRouteObstacle): boolean {
  return (
    squaredDistance(first.position, second.position) < (first.radius + second.radius + 2) ** 2
  );
}

/** Hold ordinary arrivals outside the local field until the shared gate is free.
 * Existing checkpoint/combat-return poses are never relocated by this check.
 */
export function workerGateAvailable(
  npcId: string,
  shipId: string,
  gate: WorldPoint,
  workers: readonly WorkerPose[],
  provider?: FieldTrafficProvider
): boolean {
  if (!provider) return true;
  const definition = getShipDefinition(shipId);
  if (!definition) return true;
  const entering = shipTrafficObstacle(npcId, definition, { position: gate, headingRadians: 0 });
  if (provider(npcId).some((other) => footprintsOverlap(entering, other))) return false;
  // During initial construction the field provider may not yet be bound.
  // Include the already materialized workers without relying on that binding.
  return workers.every((worker) => {
    if (worker.npcId === npcId) return true;
    const ship = getShipDefinition(worker.shipId);
    return !ship || !footprintsOverlap(entering, shipTrafficObstacle(worker.npcId, ship, worker));
  });
}

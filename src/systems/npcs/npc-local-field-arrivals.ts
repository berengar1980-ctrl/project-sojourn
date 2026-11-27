import type { WorldPoint } from '../../core/world-types';
import { contactCandidate, squaredDistance } from '../../core/field-geometry';
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

function gateBlocked(first: FieldRouteObstacle, second: FieldRouteObstacle): boolean {
  const dx = first.position.x - second.position.x;
  const dy = first.position.y - second.position.y;
  const reach = first.radius + second.radius + 2;
  if (squaredDistance(first.position, second.position) < reach ** 2) return true;
  const intent = second.intent;
  if (!intent || intent.priority < 2 || !intent.direction) return false;
  // Reserve only the short approach of an outbound ship heading toward this gate.
  return (
    contactCandidate(dx, dy, reach + 120) && dx * intent.direction.x + dy * intent.direction.y > 0
  );
}

/** Hold ordinary arrivals outside the local field until the shared gate is free.
 * Existing checkpoint/combat-return poses are never relocated by this check.
 */
export function fieldGateAvailable(
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
  if (provider(npcId).some((other) => gateBlocked(entering, other))) return false;
  // During initial construction the field provider may not yet be bound.
  // Include the already materialized workers without relying on that binding.
  return workers.every((worker) => {
    if (worker.npcId === npcId) return true;
    const ship = getShipDefinition(worker.shipId);
    return !ship || !gateBlocked(entering, shipTrafficObstacle(worker.npcId, ship, worker));
  });
}

// Existing worker call sites use the same admission policy.
export const workerGateAvailable = fieldGateAvailable;

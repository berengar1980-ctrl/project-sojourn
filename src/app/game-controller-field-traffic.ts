import type { SectorNpcState } from '../core/npc-types';
import type { ShipDefinition } from '../core/ship-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { shipTrafficObstacle } from '../systems/navigation/field-traffic-obstacles';
import { registerTrafficPose } from '../systems/navigation/field-traffic-priority';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { getShipDefinition } from '../systems/ships';

type TrafficPose = Parameters<typeof shipTrafficObstacle>[2];
type AddTraffic = (id: string, pose: TrafficPose) => void;
export type FieldTrafficSource = (add: AddTraffic) => void;

interface FieldPlayer {
  readonly ship: ShipDefinition;
  readonly pose: TrafficPose;
}

/** Query physically present bodies only; roster membership alone cannot supply a pose. */
export function collectFieldTraffic(
  locationId: string,
  byId: ReadonlyMap<string, SectorNpcState>,
  excludedId: string,
  visit: FieldTrafficSource,
  player?: FieldPlayer
): FieldRouteObstacle[] {
  const result: FieldRouteObstacle[] = [];
  const added = new Set<string>([excludedId]);
  visit((id, pose) => {
    const npc = byId.get(id);
    if (!npc || npc.hullHp <= 0 || npc.travel || npc.locationId !== locationId) return;
    registerTrafficPose(pose, id, Boolean(npc.combatMovement));
    if (added.has(id)) return;
    const ship = getShipDefinition(npc.shipId);
    if (!ship) return;
    added.add(id);
    result.push(shipTrafficObstacle(id, ship, pose));
  });
  if (player) registerTrafficPose(player.pose, 'player');
  if (player && !added.has('player')) {
    result.push(shipTrafficObstacle('player', player.ship, player.pose));
  }
  return result;
}

export function visitArmedFieldTraffic(
  locationId: string,
  pirates: LocalPirateTraffic | undefined,
  drone: AsteroidSecurityDrone,
  add: AddTraffic
): void {
  pirates?.visitBodies(add);
  if (drone.snapshot().operational) add('security-drone:' + locationId, drone);
}

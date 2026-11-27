import type { SectorNpcState } from '../core/npc-types';
import type { ShipDefinition } from '../core/ship-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import {
  bindFieldTraffic,
  shipTrafficObstacle,
} from '../systems/navigation/field-traffic-obstacles';
import type { StrategicCombatBystander } from '../systems/combat/strategic-combat-bystander-types';
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
  readonly fixed?: boolean;
}

interface FieldLiveShip {
  readonly id: string;
  readonly ship: ShipDefinition;
  readonly pose: TrafficPose;
}

/** One identity and presence filter for all field consumers. */
export function collectLiveFieldShips(
  locationId: string,
  byId: ReadonlyMap<string, SectorNpcState>,
  visit: FieldTrafficSource,
  player?: FieldPlayer,
  bounds?: { readonly width: number; readonly height: number }
): FieldLiveShip[] {
  const result: FieldLiveShip[] = [];
  const added = new Set<string>();
  visit((id, pose) => {
    const npc = byId.get(id);
    if (!npc || npc.hullHp <= 0 || npc.travel || npc.locationId !== locationId) return;
    registerTrafficPose(
      pose,
      id,
      Boolean(npc.combatMovement),
      bounds,
      npc.job === 'freighter' && !npc.pirate
    );
    if (added.has(id)) return;
    const ship = getShipDefinition(npc.shipId);
    if (!ship) return;
    added.add(id);
    result.push({ id, ship, pose });
  });
  if (player) registerTrafficPose(player.pose, 'player', player.fixed, bounds);
  if (player && !added.has('player')) {
    result.push({ id: 'player', ship: player.ship, pose: player.pose });
  }
  return result;
}

export function collectFieldTraffic(
  locationId: string,
  byId: ReadonlyMap<string, SectorNpcState>,
  excludedId: string,
  visit: FieldTrafficSource,
  player?: FieldPlayer,
  bounds?: { readonly width: number; readonly height: number }
): FieldRouteObstacle[] {
  return collectLiveFieldShips(locationId, byId, visit, player, bounds)
    .filter((entry) => entry.id !== excludedId)
    .map(({ id, ship, pose }) => shipTrafficObstacle(id, ship, pose));
}

const liveSources = new WeakMap<object, () => readonly FieldLiveShip[]>();

/** Both queries read authoritative poses on demand; no cached second positions. */
export function bindLiveFieldShips(
  field: object,
  source: () => readonly FieldLiveShip[]
): void {
  liveSources.set(field, source);
  bindFieldTraffic(field, (excludedId) =>
    source()
      .filter((entry) => entry.id !== excludedId)
      .map(({ id, ship, pose }) => shipTrafficObstacle(id, ship, pose))
  );
}

export function liveFieldBystanders(
  field: object,
  excludedId?: string
): readonly StrategicCombatBystander[] {
  return (liveSources.get(field)?.() ?? [])
    .filter((entry) => entry.id !== excludedId)
    .map(({ id, ship, pose }) => ({
      id,
      shipId: ship.id,
      position: { ...pose.position },
      headingRadians: pose.headingRadians,
    }));
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

import type { SectorNpcState } from '../core/npc-types';
import type { ShipDefinition } from '../core/ship-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import {
  bindFieldTraffic,
  shipTrafficObstacle,
} from '../systems/navigation/field-traffic-obstacles';
import type {
  FieldBystanderContact,
  FieldContactPose,
  StrategicCombatBystander,
} from '../systems/combat/strategic-combat-bystander-types';
import type { WorldPoint } from '../core/world-types';
import { registerTrafficPose } from '../systems/navigation/field-traffic-priority';
import type { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { getShipDefinition } from '../systems/ships';

type TrafficPose = FieldContactPose;
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
  readonly fixed: boolean;
  readonly bounds?: { readonly width: number; readonly height: number };
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
    result.push({ id, ship, pose, fixed: Boolean(npc.combatMovement), ...(bounds && { bounds }) });
  });
  if (player) registerTrafficPose(player.pose, 'player', player.fixed, bounds);
  if (player && !added.has('player')) {
    result.push({
      id: 'player',
      ship: player.ship,
      pose: player.pose,
      fixed: Boolean(player.fixed),
      ...(bounds && { bounds }),
    });
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
export function bindLiveFieldShips(field: object, source: () => readonly FieldLiveShip[]): void {
  liveSources.set(field, source);
  bindFieldTraffic(field, (excludedId) =>
    source()
      .filter((entry) => entry.id !== excludedId)
      .map(({ id, ship, pose }) => shipTrafficObstacle(id, ship, pose))
  );
}

function applyFieldContact(
  entry: FieldLiveShip,
  normal: WorldPoint,
  distance: number,
  velocityDelta: number
): number {
  const { pose, bounds } = entry;
  const before = pose.position;
  const x = before.x + normal.x * distance;
  const y = before.y + normal.y * distance;
  pose.position = bounds
    ? {
        x: Math.max(0, Math.min(bounds.width, x)),
        y: Math.max(0, Math.min(bounds.height, y)),
      }
    : { x, y };
  if (pose.speed !== undefined) {
    const alongBow =
      normal.x * Math.cos(pose.headingRadians) + normal.y * Math.sin(pose.headingRadians);
    pose.speed += velocityDelta * alongBow;
  }
  return Math.max(
    0,
    (pose.position.x - before.x) * normal.x + (pose.position.y - before.y) * normal.y
  );
}

function fieldContactHandle(field: object, entry: FieldLiveShip): FieldBystanderContact {
  return {
    pose: entry.pose,
    pushWeight: entry.id === 'player' ? 2.4 : 1,
    apply(normal, distance, velocityDelta) {
      const current = liveSources
        .get(field)?.()
        .find((ship) => ship.id === entry.id);
      if (!current || current.fixed || current.pose !== entry.pose) return null;
      return applyFieldContact(current, normal, distance, velocityDelta);
    },
  };
}

export function liveFieldBystanders(
  field: object,
  excludedId?: string
): readonly StrategicCombatBystander[] {
  return (liveSources.get(field)?.() ?? [])
    .filter((entry) => entry.id !== excludedId)
    .map((entry) => ({
      id: entry.id,
      shipId: entry.ship.id,
      position: { ...entry.pose.position },
      headingRadians: entry.pose.headingRadians,
      ...(!entry.fixed && { fieldContact: fieldContactHandle(field, entry) }),
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

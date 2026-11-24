import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { StrategicCombatBystander } from '../systems/combat/strategic-combat-bystander-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { LocalPirateContact } from '../systems/npcs/npc-local-pirate-service';
import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';

import {
  salvageDroneObstacleAsteroids,
  salvagePatrolMarkers,
} from '../systems/salvage/salvage-patrol-geometry';
export { salvageDroneObstacleAsteroids } from '../systems/salvage/salvage-patrol-geometry';

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
  ships: readonly FieldRouteObstacle[],
  pursuitTarget?: WorldPoint
): void {
  drone.tick(seconds, salvageDroneObstacleAsteroids(field), [], ships, pursuitTarget);
}

/** The same solid wrecks that constrain routing also occlude a drone scan. */
export function salvageDroneCanSee(
  drone: AsteroidSecurityDrone,
  field: SalvageField,
  position: WorldPoint
): boolean {
  return drone.detect(position, salvageDroneObstacleAsteroids(field));
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

/** Keep all non-fighting local ships solid in the common PvP collision solver. */
export function salvageDroneBystanders(
  combat: StrategicCombatSnapshot | null,
  ships: NpcLocalSalvageService['ships'],
  drone: AsteroidSecurityDrone,
  locationId: string,
  pirates: readonly LocalPirateContact[] = []
): readonly StrategicCombatBystander[] {
  const excluded = new Set(combat ? [combat.attacker.id, combat.defender.id] : []);
  return [
    ...ships
      .filter((ship) => !excluded.has(ship.npcId))
      .map((ship) => ({
        id: ship.npcId,
        shipId: ship.shipId,
        position: { ...ship.position },
        headingRadians: ship.headingRadians,
      })),
    ...pirates
      .filter((ship) => !excluded.has(ship.npcId))
      .map((ship) => ({
        id: ship.npcId,
        shipId: ship.shipId,
        position: { ...ship.position },
        headingRadians: ship.headingRadians,
      })),
    ...(!drone.snapshot().operational || excluded.has('security-drone:' + locationId)
      ? []
      : [
          {
            id: 'security-drone:' + locationId,
            shipId: '24m-security-drone',
            position: drone.snapshot().position,
            headingRadians: drone.headingRadians,
          },
        ]),
  ];
}

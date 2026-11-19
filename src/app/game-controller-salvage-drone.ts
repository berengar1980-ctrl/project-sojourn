import type { LocalAsteroid } from '../core/local-space-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { StrategicCombatBystander } from '../systems/combat/strategic-combat-bystander-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { LocalPirateContact } from '../systems/npcs/npc-local-pirate-service';
import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';

/** Deterministic patrol markers independent of destructible wrecks and loot. */
function salvagePatrolMarkers(field: SalvageField): readonly LocalAsteroid[] {
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
  combat: StrategicCombatSnapshot,
  ships: NpcLocalSalvageService['ships'],
  drone: AsteroidSecurityDrone,
  locationId: string,
  pirates: readonly LocalPirateContact[] = []
): readonly StrategicCombatBystander[] {
  const excluded = new Set([combat.attacker.id, combat.defender.id]);
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
    {
      id: 'security-drone:' + locationId,
      shipId: '24m-security-drone',
      position: drone.snapshot().position,
      headingRadians: drone.headingRadians,
    },
  ];
}

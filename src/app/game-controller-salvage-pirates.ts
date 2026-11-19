import type { SectorNpcState } from '../core/npc-types';
import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import {
  salvageDroneCanSee,
  salvageDroneObstacleAsteroids,
  salvageDroneShipObstacles,
  tickSalvageSecurityDrone,
} from './game-controller-salvage-drone';

export interface SalvagePirateResponseOptions {
  readonly field: SalvageField;
  readonly drone: AsteroidSecurityDrone;
  readonly pirates: LocalPirateTraffic;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly salvagers: NpcLocalSalvageService['ships'];
  readonly playerPosition: WorldPoint;
  readonly playerRadius: number;
  readonly dt: number;
  readonly playerCombat: StrategicCombatSnapshot | null;
  readonly npcCombats?: readonly StrategicCombatSnapshot[];
  readonly onPirateAttack?: (
    pirateId: string,
    targetId: string,
    piratePosition: WorldPoint,
    targetPosition: WorldPoint
  ) => boolean;
  readonly onDroneAttack?: (pirateId: string, piratePosition: WorldPoint) => boolean;
}

/** Only duel owners advance live combatants. Mirror their positions into the
 * salvage layer and let the drone attack independent free pirates.
 */
export function advanceSalvagePirateResponse(options: SalvagePirateResponseOptions): void {
  const { field, drone, pirates, sectorNpcs, salvagers } = options;
  const livePirates = sectorNpcs.filter(
    (npc) => npc.pirate && npc.locationId === field.sourceLocationId && npc.hullHp > 0
  );
  pirates.reconcile(livePirates);
  const combatants = new Set<string>();
  for (const duel of options.npcCombats ?? []) {
    for (const ship of [duel.attacker, duel.defender]) {
      const npc = sectorNpcs.find((entry) => entry.id === ship.id);
      if (npc?.locationId !== field.sourceLocationId) continue;
      combatants.add(npc.id);
      pirates.syncCombatPose(npc.id, ship.position, ship.headingRadians);
      salvagers.forEach((salvager) => {
        if (salvager.npcId === npc.id)
          salvager.position = { ...ship.position };
      });
      if (npc.id === 'security-drone:' + field.sourceLocationId) {
        drone.restore(ship.position, ship.hullHp > 0);
        drone.headingRadians = ship.headingRadians;
      }
    }
  }
  const defender = sectorNpcs.find(
    (npc) => npc.id === 'security-drone:' + field.sourceLocationId
  );
  if (defender && defender.hullHp <= 0) drone.destroy();

  const pirateShips = pirates.snapshot(sectorNpcs);
  const free = pirateShips
    .filter((pirate) => salvageDroneCanSee(drone, field, pirate.position))
    .sort((a, b) => {
      const pos = drone.position;
      return (
        Math.hypot(pos.x - a.position.x, pos.y - a.position.y) -
        Math.hypot(pos.x - b.position.x, pos.y - b.position.y)
      );
    });
  const target = free[0];
  const defenderBusy = Boolean(defender?.combatMovement || combatants.has(defender?.id ?? ''));
  let pursuit: WorldPoint | undefined;
  if (target && !defenderBusy) {
    const dx = drone.position.x - target.position.x;
    const dy = drone.position.y - target.position.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    pursuit = {
      x: target.position.x + (dx / length) * 125,
      y: target.position.y + (dy / length) * 125,
    };
  }
  const obstacles = salvageDroneShipObstacles(
    [
      ...salvagers.map((ship) => ({ id: ship.npcId, position: ship.position, radius: 35 })),
      ...pirateShips.map((ship) => ({ id: ship.npcId, position: ship.position, radius: 35 })),
    ],
    options.playerPosition,
    options.playerRadius
  );
  if (!defenderBusy) tickSalvageSecurityDrone(drone, field, options.dt, obstacles, pursuit);

  if (target && defender && defender.hullHp > 0 && !defenderBusy) {
    const npc = sectorNpcs.find((entry) => entry.id === target.npcId);
    if (
      npc &&
      !npc.combatMovement &&
      !(npc.combatRecoverySeconds && npc.combatRecoverySeconds > 0) &&
      Math.hypot(drone.position.x - target.position.x, drone.position.y - target.position.y) <= 145
    )
      options.onDroneAttack?.(npc.id, target.position);
  }

  pirates.tick(
    options.dt,
    livePirates,
    options.playerCombat ? null : options.playerPosition,
    salvagers.map((ship) => ({
      npcId: ship.npcId,
      position: ship.position,
      inCombat: combatants.has(ship.npcId),
    })),
    salvageDroneObstacleAsteroids(field),
    (pirateId, targetId, position) => {
      const targetPosition = targetId === 'player'
        ? options.playerPosition
        : salvagers.find((ship) => ship.npcId === targetId)?.position;
      return targetPosition
        ? options.onPirateAttack?.(pirateId, targetId, position, targetPosition) ?? false
        : false;
    },
    options.playerCombat?.defender.id
  );
}

import { pirateHuntAllowedAt } from '../systems/npcs/npc-pirate-classes';
import { narrowsSector } from '../data/maps/narrows-sector';
import type { LocalShieldShipBody } from '../systems/local-space/ship-shield-collision';
import { getShipDefinition } from '../systems/ships';
import { fieldTrafficProvider } from '../systems/navigation/field-traffic-obstacles';
import { syncSalvagePhysicsContacts } from '../systems/salvage/salvage-container-motion';
import { securityPirateApproach } from '../systems/operations/asteroid-security-drone';
import { fieldInterceptRange, localArmedTraffic } from '../systems/npcs/npc-combat-ai';
import type { SectorNpcState } from '../core/npc-types';
import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type {
  LocalPirateTraffic,
  LocalPirateContact,
} from '../systems/npcs/npc-local-pirate-service';
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
  readonly playerPosition: WorldPoint | null;
  readonly playerRadius: number;
  readonly playerBody?: LocalShieldShipBody;
  readonly onFreighterExit?: (npc: SectorNpcState) => void;
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

function mirrorSalvageDuels(options: SalvagePirateResponseOptions): Set<string> {
  const { field, drone, pirates, salvagers, sectorNpcs } = options;
  const combatants = new Set<string>();
  for (const duel of [
    ...(options.npcCombats ?? []),
    ...(options.playerCombat ? [options.playerCombat] : []),
  ]) {
    for (const ship of [duel.attacker, duel.defender]) {
      const npc = sectorNpcs.find((entry) => entry.id === ship.id);
      if (npc?.locationId !== field.sourceLocationId) continue;
      if (ship.hullHp <= 0) continue;
      combatants.add(npc.id);
      pirates.syncCombatPose(npc.id, ship.position, ship.headingRadians, ship.speed);
      for (const salvager of salvagers) {
        if (salvager.npcId === npc.id) {
          salvager.position = { ...ship.position };
          salvager.headingRadians = ship.headingRadians;
          salvager.speed = ship.speed;
          delete salvager.routeState;
        }
      }
      if (npc.id === 'security-drone:' + field.sourceLocationId) {
        drone.syncCombatPose(ship.position, ship.headingRadians, ship.speed, ship.hullHp > 0);
      }
    }
  }
  return combatants;
}

function closestVisiblePirate(
  options: SalvagePirateResponseOptions,
  pirateShips: readonly LocalPirateContact[]
): LocalPirateContact | null {
  const dronePosition = options.drone.position;
  return (
    pirateShips
      .filter((pirate) => {
        const npc = options.sectorNpcs.find((entry) => entry.id === pirate.npcId);
        return Boolean(
          npc &&
          !npc.combatMovement &&
          (npc.combatRecoverySeconds ?? 0) <= 0 &&
          salvageDroneCanSee(options.drone, options.field, pirate.position)
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - dronePosition.x, a.position.y - dronePosition.y) -
          Math.hypot(b.position.x - dronePosition.x, b.position.y - dronePosition.y)
      )[0] ?? null
  );
}

function salvageInterceptionObstacles(options: SalvagePirateResponseOptions) {
  const { field, sectorNpcs, salvagers } = options;
  return (
    fieldTrafficProvider(field)?.('security-drone:' + field.sourceLocationId) ??
    salvageDroneShipObstacles(
      [
        ...salvagers.map((ship) => ({ id: ship.npcId, position: ship.position, radius: 35 })),
        ...options.pirates
          .snapshot(sectorNpcs)
          .map((ship) => ({ id: ship.npcId, position: ship.position, radius: 35 })),
      ],
      options.playerPosition,
      options.playerRadius
    )
  );
}

function advanceDroneInterception(
  options: SalvagePirateResponseOptions,
  pirateShips: readonly LocalPirateContact[],
  combatants: ReadonlySet<string>
): void {
  const { drone, field, sectorNpcs } = options;
  const defender = sectorNpcs.find((npc) => npc.id === 'security-drone:' + field.sourceLocationId);
  const busy = Boolean(defender?.combatMovement || combatants.has(defender?.id ?? ''));
  if (!busy) drone.syncAvailability(defender);
  const target = closestVisiblePirate(options, pirateShips);
  let pursuit: WorldPoint | undefined;
  if (target && !busy) {
    pursuit = securityPirateApproach(drone.position, target.position);
  }
  const obstacles = salvageInterceptionObstacles(options);
  if (!busy) tickSalvageSecurityDrone(drone, field, options.dt, obstacles, pursuit);
  if (!target || !defender || defender.hullHp <= 0 || busy) return;
  const npc = sectorNpcs.find((entry) => entry.id === target.npcId);
  if (!npc || npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) return;
  if (
    Math.hypot(drone.position.x - target.position.x, drone.position.y - target.position.y) <=
    fieldInterceptRange(defender.id, false)
  )
    options.onDroneAttack?.(npc.id, target.position);
}

function resolveSalvageTrafficContacts(
  options: SalvagePirateResponseOptions,
  traffic: readonly SectorNpcState[],
  combatants: ReadonlySet<string>,
  rocks: ReturnType<typeof salvageDroneObstacleAsteroids>
): void {
  const bodies: LocalShieldShipBody[] = options.playerBody ? [options.playerBody] : [];
  for (const salvager of options.salvagers) {
    if (combatants.has(salvager.npcId)) continue;
    const ship = getShipDefinition(salvager.shipId);
    if (ship) bodies.push({ id: salvager.npcId, ship, state: salvager, pushWeight: 1 });
  }
  const droneId = 'security-drone:' + options.field.sourceLocationId;
  const droneNpc = options.sectorNpcs.find((npc) => npc.id === droneId && npc.hullHp > 0);
  const droneShip = droneNpc && getShipDefinition(droneNpc.shipId);
  if (droneShip && !combatants.has(droneId) && options.drone.snapshot().operational) {
    bodies.push({
      id: droneId,
      ship: droneShip,
      state: {
        position: { ...options.drone.position },
        headingRadians: options.drone.headingRadians,
      },
      pushWeight: 100000,
    });
  }
  const hits = options.pirates.resolveShipContacts(traffic, bodies, rocks);
  for (const hit of hits) {
    for (const salvager of options.salvagers) {
      if (salvager.npcId === hit.firstId || salvager.npcId === hit.secondId)
        delete salvager.routeState;
    }
  }
  syncSalvagePhysicsContacts(options.field);
}

function advancePirateTraffic(
  options: SalvagePirateResponseOptions,
  livePirates: readonly SectorNpcState[],
  combatants: ReadonlySet<string>
): void {
  const { pirates, salvagers } = options;
  const rocks = salvageDroneObstacleAsteroids(options.field);
  pirates.tick(
    options.dt,
    livePirates,
    options.playerCombat ? null : options.playerPosition,
    salvagers.map((ship) => ({
      npcId: ship.npcId,
      position: ship.position,
      inCombat:
        combatants.has(ship.npcId) ||
        options.sectorNpcs.some(
          (npc) =>
            npc.id === ship.npcId &&
            (npc.hullHp <= 0 ||
              Boolean(npc.travel) ||
              Boolean(npc.combatMovement) ||
              (npc.combatRecoverySeconds ?? 0) > 0)
        ),
    })),
    rocks,
    (pirateId, targetId, position) => {
      if (combatants.has(targetId) || (targetId === 'player' && options.playerCombat)) return false;
      const targetPosition =
        targetId === 'player'
          ? options.playerPosition
          : (salvagers.find((ship) => ship.npcId === targetId)?.position ??
            pirates.snapshot(livePirates).find((ship) => ship.npcId === targetId)?.position);
      return targetPosition
        ? (options.onPirateAttack?.(pirateId, targetId, position, targetPosition) ?? false)
        : false;
    },
    options.playerCombat?.defender.id,
    options.onFreighterExit,
    fieldTrafficProvider(options.field)
  );
  resolveSalvageTrafficContacts(options, livePirates, combatants, rocks);
}

/** Combat owns fighting ship poses; regular traffic owns everyone else. */
export function advanceSalvagePirateResponse(options: SalvagePirateResponseOptions): void {
  const location = narrowsSector.locations.find(
    (entry) => entry.id === options.field.sourceLocationId
  );
  const livePirates = options.sectorNpcs.filter(
    (npc) =>
      localArmedTraffic(npc) &&
      npc.locationId === options.field.sourceLocationId &&
      npc.hullHp > 0 &&
      (!location || pirateHuntAllowedAt(npc, location))
  );
  options.pirates.reconcile(livePirates, undefined, fieldTrafficProvider(options.field));
  const combatants = mirrorSalvageDuels(options);
  const ships = options.pirates.snapshot(options.sectorNpcs);
  advanceDroneInterception(
    options,
    ships.filter((ship) => livePirates.some((npc) => npc.id === ship.npcId && npc.pirate)),
    combatants
  );
  advancePirateTraffic(options, livePirates, combatants);
}

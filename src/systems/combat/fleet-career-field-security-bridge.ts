import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { AsteroidFieldRuntime } from '../operations/asteroid-field-world';
import { DRONE_SHIELD_RADIUS_METERS } from '../operations/security-drone-debris-contact';
import { createFleetDroneInterceptor } from './fleet-security-drone-interceptor';
import { createFleetCareerNpcParticipant } from './fleet-career-npc-adapter';
import type {
  FleetCombatParticipant,
  FleetCombatShipSnapshot,
  FleetCombatWorldOptions,
} from './fleet-combat-service';

function careerPirateParticipants(
  field: AsteroidFieldRuntime,
  pirates: readonly SectorNpcState[],
  reservedIds: ReadonlySet<string>,
  targets: ReadonlyMap<string, string>
): FleetCombatParticipant[] {
  return field.pirates
    .snapshot(pirates)
    .filter((ship) => !reservedIds.has(ship.npcId))
    .map((ship) => {
      const npc = pirates.find((entry) => entry.id === ship.npcId)!;
      const participant = createFleetCareerNpcParticipant(npc, ship.position, {
        headingRadians: ship.headingRadians,
        targetId: null,
      });
      return {
        ...participant,
        externalMovement(_dt: number) {
          const local = field.pirates.snapshot(pirates).find((entry) => entry.npcId === npc.id);
          if (!local || npc.hullHp <= 0)
            return {
              position: { ...ship.position },
              headingRadians: ship.headingRadians,
              targetId: null,
              active: false,
            };
          const targetId = targets.get(npc.id) ?? null;
          return {
            position: { ...local.position },
            headingRadians: local.headingRadians,
            targetId,
            ...(targetId
              ? {
                  combatMotionTargetId: targetId,
                  combatTactic: participant.setup.preferredTactic ?? 'fight',
                  afterCombatMotion(position: WorldPoint, heading: number) {
                    field.pirates.syncCombatPose(npc.id, position, heading);
                  },
                }
              : {}),
          };
        },
      };
    });
}

function careerDroneParticipant(
  field: AsteroidFieldRuntime,
  npc: SectorNpcState | undefined,
  reservedIds: ReadonlySet<string>
): FleetCombatParticipant | null {
  if (!npc || npc.hullHp <= 0 || !field.drone.snapshot().operational || reservedIds.has(npc.id))
    return null;
  const position = field.drone.snapshot().position;
  const participant = createFleetCareerNpcParticipant(npc, position, {
    headingRadians: field.drone.headingRadians,
    targetId: null,
  });
  const interceptor = createFleetDroneInterceptor(field.drone, field.instance.asteroids);
  return {
    ...participant,
    setup: {
      ...participant.setup,
      shieldGeometry: {
        centerOffset: { x: 0, y: 0 },
        radiusX: DRONE_SHIELD_RADIUS_METERS,
        radiusY: DRONE_SHIELD_RADIUS_METERS,
        modifier: 1,
      },
    },
    externalMovement(dt: number, nearby: readonly FleetCombatShipSnapshot[]) {
      const contacts = nearby.map((entry) => ({
        id: entry.ship.id,
        factionId: entry.factionId,
        position: entry.ship.position,
        operational: entry.ship.hullHp > 0,
      }));
      const obstacles = nearby
        .filter((entry) => entry.ship.id !== npc.id && entry.ship.hullHp > 0)
        .map((entry) => ({
          id: entry.ship.id,
          position: entry.ship.position,
          radius: 35,
        }));
      const result = interceptor.tick(dt, contacts, obstacles);
      return {
        position: result.position,
        headingRadians: field.drone.headingRadians,
        targetId: result.inAttackRange ? result.targetId : null,
        active: field.drone.snapshot().operational,
      };
    },
  };
}

/** Reuses existing checkpointed pirate traffic and the campaign drone.
 * No alternate PvP route planner, sensor evaluator or NPC factory is created.
 * FC-32 transfers the field tick to the shared FleetCombat service.
 */
export function createFleetCareerFieldSecurityBridge(
  field: AsteroidFieldRuntime,
  npcs: readonly SectorNpcState[],
  reservedIds: ReadonlySet<string> = new Set()
): {
  readonly participants: readonly FleetCombatParticipant[];
  readonly world: FleetCombatWorldOptions;
} {
  const pirates = npcs.filter(
    (npc) => npc.pirate && npc.locationId === field.locationId && npc.hullHp > 0
  );
  field.pirates.reconcile(pirates);
  const targets = new Map<string, string>();
  const droneNpc = npcs.find((npc) => npc.id === 'security-drone:' + field.locationId);
  const drone = careerDroneParticipant(field, droneNpc, reservedIds);
  const participants = careerPirateParticipants(field, pirates, reservedIds, targets);
  if (drone) participants.push(drone);

  return {
    participants,
    world: {
      tickWorld(dt) {
        targets.clear();
        field.pirates.reconcile(pirates);
        field.pirates.tick(
          dt,
          pirates,
          reservedIds.has('player') ? field.instance.ship.position : null,
          field.miners.ships.map((ship) => ({
            npcId: ship.npcId,
            position: ship.position,
            inCombat: Boolean(npcs.find((npc) => npc.id === ship.npcId)?.combatMovement),
          })),
          field.instance.asteroids,
          (pirateId, targetId) => {
            targets.set(pirateId, targetId);
            // Use native intercept distance but do not latch the old 1vs1 engine.
            return false;
          }
        );
      },
      afterCombatTick(ships) {
        for (const npc of pirates) {
          const combatant = ships.find((entry) => entry.ship.id === npc.id);
          if (combatant) npc.hullHp = Math.max(0, Math.min(npc.hullMaxHp, combatant.ship.hullHp));
        }
        if (droneNpc) {
          const combatant = ships.find((entry) => entry.ship.id === droneNpc.id);
          if (combatant) {
            droneNpc.hullHp = Math.max(0, Math.min(droneNpc.hullMaxHp, combatant.ship.hullHp));
            if (droneNpc.hullHp <= 0) field.drone.destroy();
          }
        }
      },
    },
  };
}

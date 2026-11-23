import {
  syncMiningCombatField,
  syncSalvageCombatField,
} from '../../systems/combat/field-combat-arena';
import type { SectorNpcState, NpcJob } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { getShipDefinition, resolveShipLocalCruiseSpeed } from '../../systems/ships';
import { ensureNpcInstalledComponents } from '../../systems/npcs/npc-upgrade-service';
import type { DuelField } from '../../systems/combat/duel-arena-presets';
import { npcDefenseReaction, npcMayInitiateAttack } from '../../systems/npcs/npc-combat-ai';
import { hashId } from '../../systems/npcs/npc-mining-targets';
import { createFleetWorldWorkers } from './fleet-world-workers';
import { createFleetWorldTraffic } from './fleet-world-traffic';
import { fleetNpcDestination } from './fleet-world-destination';
import { fleetPatrolContact } from './fleet-world-patrol-contact';
import { createFleetWorldPlayerFlight } from './fleet-world-player-flight';
import { fleetWorldContacts } from './fleet-world-contacts';
import { createFleetWorldShieldContacts } from './fleet-world-shield-contacts';
import { resolveFleetWorldNeutralCollisions } from './fleet-world-neutral-collisions';
import type { FleetWorldContact, FleetWorldPose } from './fleet-world-contact-types';
export type { FleetWorldContact, FleetWorldPose } from './fleet-world-contact-types';
import { advanceCombatAsteroids } from '../../systems/combat/combat-asteroid-motion';
import { seededLocalGate } from '../../core/local-space-exit';
import { AsteroidSecurityDrone } from '../../systems/operations/asteroid-security-drone';
import { moveFieldShip, type FieldRouteShip } from '../../systems/navigation/field-ship-routing';
import type {
  StrategicCombatArenaOptions,
  MutableCombatant,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-types';
import { duelInstalledComponents } from './duel-combatant-setup';
import type { FleetScenarioShip } from './fleet-scenario-roster';
interface MovingNpc extends FieldRouteShip {
  readonly npc: SectorNpcState;
  waypoint: WorldPoint;
}
const WORLD_LOCATION = 'duel';
/**
 * Test-labor adapter to the existing campaign services. The miner's mining
 * AI, the security drone's actual patrol/sensors, the faction defence
 * decision and physical waypoint routing are not reimplemented here.
 * The test state never mutates the real career sector or economy.
 */
// Thin integration of existing campaign miners, drones, world routing and fleet AI.
// eslint-disable-next-line max-lines-per-function
export function createFleetScenarioWorldBridge(
  roster: readonly FleetScenarioShip[],
  arena: StrategicCombatArenaOptions,
  seed: number,
  field: DuelField,
  hullById: ReadonlyMap<string, number> = new Map()
) {
  const rocks: LocalAsteroid[] = field.mining?.asteroids ?? [];
  const salvageField = field.salvage;
  const combatRocks = new Map((arena.asteroids ?? []).map((body) => [body.id, body]));
  const templates = createSectorNpcEconomyStates();
  const arrived = new Set<string>();
  const departed = new Set<string>();
  const freightExit = arena.exitPoint ?? seededLocalGate(arena.width, arena.height, seed);
  const engaged = new Set<string>();
  const threats = new Map<string, WorldPoint>();
  const states = new Map<string, MovingNpc>();
  const drones = new Map<string, AsteroidSecurityDrone>();
  const neutralShields = createFleetWorldShieldContacts();
  const playerStart = arena.attackerPosition ?? { x: arena.width * 0.5, y: arena.height * 0.5 };
  const playerShip = roster.find((ship) => ship.id === 'player')!;
  const playerFlight = createFleetWorldPlayerFlight(field, playerShip.draft, seed);
  const playerPose = () => ({
    position: playerFlight.state.position,
    headingRadians: playerFlight.state.headingRadians,
    velocity: playerFlight.velocity(),
  });
  const jobFor = (ship: FleetScenarioShip): NpcJob => {
    if (ship.group === 'pirates-yellow' || ship.group === 'pirates-red') return 'pirate';
    if (ship.group === 'drone') return 'patrol';
    const role = getShipDefinition(ship.draft.shipId)?.role;
    if (role === 'mining') return 'miner';
    if (role === 'salvage') return 'salvager';
    if (role === 'freighter') return 'freighter';
    return 'patrol';
  };
  for (const ship of roster) {
    if (ship.group === 'player') continue;
    const job = jobFor(ship);
    const template =
      templates.find(
        (candidate) => candidate.job === job && candidate.shipId === ship.draft.shipId
      ) ?? templates.find((candidate) => candidate.job === job);
    if (!template) throw new Error('Missing career NPC template for ' + job);
    const npc: SectorNpcState = {
      ...structuredClone(template),
      id: ship.id,
      name: ship.name,
      shipId: ship.draft.shipId,
      job,
      role: job === 'pirate' || job === 'patrol' ? 'patrol' : job,
      locationId: WORLD_LOCATION,
      workLocationId: WORLD_LOCATION,
      workResourceIds: [],
      hullHp: hullById.get(ship.id) ?? template.hullMaxHp,
      hullMaxHp: hullById.get(ship.id) ?? template.hullMaxHp,
      installedComponents: duelInstalledComponents(ship.draft),
      pirate: job === 'pirate',
      ...(ship.group === 'pirates-yellow'
        ? { factionId: 'pirates' as const, pirateMark: 'broken-spear' as const }
        : {}),
      ...(ship.group === 'pirates-red'
        ? { factionId: 'pirates2' as const, pirateMark: 'black-tide' as const }
        : {}),
      ...(job === 'miner' || job === 'salvager'
        ? {
            autonomy: {
              phase: 'ready' as const,
              secondsRemaining: 0,
              lastLocationId: WORLD_LOCATION,
              wasTravelling: false,
            },
          }
        : {}),
    };
    const code = hashId(ship.id + ':' + seed);
    const angle = ((code % 6283) / 1000) % (Math.PI * 2);
    const radius = 200 + ((code >>> 7) % 260);
    const initial = {
      x: Math.max(180, Math.min(arena.width - 180, playerStart.x + Math.cos(angle) * radius)),
      y: Math.max(180, Math.min(arena.height - 180, playerStart.y + Math.sin(angle) * radius)),
    };
    states.set(ship.id, {
      npc,
      position: initial,
      headingRadians: angle + Math.PI,
      speed: 0,
      waypoint: { x: arena.width * 0.5, y: arena.height * 0.5 },
    });
  }
  let trafficFor: ReturnType<typeof createFleetWorldTraffic> = () => [];
  const { miners, salvagers } = createFleetWorldWorkers(
    [...states.values()],
    rocks,
    salvageField,
    seed,
    arena.width,
    arena.height,
    (id) => trafficFor(id),
    (id) => departed.add(id)
  );
  const pose = (id: string): FleetWorldPose | null => {
    if (id === 'player') return playerPose();
    const moving = states.get(id);
    if (!moving || !arrived.has(id) || departed.has(id)) return null;
    if (moving.npc.job === 'miner' && !engaged.has(id) && !moving.npc.combatMovement) {
      const miner = miners.ships.find((entry) => entry.npcId === id);
      if (miner)
        return {
          position: { ...miner.position },
          headingRadians: miner.headingRadians,
          velocity: {
            x: Math.cos(miner.headingRadians) * miner.speed,
            y: Math.sin(miner.headingRadians) * miner.speed,
          },
        };
    }
    if (moving.npc.job === 'salvager' && !engaged.has(id) && !moving.npc.combatMovement) {
      const salvager = salvagers?.ships.find((entry) => entry.npcId === id);
      if (salvager)
        return {
          position: { ...salvager.position },
          headingRadians: salvager.headingRadians,
          velocity: {
            x: Math.cos(salvager.headingRadians) * salvager.speed,
            y: Math.sin(salvager.headingRadians) * salvager.speed,
          },
        };
    }
    const drone = drones.get(id);
    if (drone && !engaged.has(id))
      return {
        position: { ...drone.position },
        headingRadians: drone.headingRadians,
        velocity: {
          x: Math.cos(drone.headingRadians) * drone.speed,
          y: Math.sin(drone.headingRadians) * drone.speed,
        },
      };
    return {
      position: { ...moving.position },
      headingRadians: moving.headingRadians,
      velocity: {
        x: Math.cos(moving.headingRadians) * moving.speed,
        y: Math.sin(moving.headingRadians) * moving.speed,
      },
    };
  };
  trafficFor = createFleetWorldTraffic(
    states,
    (id) => pose(id)?.position ?? null,
    (id) => arrived.has(id) && !departed.has(id),
    () => ({
      shipId: playerShip.draft.shipId,
      position: playerFlight.state.position,
    })
  );
  const deploy = (id: string): void => {
    if (arrived.has(id)) return;
    arrived.add(id);
    const moving = states.get(id);
    if (!moving) return;
    if ((moving.npc.job === 'miner' || moving.npc.job === 'salvager') && moving.npc.autonomy)
      moving.npc.autonomy.phase = 'working';
    if (id.startsWith('security-drone:')) {
      const drone = new AsteroidSecurityDrone(arena.width, arena.height, rocks);
      drone.restore(moving.position, true);
      drones.set(id, drone);
    }
  };
  const obstacles = () =>
    rocks
      .filter((rock) => rock.routeBlocking)
      .map((rock) => ({
        id: rock.id,
        position: rock.position,
        radius: rock.collisionRadius ?? rock.radius,
      }));
  const syncFromCombat = (actor: MutableCombatant): void => {
    if (actor.setup.id === 'player') {
      playerFlight.restore(actor.position, actor.headingRadians, actor.speed);
      return;
    }
    const moving = states.get(actor.setup.id);
    if (!moving) return;
    moving.position = { ...actor.position };
    moving.headingRadians = actor.headingRadians;
    moving.speed = actor.speed;
    moving.npc.hullHp = Math.max(0, Math.min(moving.npc.hullMaxHp, actor.hullHp));
    if (moving.npc.combatMovement) {
      moving.npc.combatMovement.position = { ...actor.position };
      moving.npc.combatMovement.headingRadians = actor.headingRadians;
      moving.npc.combatMovement.speed = actor.speed;
    }
  };
  const updateIdleBodies = () => {
    for (const rock of rocks) {
      const body = combatRocks.get(rock.id);
      if (!body) continue;
      Object.assign(body.position, rock.position);
      body.rotation = rock.rotation;
      Object.assign(body.velocity, rock.physics.velocity);
    }
    for (const part of [
      ...(salvageField?.debris ?? []),
      ...(salvageField?.sections ?? []),
      ...(salvageField?.wrecks ?? []),
    ]) {
      const body = combatRocks.get(part.id);
      if (!body) continue;
      Object.assign(body.position, part.position);
      Object.assign(body.velocity, part.driftVelocity);
      if (part.rotation3d) body.rotation3d = { ...part.rotation3d };
      body.rotation = part.rotation3d?.z ?? body.rotation;
    }
    for (const obstacle of arena.obstacles ?? []) {
      const body = combatRocks.get(obstacle.id);
      if (body) Object.assign(obstacle.position, body.position);
    }
  };
  return {
    deploy,
    pose,
    navigatePlayer: (target: WorldPoint) => {
      if (!engaged.has('player') && !departed.has('player')) playerFlight.navigate(target);
    },
    playerNavigation: () => {
      const { navigationRoute: route, navigationTarget: target } = playerFlight.navigation();
      return { route, target };
    },
    isArrived: (id: string) => arrived.has(id) && !departed.has(id),
    isActive: (id: string) => arrived.has(id) && !departed.has(id),
    isEngaged: (id: string) => engaged.has(id),
    npc: (id: string) => states.get(id)?.npc ?? null,
    defence: (id: string) => {
      const npc = states.get(id)?.npc;
      return npc ? npcDefenseReaction(npc) : 'fight';
    },
    canAttack: (id: string) => {
      const npc = states.get(id)?.npc;
      return !!npc && npcMayInitiateAttack(npc);
    },
    canDroneSee: (id: string, point: WorldPoint) => drones.get(id)?.detect(point, rocks) ?? false,
    markEngaged(id: string, targetId: string) {
      if (engaged.has(id)) return;
      const current = pose(id);
      engaged.add(id);
      threats.delete(id);
      const moving = states.get(id);
      if (!moving) return;
      if (current) {
        moving.position = { ...current.position };
        moving.headingRadians = current.headingRadians;
      }
      moving.npc.combatMovement = {
        mode: 'engaged',
        targetKind: targetId === 'player' ? 'player' : 'npc',
        targetId,
        position: { ...moving.position },
        headingRadians: moving.headingRadians,
        speed: moving.speed,
      };
    },
    syncFromCombat,
    syncCombatField(snapshot: StrategicCombatSnapshot) {
      const bodies = snapshot.arena.asteroids ?? [];
      combatRocks.clear();
      for (const body of bodies) combatRocks.set(body.id, body);
      syncMiningCombatField(rocks, combatRocks);
      if (salvageField) syncSalvageCombatField(salvageField, snapshot);
    },
    /** Hand control of a surviving ship back to its original campaign service. */
    releaseCombat(id: string, leftField: boolean) {
      if (leftField) departed.add(id);
      if (!engaged.delete(id)) return;
      const moving = states.get(id);
      if (!moving) return;
      delete moving.npc.combatMovement;
      threats.delete(id);
      if (moving.npc.hullHp <= 0) return;
      if (moving.npc.job === 'salvager') {
        salvagers?.syncCombatPose(id, moving.position, moving.headingRadians, moving.speed);
        if (moving.npc.autonomy) moving.npc.autonomy.phase = 'working';
      }
      if (moving.npc.job === 'miner') {
        miners.syncCombatPose(id, moving.position, moving.headingRadians, moving.speed);
        if (moving.npc.autonomy) moving.npc.autonomy.phase = 'working';
      }
      if (id.startsWith('security-drone:')) {
        const drone = drones.get(id);
        if (drone) {
          drone.restore(moving.position, true);
          drone.headingRadians = moving.headingRadians;
          drone.speed = moving.speed;
        }
      }
    },
    threaten(id: string, aggressor: WorldPoint) {
      if (engaged.has(id)) return;
      const moving = states.get(id);
      if (!moving) return;
      if (
        (moving.npc.job === 'miner' || moving.npc.job === 'salvager') &&
        !moving.npc.combatMovement
      ) {
        const original = pose(id);
        if (original) {
          moving.position = { ...original.position };
          moving.headingRadians = original.headingRadians;
          moving.speed = Math.hypot(original.velocity.x, original.velocity.y);
        }
        moving.npc.combatMovement = {
          mode: 'flee',
          targetKind: 'npc',
          targetId: 'threat',
          position: { ...moving.position },
          headingRadians: moving.headingRadians,
          speed: moving.speed,
        };
      }
      threats.set(id, { ...aggressor });
    },
    // Preserve the normal NPC roles: patrol, mining, flee or existing combat owner.
    // eslint-disable-next-line complexity, max-lines-per-function
    tick(dt: number, threat: WorldPoint | null) {
      // The campaign's existing mining and security services drive civilians
      // and drones until their native combat driver takes ownership.
      if (!engaged.has('player') && !departed.has('player'))
        playerFlight.tick(dt, engaged.size > 0);
      if (!engaged.size && departed.has('player')) advanceCombatAsteroids(arena, dt);
      if (!engaged.size && !departed.has('player')) updateIdleBodies();
      miners.tick(dt);
      salvagers?.tick(dt, undefined, true);
      neutralShields.tick(dt);
      for (const [id, moving] of states) {
        if (!arrived.has(id) || departed.has(id) || engaged.has(id) || moving.npc.hullHp <= 0)
          continue;
        if (
          (moving.npc.job === 'miner' || (salvagers && moving.npc.job === 'salvager')) &&
          moving.npc.combatMovement?.mode !== 'flee'
        )
          continue;
        if (id.startsWith('security-drone:')) {
          drones.get(id)?.tick(dt, rocks, [], [], threat ?? undefined);
          continue;
        }
        const danger = threats.get(id);
        const patrolContact = fleetPatrolContact(
          moving.npc,
          moving.position,
          [...states.values()].map((entry) => entry.npc),
          (otherId) => pose(otherId)?.position ?? null
        );
        const destination = fleetNpcDestination(
          moving.npc,
          moving.position,
          moving.waypoint,
          freightExit,
          danger,
          patrolContact ?? threat,
          arena.width,
          arena.height
        );
        const definition = getShipDefinition(moving.npc.shipId);
        const speed = definition
          ? resolveShipLocalCruiseSpeed(definition, ensureNpcInstalledComponents(moving.npc))
          : 110;
        const traffic = trafficFor(id);
        const arrivedAt = moveFieldShip(
          moving,
          destination,
          speed,
          dt,
          [...obstacles(), ...traffic],
          65,
          'patrol'
        );
        if (arrivedAt && moving.npc.job === 'freighter') {
          departed.add(id);
          continue;
        }
        if (arrivedAt && moving.npc.combatMovement?.mode === 'flee') {
          delete moving.npc.combatMovement;
          threats.delete(id);
          miners.syncCombatPose(id, moving.position, moving.headingRadians, moving.speed);
          salvagers?.syncCombatPose(id, moving.position, moving.headingRadians, moving.speed);
          if (moving.npc.autonomy) moving.npc.autonomy.phase = 'working';
        }
        if (arrivedAt) {
          const hash = hashId(
            id + ':' + Math.floor(dt * 1000) + ':' + Math.round(moving.position.x)
          );
          moving.waypoint = {
            x: arena.width * (0.2 + (hash % 600) / 1000),
            y: arena.height * (0.2 + ((hash >>> 10) % 600) / 1000),
          };
        }
      }
      resolveFleetWorldNeutralCollisions(
        states,
        (id) => arrived.has(id) && !departed.has(id) && !engaged.has(id),
        (id) => {
          const moving = states.get(id);
          if (!moving) return null;
          return (
            drones.get(id) ??
            (moving.npc.job === 'miner' && moving.npc.combatMovement?.mode !== 'flee'
              ? miners.ships.find((miner) => miner.npcId === id)
              : undefined) ??
            (moving.npc.job === 'salvager' && moving.npc.combatMovement?.mode !== 'flee'
              ? salvagers?.ships.find((salvager) => salvager.npcId === id)
              : undefined) ??
            moving
          );
        },
        neutralShields,
        !engaged.has('player') && !departed.has('player')
          ? {
              id: 'player',
              shipId: playerShip.draft.shipId,
              position: playerFlight.state.position,
              headingRadians: playerFlight.state.headingRadians,
              onDisplaced: (position: WorldPoint) => {
                playerFlight.state.position = { ...position };
              },
            }
          : undefined
      );
    },
    contacts(): FleetWorldContact[] {
      return fleetWorldContacts(
        states,
        (id) => arrived.has(id) && !departed.has(id) && !engaged.has(id),
        pose,
        miners,
        rocks,
        salvagers,
        salvageField,
        neutralShields,
        engaged.has('player') || departed.has('player')
          ? null
          : {
              id: 'player',
              name: 'Spieler',
              shipId: playerShip.draft.shipId,
              ...playerPose(),
            }
      );
    },
  };
}

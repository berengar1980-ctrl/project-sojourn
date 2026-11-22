import type { SectorNpcState, NpcJob } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { getShipDefinition, resolveShipLocalCruiseSpeed } from '../../systems/ships';
import { ensureNpcInstalledComponents } from '../../systems/npcs/npc-upgrade-service';
import { generateMiningSpace } from '../../systems/local-space/local-space-generator';
import { createNpcLocalMiningService } from '../../systems/npcs/npc-local-mining-service';
import { npcDefenseReaction, npcMayInitiateAttack } from '../../systems/npcs/npc-combat-ai';
import { hashId } from '../../systems/npcs/npc-mining-targets';
import { AsteroidSecurityDrone } from '../../systems/operations/asteroid-security-drone';
import { moveFieldShip, type FieldRouteShip } from '../../systems/navigation/field-ship-routing';
import type {
  StrategicCombatArenaOptions,
  MutableCombatant,
} from '../../systems/combat/strategic-combat-types';
import { duelInstalledComponents } from './duel-combatant-setup';
import type { FleetScenarioShip } from './fleet-scenario-roster';

export interface FleetWorldPose {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly velocity: WorldPoint;
}

export interface FleetWorldContact extends FleetWorldPose {
  readonly id: string;
  readonly shipId: string;
  readonly name: string;
}

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
  mapKind:
    'empty' | 'scattered' | 'asteroid_field' | 'scrap_scattered' | 'scrap_field' = 'asteroid_field',
  hullById: ReadonlyMap<string, number> = new Map()
) {
  const field =
    (arena.asteroids?.length ?? 0) > 0 && (mapKind === 'scattered' || mapKind === 'asteroid_field')
      ? generateMiningSpace(
          WORLD_LOCATION,
          seed,
          undefined,
          mapKind === 'scattered' ? 'sparse' : 'standard'
        )
      : null;
  const rocks: LocalAsteroid[] = field?.asteroids ?? [];
  // Both services inspect the SAME campaign field geometry. Combat owns rock
  // motion; miners and the drone observe that pose, never move it twice.
  const combatRocks = new Map((arena.asteroids ?? []).map((body) => [body.id, body]));
  const templates = createSectorNpcEconomyStates();
  const arrived = new Set<string>();
  const engaged = new Set<string>();
  const threats = new Map<string, WorldPoint>();
  const states = new Map<string, MovingNpc>();
  const drones = new Map<string, AsteroidSecurityDrone>();
  const playerStart = arena.attackerPosition ?? { x: arena.width * 0.5, y: arena.height * 0.5 };
  const playerPose: FleetWorldPose = {
    position: { ...playerStart },
    headingRadians: arena.attackerHeadingRadians ?? 0,
    velocity: arena.attackerVelocity ?? { x: 0, y: 0 },
  };
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
      templates.find((candidate) => candidate.job === job && candidate.shipId === ship.draft.shipId) ??
      templates.find((candidate) => candidate.job === job);
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
      ...(job === 'miner'
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
  const miners = createNpcLocalMiningService({
    locationId: WORLD_LOCATION,
    seed,
    width: arena.width,
    height: arena.height,
    miners: [...states.values()]
      .filter((entry) => entry.npc.job === 'miner')
      .map((entry) => entry.npc),
    getAsteroids: () => rocks,
    mine: (npc, resourceId, requested) => {
      const capacity = Math.max(
        0,
        npc.cargoCapacity - Object.values(npc.cargo).reduce((a, b) => a + b, 0)
      );
      const accepted = Math.min(requested, capacity);
      if (accepted > 0) npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + accepted;
      return accepted;
    },
    depart: (npc) => {
      if (npc.autonomy) npc.autonomy.phase = 'ready';
      return true;
    },
  });
  const pose = (id: string): FleetWorldPose | null => {
    if (id === 'player') return playerPose;
    const moving = states.get(id);
    if (!moving || !arrived.has(id)) return null;
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
  const deploy = (id: string): void => {
    if (arrived.has(id)) return;
    arrived.add(id);
    const moving = states.get(id);
    if (!moving) return;
    if (moving.npc.job === 'miner' && moving.npc.autonomy) moving.npc.autonomy.phase = 'working';
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
    if (actor.setup.id === 'player') return;
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
  return {
    deploy,
    pose,
    isArrived: (id: string) => arrived.has(id),
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
    threaten(id: string, aggressor: WorldPoint) {
      if (engaged.has(id)) return;
      const moving = states.get(id);
      if (!moving) return;
      if (moving.npc.job === 'miner' && !moving.npc.combatMovement) {
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
    // eslint-disable-next-line complexity
    tick(dt: number, threat: WorldPoint | null) {
      // The campaign's existing mining and security services drive civilians
      // and drones until their native combat driver takes ownership.
      for (const rock of rocks) {
        const body = combatRocks.get(rock.id);
        if (!body) continue;
        rock.position = { ...body.position };
        rock.rotation = body.rotation;
        rock.physics.velocity = { ...body.velocity };
      }
      miners.tick(dt);
      for (const [id, moving] of states) {
        if (!arrived.has(id) || engaged.has(id) || moving.npc.hullHp <= 0) continue;
        if (moving.npc.job === 'miner' && moving.npc.combatMovement?.mode !== 'flee') continue;
        if (id.startsWith('security-drone:')) {
          drones.get(id)?.tick(dt, rocks, [], [], threat ?? undefined);
          continue;
        }
        const danger = threats.get(id);
        const destination =
          danger && npcDefenseReaction(moving.npc) === 'flee'
            ? {
                x: Math.max(180, Math.min(arena.width - 180, moving.position.x * 2 - danger.x)),
                y: Math.max(180, Math.min(arena.height - 180, moving.position.y * 2 - danger.y)),
              }
            : threat && moving.npc.pirate && npcMayInitiateAttack(moving.npc)
              ? threat
              : moving.waypoint;
        const definition = getShipDefinition(moving.npc.shipId);
        const speed = definition
          ? resolveShipLocalCruiseSpeed(definition, ensureNpcInstalledComponents(moving.npc))
          : 110;
        const arrivedAt = moveFieldShip(moving, destination, speed, dt, obstacles(), 65, 'patrol');
        if (arrivedAt && moving.npc.combatMovement?.mode === 'flee') {
          delete moving.npc.combatMovement;
          threats.delete(id);
          miners.syncCombatPose(id, moving.position, moving.headingRadians, moving.speed);
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
    },
    contacts(): FleetWorldContact[] {
      const bystanders = [...states].flatMap(([id, value]) => {
        if (!arrived.has(id) || engaged.has(id) || value.npc.hullHp <= 0) return [];
        const movement = pose(id);
        return movement
          ? [{ id, name: value.npc.name, shipId: value.npc.shipId, ...movement }]
          : [];
      });
      return engaged.has('player')
        ? bystanders
        : [
            {
              id: 'player',
              name: 'Spieler',
              shipId: roster.find((ship) => ship.id === 'player')!.draft.shipId,
              ...playerPose,
            },
            ...bystanders,
          ];
    },
  };
}

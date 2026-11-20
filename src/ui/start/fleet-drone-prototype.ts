import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { equipSecurityDroneMk3 } from '../../app/game-controller-security-drone-loadout';
import { AsteroidSecurityDrone } from '../../systems/operations/asteroid-security-drone';
import { DRONE_SHIELD_RADIUS_METERS } from '../../systems/operations/security-drone-debris-contact';
import { createFleetDroneInterceptor } from '../../systems/combat/fleet-security-drone-interceptor';
import type {
  FleetCombatParticipant,
  FleetCombatShipSnapshot,
} from '../../systems/combat/fleet-combat-service';
import type { StrategicCombatArenaOptions } from '../../systems/combat/strategic-combat-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { NpcInstalledComponents } from '../../core/npc-types';
import { getShipDefinition } from '../../systems/ships';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import { duelCombatant, type DuelDraft } from './duel-combatant-setup';

function droneFieldAsteroids(arena: StrategicCombatArenaOptions): LocalAsteroid[] {
  return (arena.asteroids ?? []).map((rock) => {
    const mass = Math.max(1, rock.radius ** 3);
    return {
      id: rock.id,
      kind: rock.kind,
      routeBlocking: rock.kind === 'resource' || rock.radius >= 30,
      position: { ...rock.position },
      radius: rock.radius,
      ...(rock.collisionRadius !== undefined ? { collisionRadius: rock.collisionRadius } : {}),
      rotation: rock.rotation,
      physics: {
        mass,
        centerOfMassOffset: { x: 0, y: 0 },
        velocity: { ...rock.velocity },
        angularVelocity: rock.angularVelocity,
        momentOfInertia: mass * rock.radius * rock.radius,
      },
      deposits: [],
      scanLevel: 'unscanned' as const,
    };
  });
}

function campaignDroneDraft(
  shipId: string,
  installed: NpcInstalledComponents | undefined
): DuelDraft {
  const parts: NpcInstalledComponents = installed ?? {};
  return {
    shipId,
    weapons: [...(parts.weapon ?? [])],
    mines: [],
    crewId: crewDefinitions[0]!.id,
    reactorId: parts.reactor?.[0] ?? 'reactor3',
    engineId: parts.engine?.[0] ?? 'engine1',
    shieldId: parts.shield?.[0] ?? 'shield3',
    hullId: parts.hull?.[0] ?? 'hull3',
    sensorId: parts.sensor?.[0] ?? 'sensor1',
    tractorId: parts.tractor?.[0] ?? 'tractor1',
  };
}

/** Real campaign NPC-equivalent drone combatant; no fabricated hull or gun. */
export function createFleetDronePrototype(
  entry: { readonly id: string; readonly name: string; readonly role: string },
  index: number,
  arena: StrategicCombatArenaOptions,
  entryPosition?: { readonly x: number; readonly y: number }
): FleetCombatParticipant {
  if (entry.role !== 'drone') throw new Error('Fleet drone adapter requires a drone');
  const template = createSectorNpcEconomyStates().find(
    (npc) => npc.job === 'patrol' && !npc.pirate
  );
  if (!template) throw new Error('Campaign drone patrol combatant template missing');
  equipSecurityDroneMk3(template);
  const ship = getShipDefinition(template.shipId);
  if (!ship) throw new Error('Campaign drone hull definition missing');
  const installed = template.installedComponents;
  const draft = campaignDroneDraft(ship.id, installed);
  const setup = duelCombatant(index, draft, ship);
  const asteroids = droneFieldAsteroids(arena);
  const drone = new AsteroidSecurityDrone(arena.width, arena.height, asteroids);
  const position = entryPosition ?? {
    x: arena.width * 0.69,
    y: arena.height * (0.3 + 0.1 * (index % 4)),
  };
  drone.restore(position, true);
  const interceptor = createFleetDroneInterceptor(drone, asteroids);
  return {
    setup: {
      ...setup,
      id: entry.id,
      name: entry.name,
      preferredTactic: 'fight',
      shieldGeometry: {
        centerOffset: { x: 0, y: 0 },
        radiusX: DRONE_SHIELD_RADIUS_METERS,
        radiusY: DRONE_SHIELD_RADIUS_METERS,
        modifier: 1,
      },
    },
    factionId: 'security',
    position,
    targetId: null,
    externalMovement(dt: number, nearby: readonly FleetCombatShipSnapshot[]) {
      const contacts = nearby.map((other) => ({
        id: other.ship.id,
        factionId: other.factionId,
        position: other.ship.position,
        operational: other.ship.hullHp > 0,
      }));
      const obstacles = nearby
        .filter((other) => other.ship.id !== entry.id && other.ship.hullHp > 0)
        .map((other) => ({
          id: other.ship.id,
          position: other.ship.position,
          radius: 35,
        }));
      const state = interceptor.tick(dt, contacts, obstacles);
      return {
        position: state.position,
        headingRadians: drone.headingRadians,
        targetId: state.inAttackRange ? state.targetId : null,
      };
    },
  };
}

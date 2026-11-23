import { getShipDefinition } from '../../systems/ships';
import type { WorldPoint } from '../../core/world-types';
import { npcMayTargetNpc } from '../../systems/npcs/npc-combat-ai';
import {
  createConflictManager,
  type ConflictParticipant,
} from '../../systems/combat/fleet-conflict-manager';
import { createDynamicFleetCombat } from '../../systems/combat/dynamic-fleet-combat';
import type {
  NativeDuelShip,
  ParallelNativeDuels,
} from '../../systems/combat/parallel-native-duels';
import type { StrategicCombatArenaOptions } from '../../systems/combat/strategic-combat-types';
import { duelCombatant } from './duel-combatant-setup';
import { createFleetScenarioWorldBridge } from './fleet-scenario-world-bridge';
import type { FleetScenarioIncident, FleetScenarioShip } from './fleet-scenario-roster';

type ScenarioWorld = ReturnType<typeof createFleetScenarioWorldBridge>;

function scenarioDistance(a: NativeDuelShip, b: NativeDuelShip): number {
  if (!a.position || !b.position) return Infinity;
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

/** World and combat use the same campaign NPC reaction and drone LOS services. */
// eslint-disable-next-line complexity
function canJoinWorldCombat(
  ship: NativeDuelShip,
  opponent: NativeDuelShip,
  world: ScenarioWorld,
  incident: FleetScenarioIncident
): boolean {
  if (scenarioDistance(ship, opponent) > 650) return false;
  const aggressor = world.npc(ship.id);
  const victim = world.npc(opponent.id);
  if (aggressor?.hullHp !== undefined && aggressor.hullHp <= 0) return false;
  if (victim?.hullHp !== undefined && victim.hullHp <= 0) return false;
  if (ship.id.startsWith('security-drone:'))
    return !!opponent.position && world.canDroneSee(ship.id, opponent.position);
  if (aggressor?.pirate) {
    if (!world.canAttack(ship.id)) return false;
    if (opponent.id === 'player') return true;
    return !!victim && npcMayTargetNpc(aggressor, victim);
  }
  if (aggressor?.job === 'patrol')
    return world.canAttack(ship.id) && !!victim && npcMayTargetNpc(aggressor, victim, true);
  if (
    world.npc(ship.id)?.job === 'miner' ||
    world.npc(ship.id)?.job === 'freighter' ||
    world.npc(ship.id)?.job === 'salvager'
  ) {
    // The campaign's defence score determines a response to an attack, not
    // permission for a neutral civilian to initiate one. The actual aggressor
    // or scripted incident creates the hostile pair.
    if (world.defence(ship.id) === 'flee' && opponent.position)
      world.threaten(ship.id, opponent.position);
    return false;
  }
  // The player is a valid defender, never an automatic aggressor against civilians.
  return victim?.pirate ? world.canAttack(opponent.id) : incident !== 'none';
}

function firstHostilePair(
  available: readonly NativeDuelShip[],
  hostility: (source: string, target: string) => boolean,
  world: ScenarioWorld,
  incident: FleetScenarioIncident,
  completedPairs: ReadonlySet<string>
): readonly [NativeDuelShip, NativeDuelShip] | null {
  for (const source of available) {
    const target = available.find(
      (other) =>
        other !== source &&
        !completedPairs.has([source.id, other.id].sort().join('|')) &&
        (hostility(source.id, other.id) || hostility(other.id, source.id)) &&
        (canJoinWorldCombat(source, other, world, incident) ||
          canJoinWorldCombat(other, source, world, incident))
    );
    if (target) return [source, target];
  }
  return null;
}

function participant(ship: FleetScenarioShip): ConflictParticipant {
  if (ship.group === 'player') return { id: ship.id, role: 'player' };
  if (ship.group === 'drone') return { id: ship.id, role: 'drone', armed: true };
  if (ship.group === 'pirates-yellow' || ship.group === 'pirates-red') {
    return { id: ship.id, role: 'pirate', pirateGroup: ship.group };
  }
  const definition = getShipDefinition(ship.draft.shipId);
  return {
    id: ship.id,
    role: 'npc',
    civilianRole:
      definition?.role === 'patrol'
        ? 'patrol'
        : definition?.role === 'freighter'
          ? 'freighter'
          : definition?.role === 'mining'
            ? 'miner'
            : 'scavenger',
    armed: ship.draft.weapons.some(Boolean),
  };
}

function nativeShip(ship: FleetScenarioShip, index: number): NativeDuelShip {
  const definition = getShipDefinition(ship.draft.shipId);
  if (!definition) throw new Error('Unbekanntes FleetCombat-Schiff: ' + ship.draft.shipId);
  const setup = duelCombatant(index, ship.draft, definition);
  const pirateMark =
    ship.group === 'pirates-yellow'
      ? ('broken-spear' as const)
      : ship.group === 'pirates-red'
        ? ('black-tide' as const)
        : null;
  return {
    id: ship.id,
    team: ship.group,
    setup: {
      ...setup,
      id: ship.id,
      name: ship.id.toUpperCase() + ' · ' + ship.name,
      ...(pirateMark ? { pirateMark } : {}),
      ...(pirateMark
        ? {
            factionId:
              ship.group === 'pirates-yellow' ? ('pirates' as const) : ('pirates2' as const),
          }
        : {}),
      preferredTactic: 'fight',
    },
  };
}

export interface FleetScenarioRuntime {
  readonly ships: readonly FleetScenarioShip[];
  readonly totalCount: number;
  readonly elapsedSeconds: number;
  readonly arrivedCount: number;
  readonly fleet: ParallelNativeDuels | null;
  readonly completedEncounters: number;
  readonly worldContacts: ReturnType<ScenarioWorld['contacts']>;
  navigatePlayer(point: WorldPoint): void;
  readonly playerNavigation: ReturnType<ScenarioWorld['playerNavigation']>;
  /** Advance elapsed simulation time and insert arrivals into the SAME battle. */
  tick(seconds: number): void;
  /** Has the battle ended with no future scheduled contact? */
  finished(): boolean;
  /** Earliest remaining scripted reinforcement, if any. */
  nextArrivalSeconds(): number | null;
}

/**
 * Deterministic deployment clock and encounter-local hostility policy.
 * It adds one physical combatant to the existing native fleet rather than
 * spawning a new parallel combat or duplicating a ship's simulation.
 */
// The lab wires pre-existing field AI and native FleetCombat; it owns no physics.
// eslint-disable-next-line max-lines-per-function
export function createFleetScenarioRuntime(
  roster: readonly FleetScenarioShip[],
  arena: StrategicCombatArenaOptions,
  seed: number,
  incident: FleetScenarioIncident,
  mapKind:
    'empty' | 'scattered' | 'asteroid_field' | 'scrap_scattered' | 'scrap_field' = 'asteroid_field'
): FleetScenarioRuntime {
  if (roster.filter((ship) => ship.group === 'player').length !== 1)
    throw new Error('FleetCombat simulation requires exactly one player ship');
  const all = new Map(roster.map((ship, index) => [ship.id, nativeShip(ship, index)]));
  if (all.size !== roster.length) throw new Error('FleetCombat ship IDs must be unique');
  const world = createFleetScenarioWorldBridge(
    roster,
    arena,
    seed,
    mapKind,
    new Map([...all].map(([id, ship]) => [id, ship.setup.hullHp]))
  );
  const conflict = createConflictManager(roster.map(participant));
  const identities = new Map(roster.map((ship) => [ship.id, ship.id]));
  const arrived = new Map<string, NativeDuelShip>();
  const joined = new Set<string>();
  const completedPairs = new Set<string>();
  let elapsedSeconds = 0;
  let fleet: ParallelNativeDuels | null = null;
  let completedEncounters = 0;
  let incidentTarget: string | null = null;
  const witnessed = new Set<string>();

  const atWorldPose = (id: string): NativeDuelShip => {
    const ship = all.get(id)!;
    const pose = world.pose(id);
    const npc = world.npc(id);
    const setup = npc ? { ...ship.setup, preferredTactic: world.defence(id) } : ship.setup;
    return pose ? { ...ship, setup, ...pose } : { ...ship, setup };
  };
  const observeIncident = (): void => {
    if (incident === 'none') return;
    if (!incidentTarget) {
      incidentTarget =
        roster.find((ship) => ship.group === 'npc' && arrived.has(ship.id))?.id ?? null;
    }
    if (!incidentTarget) return;
    const drones = roster
      .filter((ship) => {
        if (ship.group !== 'drone' || !arrived.has(ship.id) || witnessed.has(ship.id)) return false;
        const victim = atWorldPose(incidentTarget!);
        return !!victim.position && world.canDroneSee(ship.id, victim.position);
      })
      .map((ship) => ship.id);
    const attackerId = incident === 'player-attacks-npc' ? 'player' : incidentTarget;
    const victimId = incident === 'player-attacks-npc' ? incidentTarget : 'player';
    conflict.recordAttack({ attackerId, victimId, witnessedBy: drones });
    for (const id of drones) witnessed.add(id);
  };
  const connectWorldFighters = (): void => {
    const active = [...arrived.keys()]
      .filter((id) => world.isActive(id) && (all.get(id)?.setup.hullHp ?? 0) > 0)
      .map(atWorldPose);
    if (!fleet) {
      const pair = firstHostilePair(active, conflict.hostility(), world, incident, completedPairs);
      if (!pair) return;
      fleet = createDynamicFleetCombat(pair, arena, seed, conflict.hostility(), identities);
      for (const ship of pair) {
        joined.add(ship.id);
        world.markEngaged(ship.id, ship.id === pair[0].id ? pair[1].id : pair[0].id);
      }
    }
    for (const ship of active) {
      if (joined.has(ship.id)) continue;
      const target = active.find(
        (other) =>
          joined.has(other.id) &&
          other !== ship &&
          (conflict.isHostile(ship.id, other.id) || conflict.isHostile(other.id, ship.id)) &&
          canJoinWorldCombat(ship, other, world, incident)
      );
      if (!target) continue;
      if (fleet.addShip(ship, ship.id)) {
        joined.add(ship.id);
        world.markEngaged(ship.id, target.id);
      }
    }
  };
  const deploy = (): void => {
    for (const ship of roster) {
      if (arrived.has(ship.id) || ship.arrivalSeconds > elapsedSeconds + 1e-6) continue;
      world.deploy(ship.id);
      arrived.set(ship.id, atWorldPose(ship.id));
    }
    observeIncident();
    connectWorldFighters();
  };
  deploy();
  return {
    ships: roster,
    totalCount: roster.length,
    get elapsedSeconds() {
      return elapsedSeconds;
    },
    get arrivedCount() {
      return arrived.size;
    },
    get fleet() {
      return fleet;
    },
    get completedEncounters() {
      return completedEncounters;
    },
    get worldContacts() {
      return world.contacts();
    },
    navigatePlayer(point) {
      if (!fleet) world.navigatePlayer(point);
    },
    get playerNavigation() {
      return world.playerNavigation();
    },
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const dt = Math.min(seconds, 0.08);
      elapsedSeconds += dt;
      const pirateThreat = [...joined]
        .filter((id) => world.npc(id)?.pirate)
        .map((id) => fleet?.getActor(id)?.position)
        .find((position) => position !== undefined);
      const threat = pirateThreat ?? null;
      world.tick(dt, threat);
      deploy();
      if (fleet && !fleet.getSnapshot().finished) {
        fleet.setBystanders(world.contacts().filter((contact) => !joined.has(contact.id)));
        fleet.tick(dt);
        for (const id of joined) {
          const actor = fleet.getActor(id);
          if (actor) world.syncFromCombat(actor);
        }
      }
      if (fleet?.getSnapshot().finished) {
        // The world remains authoritative after the encounter: retain real hull
        // and shield damage for later contacts instead of rebuilding full HP.
        for (const id of joined) {
          const actor = fleet.getActor(id);
          const original = all.get(id);
          if (!actor || !original) continue;
          all.set(id, {
            ...original,
            setup: {
              ...original.setup,
              hullHp: Math.max(0, actor.hullHp),
              shieldHp: Math.max(0, actor.shieldHp),
            },
          });
        }
        const participants = [...joined].sort();
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            completedPairs.add([participants[i], participants[j]].join('|'));
          }
        }
        for (const id of joined) world.releaseCombat(id);
        joined.clear();
        fleet = null;
        completedEncounters++;
      }
    },
    finished() {
      return arrived.size === roster.length && fleet === null && completedEncounters > 0;
    },
    nextArrivalSeconds() {
      const times = roster
        .filter((ship) => !arrived.has(ship.id))
        .map((ship) => ship.arrivalSeconds);
      return times.length > 0 ? Math.min(...times) : null;
    },
  };
}

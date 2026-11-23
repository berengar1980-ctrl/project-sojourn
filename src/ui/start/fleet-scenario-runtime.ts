import { npcCombatant } from '../../systems/combat/npc-combatant-setup';
import type { DuelField } from '../../systems/combat/duel-arena-presets';
import { getShipDefinition } from '../../systems/ships';
import type { WorldPoint } from '../../core/world-types';
import {
  createCareerFleetEncounter,
  createNpcFleetEncounter,
  type CareerFleetEncounter,
  type CareerFleetWorldPose,
} from '../../systems/combat/career-fleet-encounter';
import type {
  NativeDuelShip,
  ParallelNativeDuels,
} from '../../systems/combat/parallel-native-duels';
import { duelCombatant } from './duel-combatant-setup';
import { createFleetScenarioWorldBridge } from './fleet-scenario-world-bridge';
import type { FleetScenarioIncident, FleetScenarioShip } from './fleet-scenario-roster';

type ScenarioWorld = ReturnType<typeof createFleetScenarioWorldBridge>;

function nativeShip(ship: FleetScenarioShip, index: number): NativeDuelShip {
  const definition = getShipDefinition(ship.draft.shipId);
  if (!definition) throw new Error('Unbekanntes FleetCombat-Schiff: ' + ship.draft.shipId);
  const setup = duelCombatant(index, ship.draft, definition);
  return {
    id: ship.id,
    team: ship.group,
    setup: {
      ...setup,
      id: ship.id,
      name: ship.id.toUpperCase() + ' · ' + ship.name,
      preferredTactic: 'fight',
    },
  };
}

export interface FleetScenarioRuntime {
  readonly fieldView: ScenarioWorld['fieldView'];
  readonly arena: DuelField['arena'];
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
  field: DuelField,
  seed: number,
  incident: FleetScenarioIncident
): FleetScenarioRuntime {
  const arena = {
    ...field.arena,
    asteroids: [...(field.arena.asteroids ?? [])],
    obstacles: [...(field.arena.obstacles ?? [])],
  };
  if (roster.filter((ship) => ship.group === 'player').length !== 1)
    throw new Error('FleetCombat simulation requires exactly one player ship');
  const all = new Map(roster.map((ship, index) => [ship.id, nativeShip(ship, index)]));
  if (all.size !== roster.length) throw new Error('FleetCombat ship IDs must be unique');
  const world = createFleetScenarioWorldBridge(
    roster,
    arena,
    seed,
    field,
    new Map([...all].map(([id, ship]) => [id, ship.setup.hullHp]))
  );
  for (const [id, ship] of all) {
    const npc = world.npc(id);
    const setup = npc && npcCombatant(npc);
    if (setup) all.set(id, { ...ship, setup });
  }
  const npcs = roster.flatMap((ship) => world.npc(ship.id) ?? []);
  const positions: CareerFleetWorldPose = {
    positionOf: (npc) => world.pose(npc.id)!.position,
    headingOf: (npc) => world.pose(npc.id)!.headingRadians,
    fieldWitness: (_location, npc, target) => {
      const pose = world.pose(npc.id);
      if (!world.isActive(npc.id) || !pose) return null;
      return !npc.id.startsWith('security-drone:') || world.canDroneSee(npc.id, target)
        ? pose
        : null;
    },
  };
  let encounter: CareerFleetEncounter | null = null;
  const arrived = new Map<string, NativeDuelShip>();
  const joined = new Set<string>();
  const completedPairs = new Set<string>();
  let elapsedSeconds = 0;
  let fleet: ParallelNativeDuels | null = null;
  let completedEncounters = 0;
  let pending: readonly [string, string] | null = null;
  let scripted = false;
  const requestCombat = (from: string, to: string) => {
    if (
      fleet ||
      pending ||
      !world.isActive(from) ||
      !world.isActive(to) ||
      completedPairs.has([from, to].sort().join('|'))
    )
      return false;
    pending = [from, to];
    return true;
  };
  const atWorldPose = (id: string): NativeDuelShip => {
    const ship = all.get(id)!;
    const pose = world.pose(id);
    return pose ? { ...ship, ...pose } : ship;
  };
  const observeIncident = (): void => {
    if (scripted || incident === 'none') return;
    const target = roster.find((ship) => ship.group === 'npc' && arrived.has(ship.id));
    if (!target) return;
    scripted =
      incident === 'player-attacks-npc'
        ? requestCombat('player', target.id)
        : requestCombat(target.id, 'player');
  };
  const connectWorldFighters = (): void => {
    if (!fleet) {
      if (!pending) return;
      const [initiator, victim] = pending;
      pending = null;
      const pair = (victim === 'player' ? [victim, initiator] : [initiator, victim]).map(
        atWorldPose
      );
      const first = pair[0]!;
      const second = pair[1]!;
      const map = {
        ...arena,
        attackerPosition: first.position!,
        defenderPosition: second.position!,
        attackerHeadingRadians: first.headingRadians!,
        defenderHeadingRadians: second.headingRadians!,
        attackerVelocity: first.velocity!,
        defenderVelocity: second.velocity!,
      };
      const enemy = world.npc(second.id)!;
      encounter =
        first.id === 'player'
          ? createCareerFleetEncounter(
              first.setup,
              enemy,
              npcs,
              initiator === 'player',
              map,
              positions
            )
          : createNpcFleetEncounter(world.npc(first.id)!, enemy, npcs, map, positions);
      fleet = encounter.fleet;
      for (const ship of pair) {
        joined.add(ship.id);
        world.markEngaged(ship.id, ship.id === first.id ? second.id : first.id);
      }
    }
    const anchor = fleet.duels[0]!.getSnapshot().defender;
    encounter!.joinNearby(
      anchor.position,
      npcs.filter((npc) => world.isActive(npc.id)),
      positions.positionOf,
      (npc) => {
        joined.add(npc.id);
        world.markEngaged(npc.id, anchor.id);
      }
    );
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
    arena,
    fieldView: world.fieldView,
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
      world.navigatePlayer(point);
    },
    get playerNavigation() {
      return world.playerNavigation();
    },
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const dt = Math.min(seconds, 0.08);
      elapsedSeconds += dt;
      deploy();
      world.tick(dt, requestCombat);
      if (fleet && !fleet.getSnapshot().finished) {
        fleet.setBystanders(world.contacts().filter((contact) => !joined.has(contact.id)));
        encounter!.tick(dt);
        const frame = fleet.getSnapshot();
        world.syncCombatField(frame.duels[0]!);
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
        const bodies = fleet.getSnapshot().duels[0]!.arena.asteroids ?? [];
        arena.asteroids.splice(0, arena.asteroids.length, ...bodies);
        const remaining = new Set(bodies.map((body) => body.id));
        arena.obstacles = arena.obstacles.filter((obstacle) => remaining.has(obstacle.id));
        const participants = [...joined].sort();
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            completedPairs.add([participants[i], participants[j]].join('|'));
          }
        }
        const escaped = new Set(fleet.getSnapshot().escapedShipIds);
        for (const id of joined)
          world.releaseCombat(id, escaped.has(id) || (all.get(id)?.setup.hullHp ?? 0) <= 0);
        joined.clear();
        encounter = null;
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

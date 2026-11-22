import { getShipDefinition } from '../../systems/ships';
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
import type { FleetScenarioIncident, FleetScenarioShip } from './fleet-scenario-roster';

function firstHostilePair(
  available: readonly NativeDuelShip[],
  hostility: (source: string, target: string) => boolean
): readonly [NativeDuelShip, NativeDuelShip] | null {
  for (const source of available) {
    const target = available.find(
      (other) =>
        other !== source && (hostility(source.id, other.id) || hostility(other.id, source.id))
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
      preferredTactic:
        ship.group === 'npc' && (definition.role === 'mining' || definition.role === 'freighter')
          ? 'flee'
          : 'fight',
    },
  };
}

export interface FleetScenarioRuntime {
  readonly ships: readonly FleetScenarioShip[];
  readonly totalCount: number;
  readonly elapsedSeconds: number;
  readonly arrivedCount: number;
  readonly fleet: ParallelNativeDuels | null;
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
export function createFleetScenarioRuntime(
  roster: readonly FleetScenarioShip[],
  arena: StrategicCombatArenaOptions,
  seed: number,
  incident: FleetScenarioIncident
): FleetScenarioRuntime {
  if (roster.filter((ship) => ship.group === 'player').length !== 1)
    throw new Error('FleetCombat simulation requires exactly one player ship');
  const all = new Map(roster.map((ship, index) => [ship.id, nativeShip(ship, index)]));
  if (all.size !== roster.length) throw new Error('FleetCombat ship IDs must be unique');
  const conflict = createConflictManager(roster.map(participant));
  const identities = new Map(roster.map((ship) => [ship.id, ship.id]));
  const arrived = new Map<string, NativeDuelShip>();
  const joined = new Set<string>();
  let elapsedSeconds = 0;
  let fleet: ParallelNativeDuels | null = null;
  let incidentTarget: string | null = null;
  const witnessed = new Set<string>();

  const observeIncident = (): void => {
    if (incident === 'none') return;
    if (!incidentTarget) {
      incidentTarget =
        roster.find((ship) => ship.group === 'npc' && arrived.has(ship.id))?.id ?? null;
    }
    if (!incidentTarget) return;
    const drones = roster
      .filter((ship) => ship.group === 'drone' && arrived.has(ship.id) && !witnessed.has(ship.id))
      .map((ship) => ship.id);
    const attackerId = incident === 'player-attacks-npc' ? 'player' : incidentTarget;
    const victimId = incident === 'player-attacks-npc' ? incidentTarget : 'player';
    conflict.recordAttack({ attackerId, victimId, witnessedBy: drones });
    for (const id of drones) witnessed.add(id);
  };

  const attachArrivals = (): void => {
    if (!fleet) {
      const pair = firstHostilePair([...arrived.values()], conflict.hostility());
      if (!pair) return;
      fleet = createDynamicFleetCombat(pair, arena, seed, conflict.hostility(), identities);
      joined.add(pair[0].id);
      joined.add(pair[1].id);
    }
    // A neutral participant may have to wait until a pirate or other enemy joins.
    // It remains queued rather than being silently discarded.
    let changed = true;
    while (changed) {
      changed = false;
      for (const ship of arrived.values()) {
        if (joined.has(ship.id)) continue;
        if (fleet.addShip(ship, ship.id)) {
          joined.add(ship.id);
          changed = true;
        }
      }
    }
  };

  const deploy = (): void => {
    for (const ship of roster) {
      if (arrived.has(ship.id) || ship.arrivalSeconds > elapsedSeconds + 1e-6) continue;
      arrived.set(ship.id, all.get(ship.id)!);
    }
    observeIncident();
    attachArrivals();
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
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const dt = Math.min(seconds, 0.08);
      elapsedSeconds += dt;
      deploy();
      if (fleet && !fleet.getSnapshot().finished) fleet.tick(dt);
    },
    finished() {
      return arrived.size === roster.length && (fleet?.getSnapshot().finished ?? true);
    },
    nextArrivalSeconds() {
      const times = roster
        .filter((ship) => !arrived.has(ship.id))
        .map((ship) => ship.arrivalSeconds);
      return times.length > 0 ? Math.min(...times) : null;
    },
  };
}

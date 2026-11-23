import {
  createParallelNativeDuels,
  type NativeDuelShip,
  type ParallelNativeDuels,
  type ParallelNativeDuelSnapshot,
} from './parallel-native-duels';
import { defaultFleetHostility, type FleetHostility } from './native-fleet-hostility';
import type {
  StrategicCombatArenaOptions,
  StrategicCombatSnapshot,
} from './strategic-combat-types';

/**
 * Unified combat entrance for campaign and manual PvP encounters.
 * Both call exactly the same native 1v1 services and fleet-frame coordinator.
 * Teams/organizations may be arbitrary; hostility is per ship when desired.
 */
export function createDynamicFleetCombat(
  ships: readonly NativeDuelShip[],
  arena: StrategicCombatArenaOptions,
  seed = 1,
  hostility: FleetHostility = defaultFleetHostility,
  conflictKeys: ReadonlyMap<string, string> = new Map()
): ParallelNativeDuels {
  if (ships.length < 2) throw new Error('A native fleet encounter requires two ships');
  if (new Set(ships.map((ship) => ship.setup.id)).size !== ships.length)
    throw new Error('Native fleet encounter ship IDs must be unique');
  const key = (ship: NativeDuelShip): string => conflictKeys.get(ship.setup.id) ?? ship.team;
  // Preserve the exact legacy 1v1 pairing and 5v5 scheduling in the PvP lab.
  // Both paths still return the SAME native fleet simulation implementation.
  if (
    ships.every((ship) => ship.team === 'a' || ship.team === 'b') &&
    ships.filter((ship) => ship.team === 'a').length <= 5 &&
    ships.filter((ship) => ship.team === 'b').length <= 5 &&
    ships.some((ship) => ship.team === 'a') &&
    ships.some((ship) => ship.team === 'b') &&
    ships.every((ship) =>
      ships.some(
        (other) =>
          other !== ship && (hostility(key(ship), key(other)) || hostility(key(other), key(ship)))
      )
    )
  ) {
    return createParallelNativeDuels(ships, arena, seed, hostility, conflictKeys);
  }
  const firstIndex = ships.findIndex((ship, index) =>
    ships.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        (hostility(key(ship), key(other)) || hostility(key(other), key(ship)))
    )
  );
  if (firstIndex < 0) throw new Error('A fleet encounter needs at least two hostile participants');
  const opponentIndex = ships.findIndex(
    (other, index) =>
      index !== firstIndex &&
      (hostility(key(ships[firstIndex]!), key(other)) ||
        hostility(key(other), key(ships[firstIndex]!)))
  );
  const first = ships[firstIndex]!;
  const second = ships[opponentIndex]!;
  const native = createParallelNativeDuels(
    [
      { ...first, team: 'a' },
      { ...second, team: 'b' },
    ],
    arena,
    seed,
    hostility,
    new Map([
      [first.setup.id, key(first)],
      [second.setup.id, key(second)],
    ])
  );
  // The initial duel creates exactly two owning actors. Each additional
  // participant is attached once through the SAME native service coordinator.
  for (const ship of ships) {
    if (ship === first || ship === second) continue;
    if (!native.addShip(ship, key(ship))) {
      throw new Error('Fleet ship has no hostile target: ' + ship.setup.id);
    }
  }
  return native;
}

/** Every native driver whose actors are mirrored into a local field. */
export function localFieldDuels(
  background: readonly StrategicCombatSnapshot[],
  fleet: ParallelNativeDuelSnapshot | null | undefined
): readonly StrategicCombatSnapshot[] {
  return fleet ? [...background, ...fleet.duels, ...fleet.supporters] : background;
}

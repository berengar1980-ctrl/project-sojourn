import { createParallelNativeDuels, type NativeDuelShip, type ParallelNativeDuels } from './parallel-native-duels';
import { defaultFleetHostility, type FleetHostility } from './native-fleet-hostility';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';

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
    [{ ...first, team: 'a' }, { ...second, team: 'b' }],
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

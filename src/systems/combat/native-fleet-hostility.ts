import type { MutableCombatant } from './strategic-combat-types';

export type FleetHostility = (sourceFaction: string, targetFaction: string) => boolean;

export const defaultFleetHostility: FleetHostility = (source, target) => source !== target;

export function isFleetHostile(
  source: MutableCombatant,
  target: MutableCombatant,
  factions: ReadonlyMap<string, string>,
  hostility: FleetHostility
): boolean {
  const sourceFaction = factions.get(source.setup.id);
  const targetFaction = factions.get(target.setup.id);
  return (
    sourceFaction !== undefined &&
    targetFaction !== undefined &&
    hostility(sourceFaction, targetFaction)
  );
}

/** Finish only when no hostile pair is still alive, regardless of faction count. */
export function hasActiveFleetHostilities(
  ships: readonly MutableCombatant[],
  escaped: ReadonlySet<string>,
  factions: ReadonlyMap<string, string>,
  hostility: FleetHostility
): boolean {
  const live = ships.filter((ship) => ship.hullHp > 0 && !escaped.has(ship.setup.id));
  return live.some((source) =>
    live.some(
      (target) =>
        source !== target &&
        (isFleetHostile(source, target, factions, hostility) ||
          isFleetHostile(target, source, factions, hostility))
    )
  );
}

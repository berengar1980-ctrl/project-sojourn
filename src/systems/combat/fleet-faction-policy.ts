/**
 * Local-combat hostility policy shared by the FleetCombat test harness and
 * its eventual career encounter adapter. Factions are NOT two combat sides.
 *
 * Pirates A and B can attack each other. Civilian ships, player ships and
 * security drones are non-hostile to each other. A civilian must still be
 * explicitly ordered to defend itself before it acquires a target.
 */
const protectedFactions = new Set(['player', 'civilian', 'security']);
const pirateFactions = new Set(['pirate-a', 'pirate-b']);

export function isFleetHostile(sourceFaction: string, targetFaction: string): boolean {
  if (sourceFaction === targetFaction) return false;
  if (protectedFactions.has(sourceFaction) && protectedFactions.has(targetFaction)) return false;
  if (pirateFactions.has(sourceFaction) || pirateFactions.has(targetFaction)) return true;
  // Other faction IDs are supported by the engine, without granting an
  // unrecognized faction an implicit alliance with civilians or pirates.
  return true;
}

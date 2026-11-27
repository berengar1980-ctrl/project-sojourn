import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';

export function groupDuelsBySeed(duels: readonly StrategicCombatSnapshot[]) {
  const groups = new Map<number, StrategicCombatSnapshot[]>();
  for (const duel of duels) {
    const seed = duel.arena.backdropSeed;
    if (seed === undefined) continue;
    const group = groups.get(seed);
    if (group) group.push(duel);
    else groups.set(seed, [duel]);
  }
  return groups;
}

export function shouldTickFieldDrone(
  locationId: string,
  activeCombat: StrategicCombatSnapshot | null,
  finished: readonly StrategicCombatSnapshot[],
  duels: readonly StrategicCombatSnapshot[]
): boolean {
  const droneId = 'security-drone:' + locationId;
  const droneInDuel = (duel: StrategicCombatSnapshot) =>
    (duel.attacker.id === droneId && duel.attacker.hullHp > 0) ||
    (duel.defender.id === droneId && duel.defender.hullHp > 0);
  return (
    activeCombat?.defender.id !== droneId && !finished.some(droneInDuel) && !duels.some(droneInDuel)
  );
}

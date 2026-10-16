import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { distance, EDGE_PADDING } from './strategic-combat-geometry';

export function safeEscapeSeparation(arena: StrategicCombatArenaOptions): number {
  return Math.max(350, Math.min(600, arena.width * 0.2));
}

/** A camped exit is not an escape. Select a different physical edge corridor. */
export function rerouteBlockedEscape(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  const gate = ship.escapeGate ?? arena.exitPoint;
  if (ship.tactic !== 'flee' || !gate || ship.subsystems.engine <= 0) return false;
  if (distance(ship.position, gate) > 105) return false;
  if (distance(ship.position, enemy.position) >= safeEscapeSeparation(arena)) return false;

  const margin = EDGE_PADDING;
  const options = [
    { x: margin, y: arena.height * 0.25 },
    { x: margin, y: arena.height * 0.75 },
    { x: arena.width - margin, y: arena.height * 0.25 },
    { x: arena.width - margin, y: arena.height * 0.75 },
    { x: arena.width * 0.25, y: margin },
    { x: arena.width * 0.75, y: margin },
    { x: arena.width * 0.25, y: arena.height - margin },
    { x: arena.width * 0.75, y: arena.height - margin },
  ];
  const enemyDx = enemy.position.x - ship.position.x;
  const enemyDy = enemy.position.y - ship.position.y;
  const enemyRange = Math.max(1, Math.hypot(enemyDx, enemyDy));
  const score = (point: (typeof options)[number]): number => {
    const dx = point.x - ship.position.x;
    const dy = point.y - ship.position.y;
    const travel = Math.max(1, Math.hypot(dx, dy));
    const towardThreat = (dx * enemyDx + dy * enemyDy) / (travel * enemyRange);
    // Do not reroute straight through the ship camping the current gate.
    const exposure = Math.max(0, towardThreat) * 1500;
    return distance(point, enemy.position) - travel * 0.4 - exposure;
  };
  const replacement = options
    .filter((candidate) => distance(candidate, gate) > 250)
    .sort((left, right) => score(right) - score(left))[0];
  if (!replacement) return false;
  ship.escapeGate = replacement;
  ship.asteroidRoute = [];
  ship.nextAsteroidRouteAt = 0;
  return true;
}

export function runtimeCombatantEscaped(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  if (combatant.tactic !== 'flee') return false;
  if (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    enemy.subsystems.tractor > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  )
    return false;
  const gate = combatant.escapeGate ?? arena.exitPoint;
  const atExit = gate !== undefined && distance(combatant.position, gate) <= 90;
  const safeSeparation = safeEscapeSeparation(arena);
  return atExit && distance(combatant.position, enemy.position) > safeSeparation;
}

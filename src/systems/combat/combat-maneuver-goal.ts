import type { WorldPoint } from '../../core/world-types';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';
import { clamp, distance } from './strategic-combat-geometry';

/** Keep committed destinations reachable without completing zero-length edge maneuvers. */
export function combatManeuverGoal(
  position: WorldPoint,
  enemy: WorldPoint,
  direction: WorldPoint,
  length: number,
  arena: StrategicCombatArenaOptions
): WorldPoint {
  const insetX = Math.min(400, arena.width * 0.25);
  const insetY = Math.min(400, arena.height * 0.25);
  const project = (vector: WorldPoint): WorldPoint => ({
    x: clamp(position.x + vector.x * length, insetX, arena.width - insetX),
    y: clamp(position.y + vector.y * length, insetY, arena.height - insetY),
  });
  const goal = project(direction);
  if (distance(position, goal) >= 150) return goal;
  // An outward course blocked by the field edge becomes a lateral passage.
  // Choose once; subsequent enemy motion does not move this destination.
  const lanes = [
    project({ x: -direction.y, y: direction.x }),
    project({ x: direction.y, y: -direction.x }),
  ].filter((point) => distance(position, point) >= 150);
  lanes.sort((a, b) => distance(b, enemy) - distance(a, enemy));
  return lanes[0] ?? { x: arena.width / 2, y: arena.height / 2 };
}

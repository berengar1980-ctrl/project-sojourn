import type { CombatPoint, StrategicCombatArenaOptions } from './strategic-combat-types';

type PreparedArena = Pick<StrategicCombatArenaOptions, 'width' | 'height' | 'asteroids'>;
const GRID_STEP = 85;
const BORDER = 160;
const LARGE_CLEARANCE = 145;
const SMALL_CLEARANCE = 65;

/** Choose locations in the existing field; never clear or move real obstacles. */
export function clearCombatSpawn(
  arena: PreparedArena,
  preferred: CombatPoint,
  exclude: CombatPoint | null = null
): CombatPoint {
  const bodies = arena.asteroids ?? [];
  const clear = (point: CombatPoint): boolean =>
    (!exclude || Math.hypot(point.x - exclude.x, point.y - exclude.y) >= 900) &&
    bodies.every(
      (rock) =>
        Math.hypot(point.x - rock.position.x, point.y - rock.position.y) >=
        rock.radius + (rock.kind === 'resource' ? LARGE_CLEARANCE : SMALL_CLEARANCE)
    );
  if (clear(preferred)) return { ...preferred };
  let selected: CombatPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = BORDER; y <= arena.height - BORDER; y += GRID_STEP) {
    for (let x = BORDER; x <= arena.width - BORDER; x += GRID_STEP) {
      const point = { x, y };
      if (!clear(point)) continue;
      const distance = Math.hypot(x - preferred.x, y - preferred.y);
      if (distance >= bestDistance) continue;
      selected = point;
      bestDistance = distance;
    }
  }
  if (!selected) throw new Error('Kein freier Schiffsstartplatz im generierten Kampffeld');
  return selected;
}

export function withClearCombatSpawns(
  arena: StrategicCombatArenaOptions
): StrategicCombatArenaOptions {
  const attacker = clearCombatSpawn(arena, {
    x: arena.width * 0.28,
    y: arena.height * 0.46,
  });
  const defender = clearCombatSpawn(
    arena,
    { x: arena.width * 0.72, y: arena.height * 0.54 },
    attacker
  );
  return { ...arena, attackerPosition: attacker, defenderPosition: defender };
}

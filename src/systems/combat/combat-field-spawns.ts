import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';

type PreparedArena = Pick<StrategicCombatArenaOptions, 'width' | 'height' | 'asteroids'>;
const GRID_STEP = 85;
const BORDER = 160;
const LARGE_CLEARANCE = 145;
const SMALL_CLEARANCE = 65;

/** Choose locations in the existing field; never clear or move real obstacles. */
function findClearCombatSpawn(
  arena: PreparedArena,
  preferred: CombatPoint,
  exclude: CombatPoint | null = null,
  available: (point: CombatPoint) => boolean = () => true
): CombatPoint | null {
  const bodies = arena.asteroids ?? [];
  const clear = (point: CombatPoint): boolean =>
    available(point) &&
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
  return selected;
}

export function clearCombatSpawn(
  arena: PreparedArena,
  preferred: CombatPoint,
  exclude: CombatPoint | null = null
): CombatPoint {
  const selected = findClearCombatSpawn(arena, preferred, exclude);
  if (!selected) throw new Error('Kein freier Schiffsstartplatz im generierten Kampffeld');
  return selected;
}

interface FleetArrivalSpace {
  readonly arena: StrategicCombatArenaOptions;
  readonly actors: readonly MutableCombatant[];
  readonly escaped: ReadonlySet<string>;
  readonly radii: ReadonlyMap<string, number>;
  readonly bystanders: readonly StrategicCombatBystander[];
}

export function fleetArrivalPosition(
  space: FleetArrivalSpace,
  livePosition?: CombatPoint
): CombatPoint | null {
  const { arena, actors, radii, escaped, bystanders } = space;
  if (livePosition) {
    const { x, y } = livePosition;
    return Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      y >= 0 &&
      x <= arena.width &&
      y <= arena.height
      ? livePosition
      : null;
  }
  const blockers = [
    ...actors
      .filter((actor) => actor.hullHp > 0 && !escaped.has(actor.setup.id))
      .map((actor) => ({
        position: actor.position,
        radius: (radii.get(actor.setup.id) ?? 30) + SMALL_CLEARANCE,
      })),
    ...bystanders.map((entry) => ({ position: entry.position, radius: 95 })),
    ...(arena.obstacles ?? []).map((blocker) => ({
      position: blocker.position,
      radius: blocker.radius + SMALL_CLEARANCE,
    })),
  ];
  return findClearCombatSpawn(
    arena,
    { x: arena.width * 0.5, y: (arena.height * ((actors.length % 9) + 1)) / 10 },
    null,
    (point) =>
      blockers.every(
        (other) =>
          Math.hypot(point.x - other.position.x, point.y - other.position.y) >= other.radius
      )
  );
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

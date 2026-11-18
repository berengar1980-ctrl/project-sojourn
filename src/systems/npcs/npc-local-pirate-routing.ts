import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

/** Keep a chosen flank until reached instead of picking a new side every tick. */
export interface PirateDetour {
  readonly point: WorldPoint;
  readonly obstacleId: string;
}

const CLEARANCE = 105;
const REACHED_METERS = 52;

function segmentClear(
  start: WorldPoint,
  end: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  exclude?: string
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length2 = Math.max(1, dx * dx + dy * dy);
  return !asteroids.some((rock) => {
    if (!rock.routeBlocking || rock.id === exclude) return false;
    const t = Math.max(
      0,
      Math.min(1, ((rock.position.x - start.x) * dx + (rock.position.y - start.y) * dy) / length2)
    );
    const x = start.x + dx * t - rock.position.x;
    const y = start.y + dy * t - rock.position.y;
    return x * x + y * y < (rock.radius + CLEARANCE) ** 2;
  });
}

function firstBlocker(
  start: WorldPoint,
  end: WorldPoint,
  asteroids: readonly LocalAsteroid[]
): LocalAsteroid | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length2 = Math.max(1, dx * dx + dy * dy);
  let nearest = Infinity;
  let result: LocalAsteroid | null = null;
  for (const rock of asteroids) {
    if (!rock.routeBlocking) continue;
    const t = Math.max(
      0,
      Math.min(1, ((rock.position.x - start.x) * dx + (rock.position.y - start.y) * dy) / length2)
    );
    const x = start.x + t * dx - rock.position.x;
    const y = start.y + t * dy - rock.position.y;
    if (x * x + y * y >= (rock.radius + CLEARANCE) ** 2 || t >= nearest) continue;
    nearest = t;
    result = rock;
  }
  return result;
}

function flank(
  start: WorldPoint,
  target: WorldPoint,
  rock: LocalAsteroid,
  asteroids: readonly LocalAsteroid[],
  width: number,
  height: number
): PirateDetour {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const radius = rock.radius + CLEARANCE + 60;
  const options = [-1, 1].map((side) => ({
    x: Math.max(30, Math.min(width - 30, rock.position.x + (-dy / length) * side * radius)),
    y: Math.max(30, Math.min(height - 30, rock.position.y + (dx / length) * side * radius)),
  }));
  const score = (point: WorldPoint): number =>
    (segmentClear(start, point, asteroids, rock.id) ? 0 : 100000) +
    (segmentClear(point, target, asteroids, rock.id) ? 0 : 10000) +
    Math.hypot(point.x - start.x, point.y - start.y) +
    Math.hypot(target.x - point.x, target.y - point.y);
  options.sort((a, b) => score(a) - score(b));
  return { point: options[0]!, obstacleId: rock.id };
}

export function pirateRouteDestination(
  position: WorldPoint,
  target: WorldPoint,
  previous: PirateDetour | null,
  asteroids: readonly LocalAsteroid[],
  width: number,
  height: number
): { destination: WorldPoint; detour: PirateDetour | null } {
  const closeToFlank =
    previous &&
    Math.hypot(position.x - previous.point.x, position.y - previous.point.y) < REACHED_METERS;
  // A committed detour survives moving targets and avoids frame-to-frame flank reversal.
  if (previous && !closeToFlank) {
    const rock = asteroids.find((entry) => entry.id === previous.obstacleId);
    if (rock && rock.routeBlocking) return { destination: previous.point, detour: previous };
  }
  const rock = firstBlocker(position, target, asteroids);
  if (!rock) return { destination: target, detour: null };
  const detour = flank(position, target, rock, asteroids, width, height);
  return { destination: detour.point, detour };
}

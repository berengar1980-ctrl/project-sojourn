import type { WorldPoint } from '../../core/world-types';

export interface FieldRouteObstacle {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
}

interface FieldRouteShip {
  position: WorldPoint;
  headingRadians: number;
  speed: number;
}

interface Detour {
  readonly obstacleId: string;
  readonly waypoint: WorldPoint;
  readonly target: WorldPoint;
}

const detours = new WeakMap<FieldRouteShip, Detour>();

/** Shared collision-aware local-field routing for mining, salvage and security traffic. */
function blocked(
  start: WorldPoint,
  target: WorldPoint,
  obstacle: FieldRouteObstacle,
  clearance: number
): number | null {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1) return null;
  const t = Math.max(
    0,
    Math.min(1, ((obstacle.position.x - start.x) * dx + (obstacle.position.y - start.y) * dy) / lengthSq)
  );
  const x = start.x + dx * t - obstacle.position.x;
  const y = start.y + dy * t - obstacle.position.y;
  return x * x + y * y < (obstacle.radius + clearance) ** 2 ? t : null;
}

function firstBlocker(
  start: WorldPoint,
  target: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  excludedId?: string
): FieldRouteObstacle | null {
  let nearest = Infinity;
  let result: FieldRouteObstacle | null = null;
  for (const obstacle of obstacles) {
    if (obstacle.id === excludedId) continue;
    const t = blocked(start, target, obstacle, clearance);
    if (t !== null && t < nearest) {
      nearest = t;
      result = obstacle;
    }
  }
  return result;
}

function chooseDetour(
  start: WorldPoint,
  target: WorldPoint,
  obstacle: FieldRouteObstacle,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): WorldPoint {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const radius = obstacle.radius + clearance + 45;
  // Side-stepping perpendicular to the blocked segment retains the PvP world's
  // metre scale while using native solid-body radii.
  const options = [-1, 1].map((side) => ({
    x: obstacle.position.x + (-dy / length) * radius * side,
    y: obstacle.position.y + (dx / length) * radius * side,
  }));
  const score = (point: WorldPoint): number =>
    (firstBlocker(start, point, obstacles, clearance, obstacle.id) ? 100000 : 0) +
    (firstBlocker(point, target, obstacles, clearance, obstacle.id) ? 10000 : 0) +
    Math.hypot(point.x - start.x, point.y - start.y) +
    Math.hypot(target.x - point.x, target.y - point.y);
  options.sort((a, b) => score(a) - score(b));
  return options[0]!;
}

export function fieldRouteTarget(
  ship: FieldRouteShip,
  target: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): WorldPoint {
  const previous = detours.get(ship);
  if (previous) {
    const reached = Math.hypot(
      ship.position.x - previous.waypoint.x,
      ship.position.y - previous.waypoint.y
    ) < Math.max(18, clearance * 0.45);
    const changed = Math.hypot(
      target.x - previous.target.x,
      target.y - previous.target.y
    ) > 130;
    if (!reached && !changed && obstacles.some((rock) => rock.id === previous.obstacleId)) {
      return previous.waypoint;
    }
    detours.delete(ship);
  }
  const rock = firstBlocker(ship.position, target, obstacles, clearance);
  if (!rock) return target;
  const waypoint = chooseDetour(ship.position, target, rock, obstacles, clearance);
  detours.set(ship, { obstacleId: rock.id, waypoint, target: { ...target } });
  return waypoint;
}

export function moveFieldShip(
  ship: FieldRouteShip,
  target: WorldPoint,
  speed: number,
  dt: number,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): boolean {
  const waypoint = fieldRouteTarget(ship, target, obstacles, clearance);
  const dx = waypoint.x - ship.position.x;
  const dy = waypoint.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(0, speed) * Math.max(0, dt);
  ship.headingRadians = Math.atan2(dy, dx);
  if (distance <= Math.max(2, step)) {
    ship.position = { ...waypoint };
    ship.speed = 0;
    return waypoint === target || Math.hypot(
      target.x - waypoint.x,
      target.y - waypoint.y
    ) < 2;
  }
  ship.position = {
    x: ship.position.x + (dx / distance) * step,
    y: ship.position.y + (dy / distance) * step,
  };
  ship.speed = speed;
  return false;
}

import type { FieldTrafficIntent, FieldRouteObstacle } from '../../core/field-traffic-types';
import type { WorldPoint } from '../../core/world-types';
import { clampedSegmentProjection, squaredDistance } from '../../core/field-geometry';

interface TrafficPose {
  readonly npcId?: string;
  readonly phase?: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed?: number;
  readonly routeState?: { readonly target: WorldPoint };
}

interface TrafficProgress {
  id: string;
  priority: number;
  fixed: boolean;
  target?: WorldPoint;
  direction?: WorldPoint;
  waiting: number;
  sampleSeconds: number;
  sampleDistance: number;
  encounters: WeakMap<TrafficProgress, string>;
  escapeBlockedSeconds: number;
  escape?: WorldPoint;
  bounds?: { readonly width: number; readonly height: number };
}

const progress = new WeakMap<object, TrafficProgress>();
const intentOwners = new WeakMap<FieldTrafficIntent, TrafficProgress>();

function state(pose: TrafficPose, id = pose.npcId ?? ''): TrafficProgress {
  const existing = progress.get(pose);
  if (existing) {
    if (id) existing.id = id;
    return existing;
  }
  const entry: TrafficProgress = {
    id,
    priority: 1,
    fixed: false,
    waiting: 0,
    sampleSeconds: 0,
    sampleDistance: 0,
    encounters: new WeakMap(),
    escapeBlockedSeconds: 0,
  };
  progress.set(pose, entry);
  return entry;
}

export function registerTrafficPose(
  pose: TrafficPose,
  id: string,
  fixed = false,
  bounds?: { readonly width: number; readonly height: number },
  departing = false
): void {
  const entry = state(pose, id);
  entry.fixed = fixed;
  if (bounds) entry.bounds = bounds;
  entry.priority = departing || pose.phase === 'exiting' ? 2 : 1;
  if (fixed || pose.phase === 'mining' || pose.phase === 'salvaging' || pose.phase === 'scanning') {
    delete entry.direction;
    delete entry.escape;
    entry.encounters = new WeakMap();
    entry.waiting = 0;
  }
}

export function trafficIntent(pose: TrafficPose, id: string): FieldTrafficIntent {
  const entry = state(pose, id);
  const intent: FieldTrafficIntent = {
    priority: entry.priority,
    movable: !entry.fixed && Boolean(entry.direction),
    waitingSeconds: entry.waiting,
    ...(entry.direction ? { direction: entry.direction } : {}),
  };
  intentOwners.set(intent, entry);
  return intent;
}

export function beginTrafficLeg(pose: TrafficPose, target: WorldPoint, id?: string): void {
  const entry = state(pose, id);
  if (entry.target && squaredDistance(entry.target, target) > 80 ** 2) {
    entry.waiting = 0;
    entry.sampleSeconds = 0;
    delete entry.escape;
    entry.encounters = new WeakMap();
  }
  entry.target = target;
  const dx = target.x - pose.position.x;
  const dy = target.y - pose.position.y;
  const length = Math.hypot(dx, dy);
  if (length > 0.001) entry.direction = { x: dx / length, y: dy / length };
  else delete entry.direction;
  if (entry.sampleSeconds === 0) entry.sampleDistance = length;
}

export function endTrafficLeg(pose: TrafficPose): void {
  const entry = progress.get(pose);
  if (!entry) return;
  delete entry.direction;
  delete entry.target;
  entry.encounters = new WeakMap();
  delete entry.escape;
  entry.waiting = 0;
  entry.sampleSeconds = 0;
}

/** A stable tie-breaker for equally ranked ships at the start of an encounter. */
export function hasTrafficPriority(
  selfId: string,
  self: FieldTrafficIntent,
  otherId: string,
  other: FieldTrafficIntent
): boolean {
  if (self.priority !== other.priority) return self.priority > other.priority;
  const selfWait = Math.floor(self.waitingSeconds * 4);
  const otherWait = Math.floor(other.waitingSeconds * 4);
  if (selfWait !== otherWait) return selfWait > otherWait;
  return selfId < otherId;
}

export function yieldsToTraffic(
  pose: TrafficPose,
  obstacle: FieldRouteObstacle,
  clearance = 65
): boolean {
  const entry = state(pose);
  const other = obstacle.intent;
  if (!entry.id || !other) return true;
  const owner = intentOwners.get(other);
  const nearby =
    squaredDistance(pose.position, obstacle.position) < (clearance + obstacle.radius + 180) ** 2;
  if (!nearby || !other.movable) {
    if (owner) {
      entry.encounters.delete(owner);
      owner.encounters.delete(entry);
    }
    return true;
  }
  if (!owner)
    return !hasTrafficPriority(entry.id, trafficIntent(pose, entry.id), obstacle.id, other);
  const winner = entry.encounters.get(owner) ?? owner.encounters.get(entry);
  if (winner) return winner !== entry.id;
  const selected = hasTrafficPriority(entry.id, trafficIntent(pose, entry.id), obstacle.id, other)
    ? entry.id
    : obstacle.id;
  entry.encounters.set(owner, selected);
  owner.encounters.set(entry, selected);
  return selected !== entry.id;
}

export function noteTrafficProgress(pose: TrafficPose, dt: number, blocked: boolean): void {
  const entry = state(pose);
  if (blocked) {
    entry.waiting += dt;
    if (entry.escape) entry.escapeBlockedSeconds += dt;
  } else entry.escapeBlockedSeconds = 0;
  if (!entry.target) return;
  entry.sampleSeconds += dt;
  if (entry.sampleSeconds < 2) return;
  const remaining = Math.sqrt(squaredDistance(pose.position, entry.target));
  if (entry.sampleDistance - remaining > 8 && !blocked) entry.waiting = 0;
  else if (!blocked) entry.waiting += entry.sampleSeconds;
  entry.sampleSeconds = 0;
  entry.sampleDistance = remaining;
}

function escapePathClear(
  start: WorldPoint,
  end: WorldPoint,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): boolean {
  return obstacles.every((obstacle) => {
    const radius = obstacle.radius + clearance;
    const ax = start.x - obstacle.position.x;
    const ay = start.y - obstacle.position.y;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const initial = ax * ax + ay * ay;
    if (initial < radius * radius) {
      return ax * dx + ay * dy >= 0 && squaredDistance(end, obstacle.position) > initial;
    }
    const length = dx * dx + dy * dy;
    const t = clampedSegmentProjection(obstacle.position, start, dx, dy, Math.max(1, length));
    return (ax + dx * t) ** 2 + (ay + dy * t) ** 2 >= radius * radius;
  });
}

function insideTrafficBounds(pose: TrafficPose, point: WorldPoint): boolean {
  if (point.x < 0 || point.y < 0) return false;
  const bounds = state(pose).bounds;
  return !bounds || (point.x <= bounds.width && point.y <= bounds.height);
}

function escapePoint(
  pose: TrafficPose,
  blocker: FieldRouteObstacle,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number,
  direction: WorldPoint
): WorldPoint | undefined {
  const length = Math.max(80, blocker.radius + clearance + 24);
  // Screen coordinates: right of a forward vector is (-y, x).
  for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const x = direction.x * Math.cos(angle) - direction.y * Math.sin(angle);
    const y = direction.x * Math.sin(angle) + direction.y * Math.cos(angle);
    const point = { x: pose.position.x + x * length, y: pose.position.y + y * length };
    if (!insideTrafficBounds(pose, point)) continue;
    if (escapePathClear(pose.position, point, obstacles, clearance)) return point;
  }
  return undefined;
}

/** One committed local escape, never a teleport or a second movement step. */
export function needsTrafficEscape(pose: TrafficPose): boolean {
  const entry = progress.get(pose);
  return Boolean(entry && !entry.fixed && (entry.escape || entry.waiting >= 1.5));
}

export function trafficEscapeWaypoint(
  pose: TrafficPose,
  obstacles: readonly FieldRouteObstacle[],
  clearance: number
): WorldPoint | null | undefined {
  const entry = state(pose);
  if (entry.escape) {
    if (squaredDistance(pose.position, entry.escape) > 4) {
      if (escapePathClear(pose.position, entry.escape, obstacles, clearance)) return entry.escape;
      if (entry.escapeBlockedSeconds < 2) return null;
    }
    delete entry.escape;
    entry.waiting = 0;
    entry.sampleSeconds = 0;
    entry.escapeBlockedSeconds = 0;
  }
  if (entry.fixed || entry.waiting < 1.5 || !entry.direction) return undefined;
  const blocker = obstacles
    .filter(
      (other) =>
        other.velocity &&
        squaredDistance(pose.position, other.position) < (clearance + other.radius + 100) ** 2
    )
    .sort(
      (a, b) =>
        squaredDistance(pose.position, a.position) - squaredDistance(pose.position, b.position)
    )[0];
  if (!blocker) {
    entry.encounters = new WeakMap();
    return undefined;
  }
  const yields = yieldsToTraffic(pose, blocker, clearance);
  if (!yields && entry.waiting < 5) return undefined;
  const escape = escapePoint(pose, blocker, obstacles, clearance, entry.direction);
  if (escape) {
    entry.escape = escape;
    entry.escapeBlockedSeconds = 0;
  }
  return escape;
}

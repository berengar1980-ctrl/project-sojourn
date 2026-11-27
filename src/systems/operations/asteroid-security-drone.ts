import { clampedSegmentProjection } from '../../core/field-geometry';
import type { SectorNpcState } from '../../core/npc-types';
import { edgePoint } from '../npcs/npc-mining-targets';
import { DRONE_SCAN_RADIUS, DRONE_PATROL_SPEED } from '../../core/security-drone';
import {
  moveFieldShip,
  type FieldRouteObstacle,
  type FieldRouteState,
} from '../navigation/field-ship-routing';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { resolveSecurityDroneDebrisContacts } from './security-drone-debris-contact';
import { resolveSecurityDroneSolidContacts } from './security-drone-solid-contact';
import {
  stageSecurityDroneCheckpoint,
  type SecurityDroneCheckpoint,
} from './asteroid-security-drone-checkpoint';

export interface DroneContact {
  readonly shipId: string;
  readonly asteroidId: string;
  readonly position: WorldPoint;
}
export interface SecurityDroneSnapshot {
  readonly position: WorldPoint;
  readonly scanRadius: number;
  readonly operational: boolean;
  readonly shieldContactSeconds: number;
}

/** Physical patrol and line-of-sight based claim enforcement.
 * A ship is reported only while it is actively mining a protected asteroid.
 */
export class AsteroidSecurityDrone {
  position: WorldPoint;
  headingRadians = 0;
  speed = 0;
  routeState?: FieldRouteState;
  private readonly patrol: readonly WorldPoint[];
  private nextWaypoint = 0;
  private readonly observed = new Set<string>();
  private operational = true;
  private retryAfterSeconds = 0;
  private shieldContactSeconds = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    asteroids: readonly LocalAsteroid[],
    private readonly scanRadius = DRONE_SCAN_RADIUS
  ) {
    const rocks = asteroids.filter((asteroid) => asteroid.kind === 'resource');
    const points = [...rocks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((_, index) => index % Math.max(1, Math.ceil(rocks.length / 9)) === 0)
      .map((asteroid, index) => {
        const angle = (index * Math.PI * 2) / Math.max(1, rocks.length);
        return {
          x: asteroid.position.x + Math.cos(angle) * (asteroid.radius + 95),
          y: asteroid.position.y + Math.sin(angle) * (asteroid.radius + 95),
        };
      });
    this.patrol =
      points.length > 0
        ? points
        : [
            { x: width * 0.25, y: height * 0.25 },
            { x: width * 0.75, y: height * 0.75 },
          ];
    this.position = { ...this.patrol[0]! };
  }

  /** Preserve patrol progress and the idempotency set for active observations. */
  exportState(): SecurityDroneCheckpoint {
    return {
      version: 1,
      position: { ...this.position },
      headingRadians: this.headingRadians,
      speed: this.speed,
      ...(this.routeState ? { routeState: structuredClone(this.routeState) } : {}),
      scanRadius: this.scanRadius,
      operational: this.operational,
      nextWaypoint: this.nextWaypoint,
      patrolSize: this.patrol.length,
      observed: [...this.observed].sort(),
    };
  }

  /** Restore into a fresh drone after validating the same patrol geometry. */
  static fromCheckpoint(
    width: number,
    height: number,
    asteroids: readonly LocalAsteroid[],
    checkpoint: unknown,
    scanRadius = DRONE_SCAN_RADIUS
  ): AsteroidSecurityDrone {
    const instance = new AsteroidSecurityDrone(width, height, asteroids, scanRadius);
    const data = stageSecurityDroneCheckpoint(checkpoint, scanRadius, instance.patrol.length);
    instance.position = { ...data.position };
    instance.headingRadians = data.headingRadians ?? 0;
    instance.speed = data.speed ?? 0;
    if (data.routeState) instance.routeState = structuredClone(data.routeState);
    instance.operational = data.operational;
    instance.nextWaypoint = data.nextWaypoint;
    for (const key of data.observed) instance.observed.add(key);
    return instance;
  }

  snapshot(): SecurityDroneSnapshot {
    return {
      position: { ...this.position },
      scanRadius: this.scanRadius,
      operational: this.operational,
      shieldContactSeconds: this.shieldContactSeconds,
    };
  }
  syncAvailability(
    npc?: Pick<SectorNpcState, 'id' | 'hullHp' | 'combatDefeats' | 'combatRecoverySeconds'>
  ): void {
    if (!npc || npc.hullHp <= 0 || (npc.combatRecoverySeconds ?? 0) > 0) this.destroy();
    else if (!this.operational) {
      const key = npc.id + ':' + (npc.combatDefeats ?? 0);
      this.restore(edgePoint(key, this.width, this.height), true);
      const target = this.patrol[this.nextWaypoint]!;
      this.headingRadians = Math.atan2(target.y - this.position.y, target.x - this.position.x);
      this.speed = 0;
    }
  }

  destroy(): void {
    this.operational = false;
  }
  restore(position: WorldPoint, operational: boolean): void {
    this.position = { ...position };
    delete this.routeState;
    this.operational = operational;
    // Resuming a physical drone must not send every unit to the same first
    // patrol corner regardless of the sector position where it materialized.
    let nearest = 0;
    for (let index = 1; index < this.patrol.length; index++) {
      const distance = Math.hypot(
        this.patrol[index]!.x - position.x,
        this.patrol[index]!.y - position.y
      );
      const best = Math.hypot(
        this.patrol[nearest]!.x - position.x,
        this.patrol[nearest]!.y - position.y
      );
      if (distance < best) nearest = index;
    }
    this.nextWaypoint = nearest;
    this.retryAfterSeconds = 0;
  }

  syncCombatPose(
    position: WorldPoint,
    headingRadians: number,
    speed: number,
    operational: boolean
  ): void {
    this.restore(position, operational);
    this.headingRadians = headingRadians;
    this.speed = Math.max(0, speed);
  }

  tick(
    dt: number,
    asteroids: readonly LocalAsteroid[],
    contacts: readonly DroneContact[],
    nearbyShips: readonly FieldRouteObstacle[] = [],
    pursuitTarget?: WorldPoint
  ): string[] {
    if (!this.operational) return [];
    this.advancePatrolMovement(dt, asteroids, nearbyShips, pursuitTarget);
    this.shieldContactSeconds = Math.max(0, this.shieldContactSeconds - Math.max(0, dt));
    const solid = resolveSecurityDroneSolidContacts(this.position, asteroids, nearbyShips, {
      width: this.width,
      height: this.height,
    });
    if (solid.contacts > 0) {
      this.position = solid.position;
      this.speed = 0;
      delete this.routeState;
      this.shieldContactSeconds = 0.4;
    }
    const velocity = {
      x: Math.cos(this.headingRadians) * this.speed,
      y: Math.sin(this.headingRadians) * this.speed,
    };
    if (resolveSecurityDroneDebrisContacts(this.position, velocity, asteroids) > 0)
      this.shieldContactSeconds = 0.4;

    const active = new Set(
      contacts.map((contact) => JSON.stringify([contact.shipId, contact.asteroidId]))
    );
    for (const key of this.observed) if (!active.has(key)) this.observed.delete(key);

    const newlyDetected: string[] = [];
    for (const contact of contacts) {
      const key = JSON.stringify([contact.shipId, contact.asteroidId]);
      if (this.observed.has(key)) continue;
      if (!this.canSee(contact.position, asteroids)) continue;
      this.observed.add(key);
      newlyDetected.push(key);
    }
    return newlyDetected;
  }

  private advancePatrolMovement(
    dt: number,
    asteroids: readonly LocalAsteroid[],
    nearbyShips: readonly FieldRouteObstacle[],
    pursuitTarget?: WorldPoint
  ): void {
    const previousTarget = this.routeState?.target;
    const keepPursuitRoute = Boolean(
      pursuitTarget &&
      previousTarget &&
      Math.hypot(pursuitTarget.x - previousTarget.x, pursuitTarget.y - previousTarget.y) < 70
    );
    const destination = keepPursuitRoute
      ? previousTarget!
      : (pursuitTarget ?? this.patrol[this.nextWaypoint]!);
    const obstacles: FieldRouteObstacle[] = [
      ...asteroids
        .filter((rock) => rock.routeBlocking)
        .map((rock) => ({
          id: rock.id,
          position: rock.position,
          radius: rock.collisionRadius ?? rock.radius,
        })),
      ...nearbyShips,
    ];
    // Ships move independently: invalidate a stale waypoint when its next leg
    // becomes obstructed instead of flying through the new contact.
    const waypoint = this.routeState?.points[this.routeState.index];
    if (waypoint && this.routeBlocked(waypoint, obstacles)) delete this.routeState;
    this.retryAfterSeconds = Math.max(0, this.retryAfterSeconds - Math.max(0, dt));
    if (this.retryAfterSeconds === 0) {
      const arrived = moveFieldShip(
        this,
        destination,
        DRONE_PATROL_SPEED,
        Math.max(0, Math.min(dt, 0.25)),
        obstacles,
        40,
        'patrol'
      );
      if (arrived && !pursuitTarget)
        this.nextWaypoint = (this.nextWaypoint + 1) % this.patrol.length;
      else if (!this.routeState) {
        // Do not perform a full route search every animation frame when the
        // target is obstructed or the field currently has no safe corridor.
        if (!pursuitTarget) this.nextWaypoint = (this.nextWaypoint + 1) % this.patrol.length;
        this.retryAfterSeconds = 1.5;
      }
    }
  }

  private routeBlocked(waypoint: WorldPoint, obstacles: readonly FieldRouteObstacle[]): boolean {
    const dx = waypoint.x - this.position.x;
    const dy = waypoint.y - this.position.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) return false;
    for (const obstacle of obstacles) {
      const distance = Math.hypot(
        obstacle.position.x - this.position.x,
        obstacle.position.y - this.position.y
      );
      if (distance < obstacle.radius + 40) continue;
      const t = clampedSegmentProjection(obstacle.position, this.position, dx, dy, lengthSquared);
      const gap = Math.hypot(
        this.position.x + dx * t - obstacle.position.x,
        this.position.y + dy * t - obstacle.position.y
      );
      if (gap < obstacle.radius + 40) return true;
    }
    return false;
  }

  detect(point: WorldPoint, asteroids: readonly LocalAsteroid[]): boolean {
    return this.operational && this.canSee(point, asteroids);
  }

  private canSee(point: WorldPoint, asteroids: readonly LocalAsteroid[]): boolean {
    return droneSeesTarget(this.position, point, asteroids, this.scanRadius);
  }
}

export function droneSeesTarget(
  position: WorldPoint,
  point: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  scanRadius = DRONE_SCAN_RADIUS
): boolean {
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > scanRadius * scanRadius) return false;
  if (distanceSquared < 1) return true;
  // Asteroids blocking the physical sensor ray shield illegal miners.
  for (const asteroid of asteroids) {
    if (!asteroid.routeBlocking) continue;
    const t = clampedSegmentProjection(asteroid.position, position, dx, dy, distanceSquared);
    if (t <= 0.02 || t >= 0.98) continue;
    const closestX = position.x + t * dx;
    const closestY = position.y + t * dy;
    const radius = asteroid.radius * 0.9;
    if (Math.hypot(closestX - asteroid.position.x, closestY - asteroid.position.y) < radius)
      return false;
  }
  return true;
}

export function securityPirateApproach(
  dronePosition: WorldPoint,
  piratePosition: WorldPoint
): WorldPoint {
  const dx = dronePosition.x - piratePosition.x;
  const dy = dronePosition.y - piratePosition.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    x: piratePosition.x + (dx / length) * 125,
    y: piratePosition.y + (dy / length) * 125,
  };
}

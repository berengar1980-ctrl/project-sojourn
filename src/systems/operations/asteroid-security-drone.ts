import {
  moveFieldShip,
  type FieldRouteObstacle,
  type FieldRouteState,
} from '../navigation/field-ship-routing';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
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
}
const DRONE_CRUISE = 115;
const DRONE_SCAN_RADIUS = 460;

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

  constructor(
    width: number,
    height: number,
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
    };
  }
  destroy(): void {
    this.operational = false;
  }
  restore(position: WorldPoint, operational: boolean): void {
    this.position = { ...position };
    delete this.routeState;
    this.operational = operational;
  }

  tick(
    dt: number,
    asteroids: readonly LocalAsteroid[],
    contacts: readonly DroneContact[],
    nearbyShips: readonly FieldRouteObstacle[] = []
  ): string[] {
    if (!this.operational) return [];
    const destination = this.patrol[this.nextWaypoint]!;
    const obstacles: FieldRouteObstacle[] = [
      ...asteroids.filter((rock) => rock.routeBlocking).map((rock) => ({
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
    const arrived = moveFieldShip(
      this,
      destination,
      DRONE_CRUISE,
      Math.max(0, Math.min(dt, 0.25)),
      obstacles,
      40
    );
    if (arrived) this.nextWaypoint = (this.nextWaypoint + 1) % this.patrol.length;

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

  private routeBlocked(
    waypoint: WorldPoint,
    obstacles: readonly FieldRouteObstacle[]
  ): boolean {
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
      const projection =
        ((obstacle.position.x - this.position.x) * dx +
          (obstacle.position.y - this.position.y) * dy) /
        lengthSquared;
      const t = Math.max(0, Math.min(1, projection));
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
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > this.scanRadius * this.scanRadius) return false;
    if (distanceSquared < 1) return true;
    // Asteroids blocking the physical sensor ray shield illegal miners.
    for (const asteroid of asteroids) {
      if (!asteroid.routeBlocking) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((asteroid.position.x - this.position.x) * dx +
            (asteroid.position.y - this.position.y) * dy) /
            distanceSquared
        )
      );
      if (t <= 0.02 || t >= 0.98) continue;
      const closestX = this.position.x + t * dx;
      const closestY = this.position.y + t * dy;
      const radius = asteroid.radius * 0.9;
      if (Math.hypot(closestX - asteroid.position.x, closestY - asteroid.position.y) < radius)
        return false;
    }
    return true;
  }
}

import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

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
  private position: WorldPoint;
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
      .map((asteroid) => ({ ...asteroid.position }));
    this.patrol = points.length > 0
      ? points
      : [{ x: width * 0.25, y: height * 0.25 }, { x: width * 0.75, y: height * 0.75 }];
    this.position = { ...this.patrol[0]! };
  }

  snapshot(): SecurityDroneSnapshot {
    return { position: { ...this.position }, scanRadius: this.scanRadius, operational: this.operational };
  }
  destroy(): void { this.operational = false; }
  restore(position: WorldPoint, operational: boolean): void {
    this.position = { ...position };
    this.operational = operational;
  }

  tick(dt: number, asteroids: readonly LocalAsteroid[], contacts: readonly DroneContact[]): string[] {
    if (!this.operational) return [];
    const destination = this.patrol[this.nextWaypoint]!;
    const dx = destination.x - this.position.x;
    const dy = destination.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    const move = Math.min(distance, DRONE_CRUISE * Math.max(0, Math.min(dt, 0.25)));
    if (distance > 0) this.position = {
      x: this.position.x + (dx / distance) * move,
      y: this.position.y + (dy / distance) * move,
    };
    if (distance <= move + 0.001) this.nextWaypoint = (this.nextWaypoint + 1) % this.patrol.length;

    const active = new Set(contacts.map((contact) => JSON.stringify([contact.shipId, contact.asteroidId])));
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

  private canSee(point: WorldPoint, asteroids: readonly LocalAsteroid[]): boolean {
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > this.scanRadius * this.scanRadius) return false;
    if (distanceSquared < 1) return true;
    // Asteroids blocking the physical sensor ray shield illegal miners.
    for (const asteroid of asteroids) {
      if (!asteroid.routeBlocking) continue;
      const t = Math.max(0, Math.min(1, (
        (asteroid.position.x - this.position.x) * dx +
        (asteroid.position.y - this.position.y) * dy
      ) / distanceSquared));
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

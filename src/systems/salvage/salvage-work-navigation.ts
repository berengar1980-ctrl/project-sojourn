import type { WorldPoint } from '../../core/world-types';
import type { LocalShipState } from '../../core/local-space-types';
import { seededLocalGate } from '../../core/local-space-exit';
import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import { planPointRoute, type RouteObstacle } from '../local-space/local-space-navigation';
import { salvageFieldPhysicsBodies } from './salvage-container-motion';
import {
  fieldTrafficObstacles,
  reviewFieldTrafficRoute,
  trafficRouteBodies,
} from '../navigation/field-traffic-obstacles';

export const WORK_STANDOFF = 105;
export const DISTRESS_DIAGNOSIS_STANDOFF = 70;

export function clampPoint(point: WorldPoint, width: number, height: number): WorldPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

export function workPoint(ship: LocalShipState, wreck: SalvageWreck): WorldPoint {
  const dx = ship.position.x - wreck.position.x;
  const dy = ship.position.y - wreck.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const standoff = wreck.id.startsWith('event-wreck-salvage-distress-')
    ? DISTRESS_DIAGNOSIS_STANDOFF
    : WORK_STANDOFF;
  const range = wreck.radius + standoff;
  return {
    x: wreck.position.x + (dx / length) * range,
    y: wreck.position.y + (dy / length) * range,
  };
}

export function salvageWorkInRange(ship: WorldPoint, wreck: SalvageWreck): boolean {
  return (
    Math.hypot(ship.x - wreck.position.x, ship.y - wreck.position.y) <=
    wreck.radius + WORK_STANDOFF + 6
  );
}

export function distressDiagnosisInRange(ship: WorldPoint, wreck: SalvageWreck): boolean {
  return (
    Math.hypot(ship.x - wreck.position.x, ship.y - wreck.position.y) <=
    wreck.radius + DISTRESS_DIAGNOSIS_STANDOFF + 6
  );
}

function salvageRouteBodies(field: SalvageField): RouteObstacle[] {
  const bodies: RouteObstacle[] = salvageFieldPhysicsBodies(field).map((body) => ({
    id: body.id,
    position: body.position,
    radius: body.radius,
    ...(body.collisionRadius !== undefined ? { collisionRadius: body.collisionRadius } : {}),
    routeBlocking: body.routeBlocking,
    velocity: body.physics.velocity,
  }));
  const knownIds = new Set(bodies.map((body) => body.id));
  for (const wreck of field.wrecks) {
    if (!wreck.id.startsWith('event-wreck-salvage-distress-') || knownIds.has(wreck.id)) continue;
    bodies.push({
      id: wreck.id,
      position: wreck.position,
      radius: wreck.radius,
      collisionRadius: wreck.radius,
      routeBlocking: true,
      velocity: wreck.driftVelocity ?? { x: 0, y: 0 },
    });
  }
  return bodies;
}

export function planSalvageRoute(
  field: SalvageField,
  from: WorldPoint,
  target: WorldPoint,
  shipLengthMeters: number,
  workWreckId?: string
): readonly WorldPoint[] {
  const clearance = Math.max(32, shipLengthMeters * 0.46);
  const asteroids = [
    ...salvageRouteBodies(field),
    ...trafficRouteBodies(fieldTrafficObstacles(field, 'player')),
  ];
  const options = (destination: WorldPoint) => ({
    start: from,
    target: destination,
    asteroids,
    clearance,
    width: field.width,
    height: field.height,
    searchOrder: 'grid-first' as const,
  });
  const preferred = planPointRoute(options(target));
  if (preferred.route.length >= 2) return preferred.route;

  const wreck = field.wrecks.find((entry) => entry.id === workWreckId);
  if (!wreck) return preferred.route;
  const radius = Math.max(
    wreck.radius +
      (wreck.id.startsWith('event-wreck-salvage-distress-')
        ? DISTRESS_DIAGNOSIS_STANDOFF
        : WORK_STANDOFF),
    Math.hypot(target.x - wreck.position.x, target.y - wreck.position.y)
  );
  const baseAngle = Math.atan2(target.y - wreck.position.y, target.x - wreck.position.x);
  const candidates = Array.from({ length: 16 }, (_, index) => {
    const alternating = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 === 0 ? -1 : 1);
    const angle = baseAngle + alternating * ((Math.PI * 2) / 16);
    return clampPoint(
      {
        x: wreck.position.x + Math.cos(angle) * radius,
        y: wreck.position.y + Math.sin(angle) * radius,
      },
      field.width,
      field.height
    );
  });
  const alternatives = candidates
    .map((destination) => planPointRoute(options(destination)))
    .filter((plan) => plan.route.length >= 2)
    .sort((left, right) => routeLength(left.route) - routeLength(right.route));
  return alternatives[0]?.route ?? [];
}

function routeLength(route: readonly WorldPoint[]): number {
  let length = 0;
  for (let index = 1; index < route.length; index += 1) {
    length += Math.hypot(
      route[index]!.x - route[index - 1]!.x,
      route[index]!.y - route[index - 1]!.y
    );
  }
  return length;
}

export function salvageTrafficSolids(field: SalvageField) {
  return salvageFieldPhysicsBodies(field).filter((rock) => rock.routeBlocking);
}

export function reviewSalvageTrafficRoute(
  field: SalvageField,
  from: WorldPoint,
  route: readonly WorldPoint[],
  index: number,
  shipLengthMeters: number
): { readonly route: readonly WorldPoint[]; readonly index: number } {
  return reviewFieldTrafficRoute(
    {
      start: from,
      asteroids: salvageRouteBodies(field),
      clearance: Math.max(32, shipLengthMeters * 0.46),
      width: field.width,
      height: field.height,
    },
    route,
    index,
    fieldTrafficObstacles(field, 'player')
  );
}

export function createInitialSalvageShip(field: SalvageField): LocalShipState {
  return {
    position: seededLocalGate(field.width, field.height, field.seed),
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    get speed() {
      return (
        this.velocity.x * Math.cos(this.headingRadians) +
        this.velocity.y * Math.sin(this.headingRadians)
      );
    },
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
  };
}

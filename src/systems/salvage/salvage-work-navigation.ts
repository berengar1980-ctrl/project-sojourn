import type { WorldPoint } from '../../core/world-types';
import type { LocalShipState } from '../../core/local-space-types';
import { seededLocalGate } from '../../core/local-space-exit';
import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import { planPointRoute } from '../local-space/local-space-navigation';
import { routeAroundDistressShip } from './distress-navigation';
import { salvageFieldPhysicsBodies } from './salvage-container-motion';

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

export function planSalvageRoute(
  field: SalvageField,
  from: WorldPoint,
  target: WorldPoint,
  shipLengthMeters: number
): readonly WorldPoint[] {
  const distress = field.wrecks.find((wreck) =>
    wreck.id.startsWith('event-wreck-salvage-distress-')
  );
  if (distress) {
    return routeAroundDistressShip(from, target, distress.position, distress.radius + 60);
  }
  return planPointRoute({
    start: from,
    target,
    asteroids: salvageFieldPhysicsBodies(field),
    clearance: Math.max(32, shipLengthMeters * 0.46),
    width: field.width,
    height: field.height,
  }).route;
}

export function createInitialSalvageShip(field: SalvageField): LocalShipState {
  return {
    position: seededLocalGate(field.width, field.height, field.seed),
    headingRadians: 0,
    speed: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  };
}

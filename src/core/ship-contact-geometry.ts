import type { ShipDefinition, ShipHardpoints } from './ship-types';
import type { WorldPoint } from './world-types';
import { rotatePoint } from './field-geometry';

export interface ShieldWorldGeometry {
  readonly centerOffset: WorldPoint;
  readonly radiusX: number;
  readonly radiusY: number;
}

export function createShieldWorldGeometry(
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): ShieldWorldGeometry {
  const scale = nominalLengthMeters / hardpoints.sourceWidth;
  return {
    centerOffset: {
      x: (hardpoints.shield.centerX - hardpoints.pivot.x) * scale,
      y: (hardpoints.shield.centerY - hardpoints.pivot.y) * scale,
    },
    radiusX: hardpoints.shield.radiusX * scale,
    radiusY: hardpoints.shield.radiusY * scale,
  };
}

const shieldGeometries = new WeakMap<ShipDefinition, ShieldWorldGeometry>();

/** Ship definitions are immutable; live poses are never cached here. */
export function shipShieldGeometry(ship: ShipDefinition): ShieldWorldGeometry {
  let geometry = shieldGeometries.get(ship);
  if (!geometry) {
    geometry = createShieldWorldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters);
    shieldGeometries.set(ship, geometry);
  }
  return geometry;
}

export function shieldWorldCenter(
  position: WorldPoint,
  headingRadians: number,
  geometry: ShieldWorldGeometry
): WorldPoint {
  const offset = rotatePoint(geometry.centerOffset, headingRadians);
  return { x: position.x + offset.x, y: position.y + offset.y };
}

/** The legacy combat hull envelope is a separate contact policy, not a shield. */
export function combatHullRadii(
  nominalLengthMeters: number,
  shield?: Pick<ShieldWorldGeometry, 'radiusX' | 'radiusY'>
): { radiusX: number; radiusY: number } {
  return {
    radiusX: Math.max(5, (shield?.radiusX ?? nominalLengthMeters * 0.5) * 0.88),
    radiusY: Math.max(4, (shield?.radiusY ?? nominalLengthMeters * 0.34) * 0.88),
  };
}

export function orientedHullRadius(
  nx: number,
  ny: number,
  headingRadians: number,
  radiusX: number,
  radiusY: number
): number {
  const cos = Math.cos(headingRadians);
  const sin = Math.sin(headingRadians);
  const localX = nx * cos + ny * sin;
  const localY = -nx * sin + ny * cos;
  return 1 / Math.hypot(localX / radiusX, localY / radiusY);
}

/** Conservative navigation envelope, distinct from actual oriented hull contact. */
export function shipShieldFootprint(
  ship: ShipDefinition,
  position: WorldPoint,
  headingRadians: number
): { readonly position: WorldPoint; readonly radius: number } {
  const geometry = shipShieldGeometry(ship);
  return {
    position: shieldWorldCenter(position, headingRadians, geometry),
    radius: Math.max(geometry.radiusX, geometry.radiusY),
  };
}

/** Same weighted normal separation for shields and mixed ship contacts. */
export function weightedContactSeparation(
  overlap: number,
  firstWeight: number,
  secondWeight: number
): { readonly first: number; readonly second: number } {
  const total = firstWeight + secondWeight;
  return {
    first: overlap * (secondWeight / total),
    second: overlap * (firstWeight / total),
  };
}

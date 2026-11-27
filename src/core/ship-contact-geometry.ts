import type { ShipDefinition, ShipHardpoints } from './ship-types';
import type { WorldPoint } from './world-types';

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

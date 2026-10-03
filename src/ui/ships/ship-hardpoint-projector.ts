import type {
  ShipHardpoint,
  ShipHardpoints,
  ShipShieldGeometry,
} from '../../core/ship-types';
import type { ScreenPoint } from '../map/map-camera';

export interface ShipScreenGeometry {
  readonly center: ScreenPoint;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

export interface ShieldScreenGeometry {
  readonly center: ScreenPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
}

function rotate(point: ScreenPoint, angle: number): ScreenPoint {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

export function projectShipPoint(
  point: { readonly x: number; readonly y: number },
  source: ShipHardpoints,
  geometry: ShipScreenGeometry
): ScreenPoint {
  const local = {
    x: ((point.x - source.pivot.x) / source.sourceWidth) * geometry.width,
    y: ((point.y - source.pivot.y) / source.sourceHeight) * geometry.height,
  };
  const rotated = rotate(local, geometry.angle);

  return {
    x: geometry.center.x + rotated.x,
    y: geometry.center.y + rotated.y,
  };
}

export function projectHardpoint(
  hardpoint: ShipHardpoint,
  source: ShipHardpoints,
  geometry: ShipScreenGeometry
): ScreenPoint {
  return projectShipPoint(hardpoint, source, geometry);
}

export function projectShieldGeometry(
  shield: ShipShieldGeometry,
  source: ShipHardpoints,
  geometry: ShipScreenGeometry
): ShieldScreenGeometry {
  return {
    center: projectShipPoint(
      { x: shield.centerX, y: shield.centerY },
      source,
      geometry
    ),
    radiusX: (shield.radiusX / source.sourceWidth) * geometry.width,
    radiusY: (shield.radiusY / source.sourceHeight) * geometry.height,
    angle: geometry.angle,
  };
}

export function spriteDrawOffset(
  source: ShipHardpoints,
  geometry: ShipScreenGeometry
): ScreenPoint {
  return {
    x: -(source.pivot.x / source.sourceWidth) * geometry.width,
    y: -(source.pivot.y / source.sourceHeight) * geometry.height,
  };
}

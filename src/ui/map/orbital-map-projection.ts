import type { WorldPoint } from '../../core/world-types';
import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';
import type { ScreenPoint } from './map-camera';
import { mapLocationVisualRadius } from './map-visual-scale';

export interface MapProjectionCamera {
  worldToScreen(point: WorldPoint, width: number, height: number): ScreenPoint;
  getRelativeZoom(): number;
}

/**
 * Visual-only projection for idle ships at an orbital berth. World coordinates,
 * sensors, pursuit, fuel use and route lengths are never modified.
 * At higher zoom levels the real position is shown with no snapping.
 */
export function projectOrbitalMapShip(
  worldPosition: WorldPoint,
  location: StarMapLocationView | undefined,
  camera: MapProjectionCamera,
  viewportWidth: number,
  viewportHeight: number,
  shipWidth: number,
  stationary: boolean
): ScreenPoint {
  const physical = camera.worldToScreen(worldPosition, viewportWidth, viewportHeight);
  if (!location || !stationary || !['planet', 'moon', 'station'].includes(location.kind)) {
    return physical;
  }
  const zoom = camera.getRelativeZoom();
  if (zoom >= 3.3) return physical;

  const dx = worldPosition.x - location.position.x;
  const dy = worldPosition.y - location.position.y;
  if (Math.hypot(dx, dy) < 0.001) return physical;

  const center = camera.worldToScreen(location.position, viewportWidth, viewportHeight);
  const angle = Math.atan2(dy, dx);
  const visualRadius = mapLocationVisualRadius(location, zoom);
  // Just outside the same ring used for selected/current planets.
  const ringRadius = visualRadius + 9 + shipWidth * 0.36 + 3;
  const onRing = {
    x: center.x + Math.cos(angle) * ringRadius,
    y: center.y + Math.sin(angle) * ringRadius,
  };
  // Ease from the schematic system map back to unmodified world coordinates.
  const progress = Math.min(1, Math.max(0, (zoom - 1.4) / 1.9));
  const factor = progress * progress * (3 - 2 * progress);
  return {
    x: onRing.x + (physical.x - onRing.x) * factor,
    y: onRing.y + (physical.y - onRing.y) * factor,
  };
}

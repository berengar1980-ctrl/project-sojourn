import type { WorldPoint } from '../../core/world-types';
import type { MapCamera } from '../map/map-camera';

/** Keep the player's salvage scan centered with the native PvP projection. */
export function centerSalvageCamera(
  camera: MapCamera,
  ship: WorldPoint,
  width: number,
  height: number
): void {
  camera.fit(width, height);
  const point = camera.worldToScreen(ship, width, height);
  camera.pan(width / 2 - point.x, height / 2 - point.y);
}

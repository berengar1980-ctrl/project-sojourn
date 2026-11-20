import type { SalvageWreck } from '../../core/salvage-types';
import type { MapCamera } from '../map/map-camera';
import { drawCombatWreck3d } from '../salvage/combat-wreck-mesh';

/** Persistent combat hulls visible in local mining fields. Recovery uses the salvage scene. */
export function drawMiningCombatWrecks(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  wrecks: readonly SalvageWreck[],
  width: number,
  height: number
): void {
  for (const wreck of wrecks) {
    const point = camera.worldToScreen(wreck.position, width, height);
    const radius = camera.scale(wreck.radius);
    if (
      !wreck.combatWreckVariant ||
      point.x < -radius * 2 ||
      point.x > width + radius * 2 ||
      point.y < -radius * 2 ||
      point.y > height + radius * 2
    )
      continue;
    context.save();
    context.translate(point.x, point.y);
    context.globalAlpha = wreck.resources.every((resource) => resource.remainingAmount <= 0)
      ? 0.45
      : 0.95;
    drawCombatWreck3d(
      context,
      wreck.combatWreckVariant,
      radius,
      wreck.rotation3d ?? { x: 0, y: 0, z: wreck.rotation }
    );
    context.restore();
  }
}

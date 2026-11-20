import type { SalvageWreck } from '../../core/salvage-types';
import type { MapCamera } from '../map/map-camera';
import { drawCombatWreck3d } from '../salvage/combat-wreck-mesh';

export interface CombatWreckHitArea {
  readonly id: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly radius: number;
}

/** Persistent combat hulls visible and selectable in local mining fields. */
export function drawMiningCombatWrecks(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  wrecks: readonly SalvageWreck[],
  width: number,
  height: number,
  selectedWreckId: string | null = null
): CombatWreckHitArea[] {
  const hitAreas: CombatWreckHitArea[] = [];
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
    const hitRadius = Math.max(19, radius + 10);
    hitAreas.push({ id: wreck.id, point, radius: hitRadius });
    if (wreck.id === selectedWreckId) {
      context.save();
      context.strokeStyle = '#d8bc7a';
      context.lineWidth = 1.5;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.arc(point.x, point.y, hitRadius + 2, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }
  return hitAreas;
}

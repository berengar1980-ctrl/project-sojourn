import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import type { MapCamera } from '../map/map-camera';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { fractional } from './salvage-scene-layers';

export function drawPlayerSalvageWorkEffect(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  geometry: ShipScreenGeometry,
  width: number,
  height: number,
  timeSeconds: number
): void {
  if (model.phase !== 'stripping' && model.phase !== 'extracting-component') return;
  const wreck = model.wrecks.find((entry) => entry.isWorkTarget);
  if (!wreck) return;
  const wreckPoint = camera.worldToScreen(wreck.position, width, height);
  const hardpoints = model.ship.hardpoints.tractorBeams ?? [];
  const emitters =
    hardpoints.length > 0
      ? hardpoints.map((hardpoint) => projectHardpoint(hardpoint, model.ship.hardpoints, geometry))
      : [geometry.center];
  const progress = model.operationProgress ?? 0;
  const pulse = 0.68 + Math.sin(timeSeconds * 7.5) * 0.2;
  const component = model.phase === 'extracting-component';
  context.save();
  context.lineCap = 'round';
  for (const emitter of emitters) {
    context.shadowColor = component ? 'rgba(110, 214, 255, 0.8)' : 'rgba(235, 180, 83, 0.78)';
    context.shadowBlur = 8 + pulse * 5;
    context.strokeStyle = component
      ? `rgba(128, 220, 255, ${0.34 + pulse * 0.28})`
      : `rgba(239, 187, 91, ${0.32 + pulse * 0.3})`;
    context.lineWidth = 5.5;
    context.beginPath();
    context.moveTo(emitter.x, emitter.y);
    context.lineTo(wreckPoint.x, wreckPoint.y);
    context.stroke();
    context.shadowBlur = 2;
    context.strokeStyle = component
      ? `rgba(220, 248, 255, ${0.64 + pulse * 0.25})`
      : `rgba(255, 230, 164, ${0.62 + pulse * 0.28})`;
    context.lineWidth = 1.1;
    context.setLineDash([7, 5]);
    context.lineDashOffset = -timeSeconds * 24;
    context.beginPath();
    context.moveTo(emitter.x, emitter.y);
    context.lineTo(wreckPoint.x, wreckPoint.y);
    context.stroke();
  }
  context.setLineDash([]);
  for (let index = 0; index < 9; index += 1) {
    const destination = emitters[index % emitters.length] ?? geometry.center;
    const phase = fractional(timeSeconds * (0.55 + index * 0.017) + index * 0.137 + progress * 0.2);
    const curve = Math.sin(phase * Math.PI) * (index % 2 === 0 ? 8 : -8);
    const dx = destination.x - wreckPoint.x;
    const dy = destination.y - wreckPoint.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const x = wreckPoint.x + dx * phase + nx * curve;
    const y = wreckPoint.y + dy * phase + ny * curve;
    const alpha = Math.sin(phase * Math.PI) * 0.78;
    context.fillStyle = component
      ? `rgba(176, 232, 255, ${alpha})`
      : `rgba(220, 192, 132, ${alpha})`;
    context.beginPath();
    context.arc(x, y, component ? 2.2 : 1.5 + (index % 3) * 0.55, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = component
    ? `rgba(146, 225, 255, ${0.42 + pulse * 0.24})`
    : `rgba(255, 194, 93, ${0.38 + pulse * 0.28})`;
  context.lineWidth = 1.4;
  context.beginPath();
  context.arc(wreckPoint.x, wreckPoint.y, 12 + pulse * 5, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

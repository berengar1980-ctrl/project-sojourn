import type { SectorSalvageEvent } from '../../core/salvage-types';
import { getShipsByRole } from '../../systems/ships';
import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import { MapCamera } from '../map/map-camera';

export function drawDistressScanEffect(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  elapsed: number,
  width: number,
  height: number
): void {
  if (elapsed < 0 || elapsed > 1.25 || !model.sectorEvent) return;
  const target = model.wrecks[0];
  if (!target) return;
  const point = camera.worldToScreen(target.position, width, height);
  const source = camera.worldToScreen(model.ship.position, width, height);
  const progress = Math.min(1, elapsed / 1.05);
  context.save();
  context.strokeStyle = 'rgba(112, 221, 245, ' + (0.9 - progress * 0.7) + ')';
  context.lineWidth = 2.5;
  context.beginPath();
  context.arc(point.x, point.y, 18 + 140 * progress, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([6, 9]);
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  context.restore();
}

export function drawDistressShipSprite(
  context: CanvasRenderingContext2D,
  event: SectorSalvageEvent | null,
  wreckId: string,
  radius: number,
  loadImage: (url: string) => HTMLImageElement
): boolean {
  if (!event || event.type !== 'distress-rescue' || !wreckId.startsWith('event-wreck-')) {
    return false;
  }
  const role = event.wreckKind === 'salvager' ? 'salvage'
    : event.wreckKind === 'miner' ? 'mining'
      : event.wreckKind === 'patrol' ? 'patrol' : 'freighter';
  const variants = getShipsByRole(role);
  const ship = variants[(event.fieldSeed >>> 0) % variants.length];
  if (!ship) return false;
  const image = loadImage(ship.sprite.assetUrl);
  if (!image.complete || image.naturalWidth <= 0) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  context.drawImage(image, -radius, -radius / aspect, radius * 2, radius * 2 / aspect);
  return true;
}

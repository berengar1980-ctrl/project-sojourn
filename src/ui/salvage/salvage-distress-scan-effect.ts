import type { SectorSalvageEvent } from '../../core/salvage-types';
import { getShipsByRole } from '../../systems/ships';
import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import type { MapCamera } from '../map/map-camera';

export function drawDistressScanEffect(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  elapsed: number,
  width: number,
  height: number
): void {
  if (elapsed < 0 || elapsed > 3 || !model.sectorEvent) return;
  const target = model.wrecks[0];
  if (!target) return;
  const point = camera.worldToScreen(target.position, width, height);
  const player = camera.worldToScreen(model.ship.position, width, height);
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const progress = elapsed / 3;
  const halfAngle = Math.PI / 9;
  const sweepAngle = angle - halfAngle + halfAngle * 2 * progress;
  const pulse = 0.55 + Math.sin(elapsed * 12) * 0.12;
  context.save();
  context.beginPath();
  context.moveTo(player.x, player.y);
  context.arc(player.x, player.y, distance, angle - halfAngle, angle + halfAngle);
  context.closePath();
  context.fillStyle = 'rgba(95, 223, 237, ' + (0.1 + pulse * 0.1) + ')';
  context.fill();
  context.strokeStyle = 'rgba(130, 242, 255, ' + (0.35 + pulse * 0.3) + ')';
  context.lineWidth = 1.2;
  context.stroke();
  context.beginPath();
  context.moveTo(player.x, player.y);
  context.lineTo(
    player.x + Math.cos(sweepAngle) * distance,
    player.y + Math.sin(sweepAngle) * distance
  );
  context.strokeStyle = 'rgba(210, 253, 255, 0.85)';
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

export function drawDistressShipSprite(
  context: CanvasRenderingContext2D,
  event: SectorSalvageEvent | null,
  wreckId: string,
  pixelsPerMeter: number,
  loadImage: (url: string) => HTMLImageElement
): boolean {
  if (!event || event.type !== 'distress-rescue' || !wreckId.startsWith('event-wreck-')) {
    return false;
  }
  const role =
    event.wreckKind === 'salvager'
      ? 'salvage'
      : event.wreckKind === 'miner'
        ? 'mining'
        : event.wreckKind === 'patrol'
          ? 'patrol'
          : 'freighter';
  const variants = getShipsByRole(role);
  const ship = variants[(event.fieldSeed >>> 0) % variants.length];
  if (!ship) return false;
  const image = loadImage(ship.sprite.assetUrl);
  if (!image.complete || image.naturalWidth <= 0) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  const shipWidth = ship.nominalLengthMeters * pixelsPerMeter;
  context.drawImage(
    image,
    -shipWidth / 2,
    -shipWidth / (2 * aspect),
    shipWidth,
    shipWidth / aspect
  );
  return true;
}

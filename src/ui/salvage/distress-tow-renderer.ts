import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import { getShipsByRole } from '../../systems/ships';
import type { MapCamera } from '../map/map-camera';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

export function drawDistressTow(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  width: number,
  height: number,
  geometry: ShipScreenGeometry,
  loadImage: (url: string) => HTMLImageElement
): void {
  const tow = model.distressTow;
  const event = model.sectorEvent;
  if (!tow || !event) return;
  const mounts = model.ship.hardpoints;
  const mount = mounts.grapplingHooks?.[0];
  const anchor = mount ? projectHardpoint(mount, mounts, geometry) : geometry.center;
  const cargo = camera.worldToScreen(tow.position, width, height);
  const dx = cargo.x - anchor.x;
  const dy = cargo.y - anchor.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const time = tow.elapsedSeconds;
  context.save();
  if (!tow.attached) {
    const progress = Math.min(1, time / 0.65);
    const tip = { x: anchor.x + dx * progress, y: anchor.y + dy * progress };
    context.setLineDash([8, 5]);
    context.lineWidth = 2;
    context.strokeStyle = '#c1f7ff';
    context.beginPath();
    context.moveTo(anchor.x, anchor.y);
    context.lineTo(tip.x, tip.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#efffff';
    context.beginPath();
    context.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    context.fill();
  } else {
    const slack = Math.max(0, 1 - tow.cableTension);
    const sway = Math.min(36, distance * 0.09) * slack * Math.sin(time * 3.2);
    const bend = { x: -dy / distance * sway, y: dx / distance * sway };
    const middle = { x: (anchor.x + cargo.x) / 2 + bend.x, y: (anchor.y + cargo.y) / 2 + bend.y };
    context.strokeStyle = tow.cableTension > 0.65 ? '#ffc88d' : '#b5cbd1';
    context.lineWidth = 2.6;
    context.beginPath();
    context.moveTo(anchor.x, anchor.y);
    context.quadraticCurveTo(middle.x, middle.y, cargo.x, cargo.y);
    context.stroke();
    context.strokeStyle = 'rgba(210, 244, 255, 0.38)';
    context.lineWidth = 1;
    context.stroke();
  }
  const role = event.wreckKind === 'salvager' ? 'salvage'
    : event.wreckKind === 'miner' ? 'mining'
      : event.wreckKind === 'patrol' ? 'patrol' : 'freighter';
  const variants = getShipsByRole(role);
  const ship = variants[(event.fieldSeed >>> 0) % variants.length];
  const image = ship ? loadImage(ship.sprite.assetUrl) : null;
  context.translate(cargo.x, cargo.y);
  context.rotate(tow.headingRadians);
  if (image?.complete && image.naturalWidth > 0) {
    const ratio = image.naturalWidth / image.naturalHeight;
    context.globalAlpha = 0.88;
    context.drawImage(image, -65, -65 / ratio, 130, 130 / ratio);
  } else {
    context.strokeStyle = '#c6d4da';
    context.lineWidth = 3;
    context.strokeRect(-55, -20, 110, 40);
  }
  context.restore();
}

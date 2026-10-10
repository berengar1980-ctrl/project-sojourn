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
  const role = wreckRole(event.wreckKind);
  const variants = getShipsByRole(role);
  const ship = variants[(event.fieldSeed >>> 0) % variants.length];
  const image = ship ? loadImage(ship.sprite.assetUrl) : null;
  const shipWidth = ship ? camera.scale(ship.nominalLengthMeters) : 90;
  const ratio = image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 2;
  const wreckMounts = ship?.sprite.hardpoints;
  const wreckHook = wreckMounts?.grapplingHooks?.[0];
  const attachment =
    wreckMounts && wreckHook
      ? projectHardpoint(wreckHook, wreckMounts, {
          center: cargo,
          width: shipWidth,
          height: shipWidth / ratio,
          angle: tow.headingRadians,
        })
      : cargo;
  const dx = attachment.x - anchor.x;
  const dy = attachment.y - anchor.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const time = tow.elapsedSeconds;
  context.save();
  drawTowCable(context, model, tow, anchor, cargo, attachment, dx, dy, distance, time);
  context.translate(cargo.x, cargo.y);
  context.rotate(tow.headingRadians);
  if (image?.complete && image.naturalWidth > 0 && ship) {
    context.globalAlpha = 0.88;
    context.drawImage(
      image,
      -shipWidth / 2,
      -shipWidth / (2 * ratio),
      shipWidth,
      shipWidth / ratio
    );
  } else {
    context.strokeStyle = '#c6d4da';
    context.lineWidth = 3;
    context.strokeRect(-55, -20, 110, 40);
  }
  context.restore();
}

function drawTowCable(
  context: CanvasRenderingContext2D,
  model: SalvageSpaceViewModel,
  tow: NonNullable<SalvageSpaceViewModel['distressTow']>,
  anchor: { x: number; y: number },
  cargo: { x: number; y: number },
  attachment: { x: number; y: number },
  dx: number,
  dy: number,
  distance: number,
  time: number
): void {
  if (!tow.attached) {
    const progress = Math.min(1, time / 0.65);
    const tip = { x: anchor.x + dx * progress, y: anchor.y + dy * progress };
    context.setLineDash([8, 5]);
    context.lineWidth = 2;
    context.strokeStyle = '#606a70';
    context.beginPath();
    context.moveTo(anchor.x, anchor.y);
    context.lineTo(tip.x, tip.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#a5adb2';
    context.beginPath();
    context.translate(tip.x, tip.y);
    context.rotate(Math.atan2(dy, dx));
    context.beginPath();
    context.moveTo(9, 0);
    context.lineTo(-3, -3);
    context.lineTo(-9, -9);
    context.lineTo(-13, -6);
    context.lineTo(-6, 0);
    context.lineTo(-13, 6);
    context.lineTo(-9, 9);
    context.lineTo(-3, 3);
    context.closePath();
    context.fill();
    context.rotate(-Math.atan2(dy, dx));
    context.translate(-tip.x, -tip.y);
  } else {
    const slack = Math.max(0, 1 - tow.cableTension);
    const lateralDrift =
      -Math.sin(model.ship.headingRadians) * tow.velocity.x +
      Math.cos(model.ship.headingRadians) * tow.velocity.y;
    const sway =
      Math.max(-65, Math.min(65, lateralDrift * 0.15)) +
      Math.min(24, distance * 0.07) * slack * Math.sin(time * 3.2);
    const bend = { x: (-dy / distance) * sway, y: (dx / distance) * sway };
    const middle = {
      x: (anchor.x + cargo.x) / 2 + bend.x,
      y: (anchor.y + cargo.y) / 2 + bend.y,
    };
    context.strokeStyle = tow.cableTension > 0.65 ? '#919b9f' : '#636c72';
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(anchor.x, anchor.y);
    context.quadraticCurveTo(middle.x, middle.y, attachment.x, attachment.y);
    context.stroke();
    context.strokeStyle = 'rgba(210, 214, 215, 0.22)';
    context.lineWidth = 0.65;
    context.stroke();
  }
}

function wreckRole(kind: NonNullable<SalvageSpaceViewModel['sectorEvent']>['wreckKind']): 'salvage' | 'mining' | 'patrol' | 'freighter' {
  if (kind === 'salvager') return 'salvage';
  if (kind === 'miner') return 'mining';
  if (kind === 'patrol') return 'patrol';
  return 'freighter';
}

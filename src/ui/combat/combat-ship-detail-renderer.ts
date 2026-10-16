import type { ShipHardpoints } from '../../core/ship-types';
import type { CombatMineSnapshot } from '../../systems/combat/strategic-combat-service';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Only the marker changes with arming state; the mine's gameplay stays independent. */
export function drawCombatMineMarker(
  context: CanvasRenderingContext2D,
  mine: CombatMineSnapshot,
  point: Point
): void {
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = mine.armed ? 'rgba(226, 108, 82, .76)' : 'rgba(175, 177, 151, .48)';
    context.fillStyle = 'rgba(44, 49, 51, .9)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
      context.lineTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      context.stroke();
    }
    context.restore();}

/** Existing ship silhouette and lighting, extracted unchanged from the main renderer. */
export function drawCombatShipBody(
  context: CanvasRenderingContext2D,
  geometry: ShipScreenGeometry,
  hullRatio: number,
  image: HTMLImageElement | null,
  hardpoints: ShipHardpoints | undefined,
  lighting: ShipLightingRenderer
): void {
    context.save();
    context.translate(geometry.center.x, geometry.center.y);
    context.rotate(geometry.angle);
    context.globalAlpha = hullRatio <= 0 ? 0.28 : 1;
    if (image && image.complete && image.naturalWidth > 0 && hardpoints) {
      const offset = spriteDrawOffset(hardpoints, geometry);
      lighting.draw(context, {
        image,
        width: geometry.width,
        height: geometry.height,
        angle: geometry.angle,
        light: { x: -0.72, y: -0.56 },
        offsetX: offset.x,
        offsetY: offset.y,
        directionalStrength: 2.05,
      });
    } else if (image && image.complete && image.naturalWidth > 0) {
      context.drawImage(
        image,
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    } else {
      context.fillStyle = '#a4b2ba';
      context.fillRect(
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    }
    context.restore();}

export function drawCombatShipCaption(
  context: CanvasRenderingContext2D,
  name: string,
  hullRatio: number,
  geometry: ShipScreenGeometry
): void {
    context.fillStyle = hullRatio > 0.35 ? 'rgba(220, 232, 238, .78)' : '#d88673';
    context.font = '10px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText(
      name.toUpperCase(),
      geometry.center.x,
      geometry.center.y + geometry.height * 0.8 + 18
    );}

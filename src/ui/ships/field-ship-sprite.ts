import { spriteDrawOffset, type ShipScreenGeometry } from './ship-hardpoint-projector';
import type { ShipLightingRenderer } from './ship-lighting-renderer';
export function drawFieldShipSprite(
  ctx: CanvasRenderingContext2D,
  lighting: ShipLightingRenderer,
  image: HTMLImageElement,
  hardpoints: Parameters<typeof spriteDrawOffset>[0],
  geometry: ShipScreenGeometry,
  fallback: string
) {
  ctx.save();
  ctx.translate(geometry.center.x, geometry.center.y);
  ctx.rotate(geometry.angle);
  if (image.complete && image.naturalWidth > 0) {
    const offset = spriteDrawOffset(hardpoints, geometry);
    lighting.draw(ctx, {
      image,
      width: geometry.width,
      height: geometry.height,
      angle: geometry.angle,
      light: { x: -0.72, y: -0.56 },
      offsetX: offset.x,
      offsetY: offset.y,
      directionalStrength: 2.05,
    });
  } else {
    ctx.fillStyle = fallback;
    ctx.fillRect(-geometry.width / 2, -geometry.height / 2, geometry.width, geometry.height);
  }
  ctx.restore();
}

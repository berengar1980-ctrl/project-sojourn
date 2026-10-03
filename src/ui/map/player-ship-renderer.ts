import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import type { ShipHardpoint, ShipHardpoints } from '../../core/ship-types';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

const BASE_SHIP_WIDTH = 72;

function localPoint(
  hardpoint: ShipHardpoint,
  source: ShipHardpoints,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: ((hardpoint.x - source.pivot.x) / source.sourceWidth) * width,
    y: ((hardpoint.y - source.pivot.y) / source.sourceHeight) * height,
  };
}

export class PlayerShipRenderer {
  private readonly image = new Image();
  private loadedUrl = '';

  constructor(private readonly requestRedraw: () => void) {}

  draw(
    context: CanvasRenderingContext2D,
    ship: PlayerShipMapView,
    point: ScreenPoint,
    relativeZoom: number,
    timeSeconds: number
  ): void {
    this.ensureImage(ship.spriteUrl);

    const scale = shipSymbolScale(relativeZoom);
    const width = BASE_SHIP_WIDTH * scale;
    const aspectRatio = this.imageAspectRatio(ship.spriteAspectRatio);
    const height = width / aspectRatio;

    context.save();
    context.translate(point.x, point.y);
    context.rotate(ship.headingRadians);

    if (ship.isTravelling) {
      this.drawEngineGlow(context, ship, width, height, timeSeconds);
    }

    if (this.image.complete && this.image.naturalWidth > 0) {
      const source = ship.hardpoints;
      context.drawImage(
        this.image,
        -(source.pivot.x / source.sourceWidth) * width,
        -(source.pivot.y / source.sourceHeight) * height,
        width,
        height
      );
    } else {
      this.drawFallback(context, width, height);
    }

    context.restore();
  }

  private imageAspectRatio(fallback: number): number {
    if (this.image.complete && this.image.naturalWidth > 0 && this.image.naturalHeight > 0) {
      return this.image.naturalWidth / this.image.naturalHeight;
    }

    return fallback;
  }

  private ensureImage(url: string): void {
    if (this.loadedUrl === url) return;
    this.loadedUrl = url;
    this.image.onload = this.requestRedraw;
    this.image.src = url;
  }

  private drawEngineGlow(
    context: CanvasRenderingContext2D,
    ship: PlayerShipMapView,
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const pulse = 0.94 + Math.sin(timeSeconds * 12) * 0.04;
    const source = ship.hardpoints;

    for (const hardpoint of source.engines) {
      const nozzle = localPoint(hardpoint, source, width, height);
      const radiusX = Math.max(2, (hardpoint.width / source.sourceWidth) * width * 0.6);
      const radiusY = Math.max(1.2, radiusX * 0.45);
      const glow = context.createRadialGradient(
        nozzle.x,
        nozzle.y,
        0,
        nozzle.x - radiusX * 0.35,
        nozzle.y,
        radiusX
      );

      glow.addColorStop(0, 'rgba(240, 253, 255, ' + 0.92 * pulse + ')');
      glow.addColorStop(0.35, 'rgba(88, 197, 255, ' + 0.5 * pulse + ')');
      glow.addColorStop(1, 'rgba(36, 129, 255, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(nozzle.x - radiusX * 0.3, nozzle.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  private drawFallback(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.fillStyle = '#758b98';
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(-width / 2, -height / 2);
    context.lineTo(-width / 2, height / 2);
    context.closePath();
    context.fill();
  }
}

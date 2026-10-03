import type {
  PlayerShipMapView,
  StarMapLocationView,
} from '../../features/star-map/star-map-view-model';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

const BASE_SHIP_WIDTH = 72;

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
      this.drawEngineGlow(context, ship, width, height, scale, timeSeconds);
    }

    if (this.image.complete && this.image.naturalWidth > 0) {
      context.drawImage(this.image, -width / 2, -height / 2, width, height);
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
    scale: number,
    timeSeconds: number
  ): void {
    const pulse = 0.94 + Math.sin(timeSeconds * 12) * 0.04;
    const glowRadiusX = 5.4 * scale;
    const glowRadiusY = 2.8 * scale;

    for (const anchor of ship.engineAnchors) {
      const nozzleX = (anchor.x - 0.5) * width;
      const nozzleY = (anchor.y - 0.5) * height;
      const glow = context.createRadialGradient(
        nozzleX,
        nozzleY,
        0,
        nozzleX - glowRadiusX * 0.3,
        nozzleY,
        glowRadiusX
      );
      glow.addColorStop(0, 'rgba(240, 253, 255, ' + 0.92 * pulse + ')');
      glow.addColorStop(0.35, 'rgba(88, 197, 255, ' + 0.5 * pulse + ')');
      glow.addColorStop(1, 'rgba(36, 129, 255, 0)');

      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(
        nozzleX - glowRadiusX * 0.28,
        nozzleY,
        glowRadiusX,
        glowRadiusY,
        0,
        0,
        Math.PI * 2
      );
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

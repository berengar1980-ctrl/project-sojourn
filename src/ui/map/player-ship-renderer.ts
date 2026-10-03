import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

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

    const width = 118 * shipSymbolScale(relativeZoom);
    const aspectRatio = this.imageAspectRatio(ship.spriteAspectRatio);
    const height = width / aspectRatio;

    context.save();
    context.translate(point.x, point.y);
    context.rotate(ship.headingRadians);

    if (ship.isTravelling) this.drawEngineGlow(context, width, height, timeSeconds);

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
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const pulse = 0.92 + Math.sin(timeSeconds * 12) * 0.05;
    const nozzleX = -width * 0.47;
    const nozzleOffsets = [-height * 0.26, height * 0.26];

    for (const offsetY of nozzleOffsets) {
      const glow = context.createRadialGradient(
        nozzleX,
        offsetY,
        0,
        nozzleX - width * 0.025,
        offsetY,
        width * 0.065
      );
      glow.addColorStop(0, 'rgba(238, 252, 255, ' + 0.9 * pulse + ')');
      glow.addColorStop(0.36, 'rgba(96, 202, 255, ' + 0.48 * pulse + ')');
      glow.addColorStop(1, 'rgba(36, 129, 255, 0)');

      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(
        nozzleX - width * 0.02,
        offsetY,
        width * 0.065,
        height * 0.055,
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

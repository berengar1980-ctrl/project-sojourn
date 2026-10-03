import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import type { ScreenPoint } from './map-camera';

export class PlayerShipRenderer {
  private readonly image = new Image();
  private loadedUrl = '';

  constructor(private readonly requestRedraw: () => void) {}

  draw(
    context: CanvasRenderingContext2D,
    ship: PlayerShipMapView,
    point: ScreenPoint,
    timeSeconds: number
  ): void {
    this.ensureImage(ship.spriteUrl);

    const width = 112;
    const height = width / ship.spriteAspectRatio;

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
    const nozzleX = -width * 0.49;
    const nozzleOffsets = [-height * 0.28, height * 0.28];

    for (const offsetY of nozzleOffsets) {
      const glow = context.createRadialGradient(
        nozzleX - width * 0.015,
        offsetY,
        0,
        nozzleX - width * 0.035,
        offsetY,
        width * 0.095
      );
      glow.addColorStop(0, 'rgba(235, 252, 255, ' + 0.95 * pulse + ')');
      glow.addColorStop(0.28, 'rgba(92, 205, 255, ' + 0.56 * pulse + ')');
      glow.addColorStop(1, 'rgba(36, 129, 255, 0)');

      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(
        nozzleX - width * 0.035,
        offsetY,
        width * 0.095,
        height * 0.07,
        0,
        0,
        Math.PI * 2
      );
      context.fill();

      context.fillStyle = 'rgba(224, 248, 255, ' + 0.72 * pulse + ')';
      context.beginPath();
      context.ellipse(nozzleX, offsetY, width * 0.014, height * 0.045, 0, 0, Math.PI * 2);
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

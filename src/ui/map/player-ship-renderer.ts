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
    mapZoom: number,
    timeSeconds: number
  ): void {
    this.ensureImage(ship.spriteUrl);

    const width = Math.min(128, Math.max(62, 82 * Math.sqrt(Math.max(0.5, mapZoom))));
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
    const pulse = 0.9 + Math.sin(timeSeconds * 13) * 0.08;
    const engineX = -width * 0.48;
    const spread = height * 0.19;

    for (const offset of [-spread, spread]) {
      const glow = context.createRadialGradient(
        engineX,
        offset,
        1,
        engineX - width * 0.16,
        offset,
        width * 0.34
      );
      glow.addColorStop(0, 'rgba(215, 248, 255, ' + 0.9 * pulse + ')');
      glow.addColorStop(0.25, 'rgba(88, 202, 255, ' + 0.62 * pulse + ')');
      glow.addColorStop(1, 'rgba(50, 133, 255, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(
        engineX - width * 0.12,
        offset,
        width * 0.34,
        height * 0.16,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }

  private drawFallback(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    context.fillStyle = '#758b98';
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(-width / 2, -height / 2);
    context.lineTo(-width / 2, height / 2);
    context.closePath();
    context.fill();
  }
}

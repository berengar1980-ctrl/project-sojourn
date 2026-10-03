import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import {
  spriteDrawOffset,
  type ShipScreenGeometry,
} from '../ships/ship-hardpoint-projector';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

const BASE_SHIP_WIDTH = 72;

export class PlayerShipRenderer {
  private readonly image = new Image();
  private readonly engineEffects = new ShipEngineEffectsRenderer();
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
    const geometry: ShipScreenGeometry = {
      center: point,
      width,
      height: width / aspectRatio,
      angle: ship.headingRadians,
    };

    if (ship.isTravelling) {
      this.engineEffects.draw(context, ship.hardpoints, geometry, 0.82, timeSeconds);
    }

    context.save();
    context.translate(point.x, point.y);
    context.rotate(ship.headingRadians);

    if (this.image.complete && this.image.naturalWidth > 0) {
      const offset = spriteDrawOffset(ship.hardpoints, geometry);
      context.drawImage(this.image, offset.x, offset.y, geometry.width, geometry.height);
    } else {
      this.drawFallback(context, geometry.width, geometry.height);
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

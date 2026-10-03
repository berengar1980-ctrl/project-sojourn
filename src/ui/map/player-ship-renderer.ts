import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipHardpointDebugRenderer } from '../ships/ship-hardpoint-debug-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

const BASE_SHIP_WIDTH = 44;

function idleShipMotion(timeSeconds: number): {
  offsetX: number;
  offsetY: number;
  headingOffset: number;
  angularThrust: number;
  lateralThrust: number;
} {
  const slow = timeSeconds * 0.52;
  const secondary = timeSeconds * 0.21 + 1.3;
  return {
    offsetX: Math.sin(secondary) * 1.2,
    offsetY: Math.sin(slow) * 2.4 + Math.sin(secondary * 1.7) * 0.9,
    headingOffset: Math.sin(slow * 0.78) * 0.022 + Math.sin(secondary) * 0.008,
    angularThrust: Math.sin(slow * 0.78 + Math.PI / 2) * 0.22,
    lateralThrust: Math.sin(slow + Math.PI / 2) * 0.2,
  };
}

export class PlayerShipRenderer {
  private readonly image = new Image();
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly hardpointDebug = new ShipHardpointDebugRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private loadedUrl = '';
  private debugHardpoints = false;

  constructor(private readonly requestRedraw: () => void) {}

  toggleHardpointDebug(): void {
    this.debugHardpoints = !this.debugHardpoints;
    this.requestRedraw();
  }

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
    const idle = ship.isTravelling ? null : idleShipMotion(timeSeconds);
    const center = idle
      ? { x: point.x + idle.offsetX * scale, y: point.y + idle.offsetY * scale }
      : point;
    const angle = ship.headingRadians + (idle?.headingOffset ?? 0);
    const geometry: ShipScreenGeometry = {
      center,
      width,
      height: width / aspectRatio,
      angle,
    };

    if (ship.isTravelling) {
      this.engineEffects.draw(context, ship.hardpoints, geometry, 0.82, timeSeconds);
    }

    this.maneuverEffects.draw(
      context,
      ship.hardpoints,
      geometry,
      idle
        ? {
            turnRateRadiansPerSecond: idle.angularThrust * 0.035,
            angularThrust: idle.angularThrust,
            lateralThrust: idle.lateralThrust,
          }
        : {
            turnRateRadiansPerSecond: ship.turnRateRadiansPerSecond,
            angularThrust: ship.angularThrust,
            lateralThrust: ship.lateralThrust,
          },
      timeSeconds
    );

    context.save();
    context.translate(center.x, center.y);
    context.rotate(angle);

    if (this.image.complete && this.image.naturalWidth > 0) {
      const offset = spriteDrawOffset(ship.hardpoints, geometry);
      context.drawImage(this.image, offset.x, offset.y, geometry.width, geometry.height);
    } else {
      this.drawFallback(context, geometry.width, geometry.height);
    }

    context.restore();

    if (this.debugHardpoints) {
      this.hardpointDebug.draw(context, ship.hardpoints, geometry);
    }
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

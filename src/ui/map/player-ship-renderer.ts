import type { LocalShipState } from '../../core/local-space-types';
import type { PlayerShipMapView } from '../../features/star-map/star-map-view-model';
import {
  createIdleStationKeepingState,
  updateIdleStationKeeping,
  type IdleStationKeepingState,
} from '../../systems/local-space/local-space-station-keeping';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipHardpointDebugRenderer } from '../ships/ship-hardpoint-debug-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShipLightingRenderer, type ShipLightVector } from '../ships/ship-lighting-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { ScreenPoint } from './map-camera';
import { shipSymbolScale } from './map-visual-scale';

const BASE_SHIP_WIDTH = 32;

function idleSeed(name: string): number {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class PlayerShipRenderer {
  private readonly image = new Image();
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly hardpointDebug = new ShipHardpointDebugRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private readonly lighting = new ShipLightingRenderer();
  private loadedUrl = '';
  private debugHardpoints = false;
  private idleShip: LocalShipState | null = null;
  private idleState: IdleStationKeepingState | null = null;
  private idleHoldHeading = 0;
  private idleSeedValue = 0;
  private lastIdleTimeSeconds = 0;

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
    timeSeconds: number,
    light: ShipLightVector
  ): void {
    this.ensureImage(ship.spriteUrl);

    const scale = shipSymbolScale(relativeZoom);
    const width = BASE_SHIP_WIDTH * scale;
    const aspectRatio = this.imageAspectRatio(ship.spriteAspectRatio);
    const idle = ship.isTravelling ? null : this.updateIdleShip(ship, timeSeconds);
    const pixelsPerMeter = width / ship.nominalLengthMeters;
    const center = idle
      ? {
          x: point.x + idle.position.x * pixelsPerMeter,
          y: point.y + idle.position.y * pixelsPerMeter,
        }
      : point;
    const angle = idle?.headingRadians ?? ship.headingRadians;
    const geometry: ShipScreenGeometry = {
      center,
      width,
      height: width / aspectRatio,
      angle,
    };

    if (ship.isTravelling) {
      this.resetIdleShip();
      this.engineEffects.draw(context, ship.hardpoints, geometry, 0.82, timeSeconds);
    }

    this.maneuverEffects.draw(
      context,
      ship.hardpoints,
      geometry,
      idle ?? {
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
      this.lighting.draw(context, {
        image: this.image,
        width: geometry.width,
        height: geometry.height,
        angle,
        light,
        offsetX: offset.x,
        offsetY: offset.y,
      });
    } else {
      this.drawFallback(context, geometry.width, geometry.height);
    }

    context.restore();

    if (this.debugHardpoints) {
      this.hardpointDebug.draw(context, ship.hardpoints, geometry);
    }
  }

  private updateIdleShip(ship: PlayerShipMapView, timeSeconds: number): LocalShipState {
    if (!this.idleShip || !this.idleState || this.idleHoldHeading !== ship.headingRadians) {
      this.idleShip = {
        position: { x: 0, y: 0 },
        headingRadians: ship.headingRadians,
        speed: 0,
        turnRateRadiansPerSecond: 0,
        angularThrust: 0,
        lateralThrust: 0,
      };
      this.idleSeedValue = idleSeed(ship.name);
      this.idleState = createIdleStationKeepingState(this.idleSeedValue, this.idleShip);
      this.idleHoldHeading = ship.headingRadians;
      this.lastIdleTimeSeconds = timeSeconds;
      return this.idleShip;
    }

    const deltaSeconds = Math.min(0.1, Math.max(0, timeSeconds - this.lastIdleTimeSeconds));
    this.lastIdleTimeSeconds = timeSeconds;
    updateIdleStationKeeping(
      this.idleState,
      this.idleShip,
      { x: 0, y: 0 },
      this.idleSeedValue,
      deltaSeconds
    );
    return this.idleShip;
  }

  private resetIdleShip(): void {
    this.idleShip = null;
    this.idleState = null;
    this.lastIdleTimeSeconds = 0;
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

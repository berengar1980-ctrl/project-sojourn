import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import {
  projectShieldGeometry,
  spriteDrawOffset,
  type ShipScreenGeometry,
} from '../ships/ship-hardpoint-projector';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { MiningEffectsRenderer } from './mining-effects-renderer';

interface AsteroidHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class LocalSpaceRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: MapCamera;
  private readonly miningEffects: MiningEffectsRenderer;
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly backgroundRenderer: SpaceBackgroundRenderer;
  private readonly shipImage = new Image();
  private model: LocalSpaceViewModel;
  private hitAreas: readonly AsteroidHitArea[] = [];
  private loadedShipUrl = '';
  private hasFitted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: LocalSpaceViewModel
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Local-space canvas context unavailable.');

    this.context = context;
    this.model = model;
    this.camera = new MapCamera(model.width, model.height);
    this.miningEffects = new MiningEffectsRenderer(context, this.camera);
    this.backgroundRenderer = new SpaceBackgroundRenderer(context, model.backgroundSeed);
    this.resize();
  }

  update(model: LocalSpaceViewModel): void {
    this.model = model;
    this.ensureShipImage(model.ship.spriteUrl);
    this.draw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (!this.hasFitted) {
      this.camera.fit(rect.width, rect.height);
      this.hasFitted = true;
    }

    this.ensureShipImage(this.model.ship.spriteUrl);
    this.draw();
  }

  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }

  zoomAt(deltaY: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const factor = Math.exp(-deltaY * 0.00135);
    this.camera.zoomAt(factor, { x, y }, rect.width, rect.height);
    this.draw();
  }

  pickAsteroid(x: number, y: number): string | null {
    let best: AsteroidHitArea | null = null;
    for (const area of this.hitAreas) {
      if (Math.hypot(x - area.point.x, y - area.point.y) > area.radius) continue;
      if (!best || area.radius < best.radius) best = area;
    }
    return best?.id ?? null;
  }

  private ensureShipImage(url: string): void {
    if (this.loadedShipUrl === url) return;
    this.loadedShipUrl = url;
    this.shipImage.onload = () => this.draw();
    this.shipImage.src = url;
  }

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const timeSeconds = performance.now() / 1000;
    const geometry = this.shipGeometry(width, height);

    this.backgroundRenderer.draw({
      width,
      height,
      cameraCenter: this.camera.getCenter(),
      cameraZoom: this.camera.getZoom(),
      timeSeconds,
    });
    this.miningEffects.drawTractorFields(this.model, width, height, timeSeconds);

    const hitAreas: AsteroidHitArea[] = [];
    for (const asteroid of this.model.asteroids) {
      const hitArea = this.drawAsteroid(asteroid, width, height);
      if (asteroid.kind === 'resource') hitAreas.push(hitArea);
    }
    this.hitAreas = hitAreas;

    this.drawChunks(width, height);
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds);
    this.drawShip(geometry, timeSeconds);
  }

  private drawAsteroid(
    asteroid: LocalAsteroidView,
    width: number,
    height: number
  ): AsteroidHitArea {
    const point = this.camera.worldToScreen(asteroid.position, width, height);
    const minimumRadius = asteroid.kind === 'debris' ? 2 : 10;
    const radius = Math.max(minimumRadius, this.camera.scale(asteroid.radius));
    const seed = hashId(asteroid.id);

    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(asteroid.rotation);
    this.context.beginPath();

    for (let vertex = 0; vertex < 10; vertex += 1) {
      const angle = (vertex / 10) * Math.PI * 2;
      const wobble = 0.76 + ((seed >>> (vertex % 8)) & 7) / 28;
      const x = Math.cos(angle) * radius * wobble;
      const y = Math.sin(angle) * radius * wobble;
      if (vertex === 0) this.context.moveTo(x, y);
      else this.context.lineTo(x, y);
    }

    this.context.closePath();
    const gradient = this.context.createRadialGradient(
      -radius * 0.3,
      -radius * 0.35,
      2,
      0,
      0,
      radius
    );

    if (asteroid.kind === 'debris') {
      gradient.addColorStop(0, '#77716a');
      gradient.addColorStop(0.55, '#4c4742');
      gradient.addColorStop(1, '#24211f');
    } else {
      gradient.addColorStop(0, '#9b9186');
      gradient.addColorStop(0.52, '#625a53');
      gradient.addColorStop(1, '#2d2926');
    }

    this.context.fillStyle = gradient;
    this.context.fill();
    this.context.strokeStyle = 'rgba(195, 184, 168, .2)';
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.restore();

    if (asteroid.kind === 'resource' && (asteroid.isSelected || asteroid.isMiningTarget)) {
      this.context.strokeStyle = asteroid.isMiningTarget ? '#67d1e8' : '#dfc173';
      this.context.lineWidth = 1.7;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2);
      this.context.stroke();
    }

    return { id: asteroid.id, point, radius: radius + 10 };
  }

  private shipGeometry(width: number, height: number): ShipScreenGeometry {
    const center = this.camera.worldToScreen(this.model.ship.position, width, height);
    const shipWidth = this.camera.scale(this.model.ship.nominalLengthMeters);
    const aspectRatio =
      this.shipImage.complete && this.shipImage.naturalHeight > 0
        ? this.shipImage.naturalWidth / this.shipImage.naturalHeight
        : this.model.ship.spriteAspectRatio;

    return {
      center,
      width: shipWidth,
      height: shipWidth / aspectRatio,
      angle: this.model.ship.headingRadians,
    };
  }

  private drawShip(geometry: ShipScreenGeometry, timeSeconds: number): void {
    const source = this.model.ship.hardpoints;
    const engineIntensity = Math.min(1, this.model.ship.speed / 240);
    this.engineEffects.draw(this.context, source, geometry, engineIntensity, timeSeconds);

    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(geometry.angle);

    if (this.shipImage.complete && this.shipImage.naturalWidth > 0) {
      const offset = spriteDrawOffset(source, geometry);
      this.context.drawImage(this.shipImage, offset.x, offset.y, geometry.width, geometry.height);
    }

    this.context.restore();

    if (this.model.shieldFlash > 0) {
      this.drawShieldFlash(geometry);
    }
  }

  private drawShieldFlash(geometry: ShipScreenGeometry): void {
    const source = this.model.ship.hardpoints;
    const shield = projectShieldGeometry(source.shield, source, geometry);
    const intensity = Math.min(1, this.model.shieldFlash);

    this.context.save();
    this.context.translate(shield.center.x, shield.center.y);
    this.context.rotate(shield.angle);
    this.context.shadowColor = 'rgba(70, 180, 255, .98)';
    this.context.shadowBlur = 24 + intensity * 16;
    this.context.lineWidth = 2.5 + intensity * 3.5;
    this.context.strokeStyle = 'rgba(104, 202, 255, ' + (0.38 + 0.58 * intensity) + ')';
    this.context.fillStyle = 'rgba(65, 154, 255, ' + (0.1 + 0.18 * intensity) + ')';
    this.context.beginPath();
    this.context.ellipse(0, 0, shield.radiusX, shield.radiusY, 0, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();

    this.context.lineWidth = 1;
    this.context.strokeStyle = 'rgba(205, 240, 255, ' + 0.76 * intensity + ')';
    this.context.beginPath();
    this.context.ellipse(0, 0, shield.radiusX * 0.96, shield.radiusY * 0.96, 0, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      const variation = (hashId(chunk.id) % 100) / 100;
      const radius = 1.5 + variation * 2.2;
      this.context.fillStyle = '#a88f73';
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}

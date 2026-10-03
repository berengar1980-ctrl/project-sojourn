import type { ShipHardpoint } from '../../core/ship-types';
import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { MapCamera, type ScreenPoint } from '../map/map-camera';

interface AsteroidHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}

interface ShipScreenGeometry {
  readonly center: ScreenPoint;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotatePoint(x: number, y: number, angle: number): ScreenPoint {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}

export class LocalSpaceRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: MapCamera;
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

    this.drawBackground(width, height);
    this.drawTractorFields(width, height);
    this.hitAreas = this.model.asteroids.map((asteroid) =>
      this.drawAsteroid(asteroid, width, height)
    );
    this.drawChunks(width, height);
    this.drawMiningLasers(width, height);
    this.drawShip(width, height);
  }

  private drawBackground(width: number, height: number): void {
    this.context.fillStyle = '#020407';
    this.context.fillRect(0, 0, width, height);

    for (let index = 0; index < 130; index += 1) {
      const x = (index * 241 + 53) % Math.max(1, Math.floor(width));
      const y = (index * 131 + 17) % Math.max(1, Math.floor(height));
      const size = index % 13 === 0 ? 1.4 : 0.65;
      this.context.fillStyle =
        index % 10 === 0 ? 'rgba(160, 194, 235, .55)' : 'rgba(220, 228, 237, .28)';
      this.context.fillRect(x, y, size, size);
    }
  }

  private drawAsteroid(
    asteroid: LocalAsteroidView,
    width: number,
    height: number
  ): AsteroidHitArea {
    const point = this.camera.worldToScreen(asteroid.position, width, height);
    const radius = Math.max(10, this.camera.scale(asteroid.radius));
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
    gradient.addColorStop(0, '#9b9186');
    gradient.addColorStop(0.52, '#625a53');
    gradient.addColorStop(1, '#2d2926');
    this.context.fillStyle = gradient;
    this.context.fill();
    this.context.strokeStyle = 'rgba(195, 184, 168, .2)';
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.restore();

    if (asteroid.isSelected || asteroid.isMiningTarget) {
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
    const shipWidth = 144;
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

  private hardpointScreen(hardpoint: ShipHardpoint, geometry: ShipScreenGeometry): ScreenPoint {
    const source = this.model.ship.hardpoints;
    const localX = (hardpoint.x / source.sourceWidth - 0.5) * geometry.width;
    const localY = (hardpoint.y / source.sourceHeight - 0.5) * geometry.height;
    const rotated = rotatePoint(localX, localY, geometry.angle);
    return {
      x: geometry.center.x + rotated.x,
      y: geometry.center.y + rotated.y,
    };
  }

  private drawShip(width: number, height: number): void {
    const geometry = this.shipGeometry(width, height);

    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(geometry.angle);

    if (this.model.ship.speed > 0) {
      this.drawEngineGlow(geometry.width, geometry.height);
    }

    if (this.shipImage.complete && this.shipImage.naturalWidth > 0) {
      this.context.drawImage(
        this.shipImage,
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    }

    if (this.model.shieldFlash > 0) {
      this.drawShieldFlash(geometry.width, geometry.height);
    }

    this.context.restore();
  }

  private drawEngineGlow(shipWidth: number, shipHeight: number): void {
    const source = this.model.ship.hardpoints;

    for (const hardpoint of source.engines) {
      const x = (hardpoint.x / source.sourceWidth - 0.5) * shipWidth;
      const y = (hardpoint.y / source.sourceHeight - 0.5) * shipHeight;
      const radius = Math.max(4, (hardpoint.width / source.sourceWidth) * shipWidth * 0.7);
      const glow = this.context.createRadialGradient(x, y, 0, x - radius * 0.35, y, radius);
      glow.addColorStop(0, 'rgba(235, 252, 255, .88)');
      glow.addColorStop(0.35, 'rgba(78, 190, 255, .5)');
      glow.addColorStop(1, 'rgba(40, 125, 255, 0)');
      this.context.fillStyle = glow;
      this.context.beginPath();
      this.context.ellipse(x - radius * 0.3, y, radius, radius * 0.38, 0, 0, Math.PI * 2);
      this.context.fill();
    }
  }

  private drawShieldFlash(shipWidth: number, shipHeight: number): void {
    const source = this.model.ship.hardpoints;
    const shield = source.shield;
    const x = (shield.centerX / source.sourceWidth - 0.5) * shipWidth;
    const y = (shield.centerY / source.sourceHeight - 0.5) * shipHeight;
    const radiusX = (shield.radiusX / source.sourceWidth) * shipWidth;
    const radiusY = (shield.radiusY / source.sourceHeight) * shipHeight;
    const intensity = Math.min(1, this.model.shieldFlash);

    this.context.save();
    this.context.shadowColor = 'rgba(65, 174, 255, .9)';
    this.context.shadowBlur = 16 * intensity;
    this.context.lineWidth = 1.5 + intensity * 2.5;
    this.context.strokeStyle = 'rgba(92, 190, 255, ' + 0.82 * intensity + ')';
    this.context.fillStyle = 'rgba(64, 148, 255, ' + 0.08 * intensity + ')';
    this.context.beginPath();
    this.context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  private drawMiningLasers(width: number, height: number): void {
    if (!this.model.laserActive || !this.model.miningTarget) return;

    const geometry = this.shipGeometry(width, height);
    const target = this.camera.worldToScreen(this.model.miningTarget.position, width, height);

    this.context.save();
    this.context.strokeStyle = 'rgba(237, 92, 63, .92)';
    this.context.shadowColor = 'rgba(255, 82, 44, .75)';
    this.context.shadowBlur = 7;

    for (const hardpoint of this.model.ship.hardpoints.miningLasers) {
      const start = this.hardpointScreen(hardpoint, geometry);
      this.context.lineWidth = Math.max(
        1.2,
        (hardpoint.width / this.model.ship.hardpoints.sourceWidth) * geometry.width * 0.8
      );
      this.context.beginPath();
      this.context.moveTo(start.x, start.y);
      this.context.lineTo(target.x, target.y);
      this.context.stroke();
    }

    this.context.restore();
    this.context.fillStyle = 'rgba(255, 176, 92, .85)';
    this.context.beginPath();
    this.context.arc(target.x, target.y, 4.5, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      const radius = 3 + Math.min(4, chunk.amount * 0.35);
      this.context.fillStyle = '#a88f73';
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
    }
  }

  private drawTractorFields(width: number, height: number): void {
    const ship = this.camera.worldToScreen(this.model.ship.position, width, height);
    const time = performance.now() / 1000;
    this.context.save();

    this.model.chunks.forEach((chunk, index) => {
      if (!chunk.tractorActive) return;
      const point = this.camera.worldToScreen(chunk.position, width, height);
      const pulse = 0.55 + Math.sin(time * 9 + index * 0.8) * 0.25;

      this.context.shadowColor = 'rgba(77, 255, 145, .8)';
      this.context.shadowBlur = 8 + pulse * 7;
      this.context.strokeStyle = 'rgba(62, 235, 126, ' + 0.22 * pulse + ')';
      this.context.lineWidth = 5 + pulse * 2;
      this.context.beginPath();
      this.context.moveTo(point.x, point.y);
      this.context.lineTo(ship.x, ship.y);
      this.context.stroke();

      this.context.shadowBlur = 3;
      this.context.strokeStyle = 'rgba(156, 255, 190, ' + 0.78 * pulse + ')';
      this.context.lineWidth = 1.2 + pulse;
      this.context.beginPath();
      this.context.moveTo(point.x, point.y);
      this.context.lineTo(ship.x, ship.y);
      this.context.stroke();
    });

    this.context.restore();
  }
}

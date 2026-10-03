import type { WorldPoint } from '../../core/world-types';
import type {
  StarMapLocationView,
  StarMapViewModel,
} from '../../features/star-map/star-map-view-model';
import { MapCamera } from './map-camera';
import { PlayerShipRenderer } from './player-ship-renderer';

interface HitArea {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export class TopdownMapRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: MapCamera;
  private readonly shipRenderer: PlayerShipRenderer;
  private model: StarMapViewModel;
  private hasFitted = false;
  private hitAreas: readonly HitArea[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: StarMapViewModel
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context unavailable.');

    this.context = context;
    this.model = model;
    this.camera = new MapCamera(model.width, model.height);
    this.shipRenderer = new PlayerShipRenderer(() => this.draw());
    this.resize();
  }

  update(model: StarMapViewModel): void {
    this.model = model;
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
    this.draw();
  }

  resetCamera(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.fit(rect.width, rect.height);
    this.draw();
  }

  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }

  zoomAt(deltaY: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const factor = Math.exp(-deltaY * 0.0015);
    this.camera.zoomAt(factor, { x, y }, rect.width, rect.height);
    this.draw();
  }

  pickLocation(x: number, y: number): string | null {
    let best: HitArea | null = null;
    for (const area of this.hitAreas) {
      if (Math.hypot(x - area.x, y - area.y) > area.radius) continue;
      if (!best || area.radius < best.radius) best = area;
    }
    return best?.id ?? null;
  }

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    this.context.clearRect(0, 0, width, height);

    this.drawBackground(width, height);
    this.drawRegions(width, height);
    this.drawOrbits(width, height);
    this.drawStar(width, height);
    this.drawRoute(width, height);
    this.hitAreas = this.model.locations.map((location) =>
      this.drawLocation(location, width, height)
    );
    this.drawPlayerShip(width, height);
  }

  private drawPlayerShip(width: number, height: number): void {
    const point = this.camera.worldToScreen(this.model.playerShip.position, width, height);
    this.shipRenderer.draw(
      this.context,
      this.model.playerShip,
      point,
      this.camera.getZoom(),
      performance.now() / 1000
    );
  }

  private drawBackground(width: number, height: number): void {
    const gradient = this.context.createRadialGradient(
      width * 0.52,
      height * 0.48,
      20,
      width * 0.52,
      height * 0.48,
      Math.max(width, height) * 0.8
    );
    gradient.addColorStop(0, '#132033');
    gradient.addColorStop(1, '#04070d');
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, width, height);

    this.context.fillStyle = 'rgba(210, 226, 255, 0.55)';
    for (let index = 0; index < 90; index += 1) {
      const x = (index * 193 + 71) % Math.max(1, Math.floor(width));
      const y = (index * 97 + 29) % Math.max(1, Math.floor(height));
      const size = index % 7 === 0 ? 1.5 : 0.8;
      this.context.fillRect(x, y, size, size);
    }
  }

  private drawStar(width: number, height: number): void {
    const point = this.camera.worldToScreen(this.model.star.position, width, height);
    const radius = Math.max(28, this.camera.scale(this.model.star.radius));
    const corona = this.context.createRadialGradient(
      point.x,
      point.y,
      radius * 0.65,
      point.x,
      point.y,
      radius * 2.1
    );
    corona.addColorStop(0, 'rgba(255, 210, 112, .48)');
    corona.addColorStop(0.4, 'rgba(240, 150, 56, .18)');
    corona.addColorStop(1, 'rgba(240, 150, 56, 0)');
    this.context.fillStyle = corona;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius * 2.1, 0, Math.PI * 2);
    this.context.fill();

    const body = this.context.createRadialGradient(
      point.x - radius * 0.25,
      point.y - radius * 0.3,
      radius * 0.12,
      point.x,
      point.y,
      radius
    );
    body.addColorStop(0, '#fffbea');
    body.addColorStop(0.32, this.model.star.colorCore);
    body.addColorStop(0.75, this.model.star.colorCorona);
    body.addColorStop(1, '#a74920');
    this.context.fillStyle = body;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = 'rgba(255,244,215,.86)';
    this.context.font = '600 12px system-ui';
    this.context.textAlign = 'center';
    this.context.fillText(this.model.star.name.toUpperCase(), point.x, point.y + radius + 22);
  }

  private drawOrbits(width: number, height: number): void {
    const star = this.camera.worldToScreen(this.model.star.position, width, height);
    const radii = [
      ...new Set(
        this.model.locations
          .map((location) => location.orbitRadius)
          .filter((radius): radius is number => radius != null)
      ),
    ].sort((a, b) => a - b);

    this.context.save();
    this.context.strokeStyle = 'rgba(129, 151, 174, .10)';
    this.context.lineWidth = 1;
    for (const orbit of radii) {
      this.context.beginPath();
      this.context.arc(star.x, star.y, this.camera.scale(orbit), 0, Math.PI * 2);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawRegions(width: number, height: number): void {
    for (const region of this.model.regions) {
      const center = this.camera.worldToScreen(region.center, width, height);
      const radius = this.camera.scale(region.radius);
      const gradient = this.context.createRadialGradient(
        center.x,
        center.y,
        radius * 0.15,
        center.x,
        center.y,
        radius
      );
      gradient.addColorStop(0, 'rgba(155, 48, 44, 0.10)');
      gradient.addColorStop(0.7, 'rgba(155, 48, 44, 0.14)');
      gradient.addColorStop(1, 'rgba(155, 48, 44, 0)');
      this.context.fillStyle = gradient;
      this.context.beginPath();
      this.context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      this.context.fill();

      this.context.fillStyle = 'rgba(224, 134, 124, 0.65)';
      this.context.font = '11px system-ui';
      this.context.fillText(region.name.toUpperCase(), center.x - 28, center.y - radius * 0.55);
    }
  }

  private drawRoute(width: number, height: number): void {
    if (!this.model.route) return;

    const [from, to] = this.model.route.points;
    if (!from || !to) return;

    const a = this.camera.worldToScreen(from, width, height);
    const b = this.camera.worldToScreen(to, width, height);

    this.context.save();
    this.context.strokeStyle = 'rgba(122, 207, 224, 0.9)';
    this.context.lineWidth = 2;
    this.context.setLineDash([8, 8]);
    this.context.beginPath();
    this.context.moveTo(a.x, a.y);
    this.context.lineTo(b.x, b.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawLocation(location: StarMapLocationView, width: number, height: number): HitArea {
    const point = this.camera.worldToScreen(location.position, width, height);
    const radius = Math.max(7, this.camera.scale(location.radius));

    if (location.kind === 'asteroid-field') this.drawAsteroidField(point, radius);
    else if (location.kind === 'station') this.drawStation(point, radius);
    else if (location.kind === 'wreck') this.drawWreck(point, radius);
    else this.drawPlanet(location, point, radius);

    if (location.isSelected || location.isCurrent) {
      this.context.strokeStyle = location.isCurrent ? '#91e5ff' : '#e4c77d';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
      this.context.stroke();
    }

    this.context.fillStyle = '#dfe8f3';
    this.context.font = '12px system-ui';
    this.context.textAlign = 'center';
    this.context.fillText(location.name, point.x, point.y + radius + 22);

    return { id: location.id, x: point.x, y: point.y, radius: radius + 12 };
  }

  private drawPlanet(location: StarMapLocationView, point: WorldPoint, radius: number): void {
    const gradient = this.context.createRadialGradient(
      point.x - radius * 0.35,
      point.y - radius * 0.35,
      radius * 0.1,
      point.x,
      point.y,
      radius
    );
    const base = location.dangerLevel >= 2 ? '#8c5b52' : '#597ca3';
    gradient.addColorStop(0, '#d6dde3');
    gradient.addColorStop(0.35, base);
    gradient.addColorStop(1, '#162334');
    this.context.fillStyle = gradient;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawStation(point: WorldPoint, radius: number): void {
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(Math.PI / 4);
    this.context.fillStyle = '#7d8fa1';
    this.context.strokeStyle = '#b8c8d8';
    this.context.lineWidth = 2;
    this.context.fillRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
    this.context.strokeRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
    this.context.restore();
  }

  private drawAsteroidField(point: WorldPoint, radius: number): void {
    this.context.fillStyle = '#8b8176';
    for (let index = 0; index < 16; index += 1) {
      const angle = index * 2.399;
      const spread = radius * (0.25 + ((index * 37) % 70) / 100);
      const size = 2 + (index % 4);
      this.context.beginPath();
      this.context.arc(
        point.x + Math.cos(angle) * spread,
        point.y + Math.sin(angle) * spread,
        size,
        0,
        Math.PI * 2
      );
      this.context.fill();
    }
  }

  private drawWreck(point: WorldPoint, radius: number): void {
    this.context.strokeStyle = '#a68d7d';
    this.context.lineWidth = 3;
    this.context.beginPath();
    this.context.moveTo(point.x - radius, point.y + radius * 0.5);
    this.context.lineTo(point.x + radius * 0.8, point.y - radius * 0.5);
    this.context.moveTo(point.x - radius * 0.6, point.y - radius * 0.7);
    this.context.lineTo(point.x + radius, point.y + radius * 0.7);
    this.context.stroke();
  }
}

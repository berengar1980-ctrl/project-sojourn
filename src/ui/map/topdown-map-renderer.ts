import type { WorldPoint } from '../../core/world-types';
import type {
  StarMapLocationView,
  StarMapViewModel,
} from '../../features/star-map/star-map-view-model';
import { MapCamera } from './map-camera';
import { mapSymbolScale } from './map-visual-scale';
import { PlayerShipRenderer } from './player-ship-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';

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
  private readonly backgroundRenderer: SpaceBackgroundRenderer;
  private readonly planetImages = new Map<string, HTMLImageElement>();
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
    this.backgroundRenderer = new SpaceBackgroundRenderer(context, this.hashSeed(model.worldId));
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

    const timeSeconds = performance.now() / 1000;
    this.backgroundRenderer.draw({
      width,
      height,
      cameraCenter: this.camera.getCenter(),
      cameraZoom: this.camera.getZoom(),
      timeSeconds,
    });
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
      this.camera.getRelativeZoom(),
      performance.now() / 1000
    );
  }

  private drawStar(width: number, height: number): void {
    const point = this.camera.worldToScreen(this.model.star.position, width, height);
    const timeSeconds = performance.now() / 1000;
    const breathe = 1 + Math.sin(timeSeconds * 1.25) * 0.045;
    const shimmer = 0.92 + Math.sin(timeSeconds * 2.1 + 0.7) * 0.08;
    const radius = 54 * mapSymbolScale(this.camera.getRelativeZoom()) * breathe;
    const corona = this.context.createRadialGradient(
      point.x,
      point.y,
      radius * 0.65,
      point.x,
      point.y,
      radius * 2.1
    );
    corona.addColorStop(0, 'rgba(255, 246, 206, ' + 0.5 * shimmer + ')');
    corona.addColorStop(0.28, 'rgba(255, 214, 117, ' + 0.3 * shimmer + ')');
    corona.addColorStop(0.62, 'rgba(244, 164, 64, ' + 0.13 * shimmer + ')');
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
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.18, '#fffdf1');
    body.addColorStop(0.5, this.model.star.colorCore);
    body.addColorStop(0.82, this.model.star.colorCorona);
    body.addColorStop(1, '#c66a25');
    this.context.fillStyle = body;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.save();
    this.context.globalAlpha = 0.16 + shimmer * 0.1;
    this.context.strokeStyle = '#fff4ba';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius * 1.16, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();

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

    const routeStart = this.model.navigation.isTravelling ? this.model.playerShip.position : from;
    const a = this.camera.worldToScreen(routeStart, width, height);
    const b = this.camera.worldToScreen(to, width, height);

    this.context.save();
    this.context.strokeStyle = 'rgba(111, 190, 210, 0.72)';
    this.context.lineWidth = 1.4;
    this.context.setLineDash([6, 7]);
    this.context.beginPath();
    this.context.moveTo(a.x, a.y);
    this.context.lineTo(b.x, b.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawLocation(location: StarMapLocationView, width: number, height: number): HitArea {
    const point = this.camera.worldToScreen(location.position, width, height);
    const radius =
      this.locationVisualRadius(location) * mapSymbolScale(this.camera.getRelativeZoom());

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

  private locationVisualRadius(location: StarMapLocationView): number {
    if (location.kind === 'asteroid-field') return 34;
    if (location.kind === 'station') return 13;
    if (location.kind === 'wreck') return 12;
    return Math.min(30, Math.max(20, location.radius * 0.72));
  }

  private drawPlanet(location: StarMapLocationView, point: WorldPoint, radius: number): void {
    if (location.spriteUrl) {
      const image = this.ensurePlanetImage(location.spriteUrl);
      if (image.complete && image.naturalWidth > 0) {
        this.context.drawImage(image, point.x - radius, point.y - radius, radius * 2, radius * 2);
        return;
      }
    }

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

  private ensurePlanetImage(url: string): HTMLImageElement {
    const existing = this.planetImages.get(url);
    if (existing) return existing;

    const image = new Image();
    image.onload = () => this.draw();
    image.src = url;
    this.planetImages.set(url, image);
    return image;
  }

  private hashSeed(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
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

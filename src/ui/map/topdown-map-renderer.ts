import type { WorldPoint } from '../../core/world-types';
import type {
  StarMapLocationView,
  StarMapViewModel,
} from '../../features/star-map/star-map-view-model';
import { MapCamera } from './map-camera';
import { mapSymbolScale } from './map-visual-scale';
import { PlayerShipRenderer } from './player-ship-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { PlanetRingRenderer } from './planet-ring-renderer';
import { StationSymbolRenderer } from './station-symbol-renderer';

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
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly planetRings: PlanetRingRenderer;
  private readonly stationSymbols: StationSymbolRenderer;
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
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.planetRings = new PlanetRingRenderer(context);
    this.stationSymbols = new StationSymbolRenderer(context);
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

  toggleHardpointDebug(): void {
    this.shipRenderer.toggleHardpointDebug();
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
    const starPoint = this.camera.worldToScreen(this.model.star.position, width, height);
    this.shipRenderer.draw(
      this.context,
      this.model.playerShip,
      point,
      this.camera.getRelativeZoom(),
      performance.now() / 1000,
      { x: starPoint.x - point.x, y: starPoint.y - point.y }
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

    this.context.fillStyle = 'rgba(255,244,215,.86)';
    this.context.font = '600 12px system-ui';
    this.context.textAlign = 'center';
    this.context.fillText(this.model.star.name.toUpperCase(), point.x, point.y + radius + 22);
  }

  private drawOrbits(width: number, height: number): void {
    const star = this.camera.worldToScreen(this.model.star.position, width, height);
    const starRadii = this.model.locations
      .filter((location) => location.kind === 'planet' && location.showOrbit)
      .map((location) => location.orbitRadius)
      .filter((radius): radius is number => radius != null)
      .sort((a, b) => a - b);

    this.context.save();
    this.context.strokeStyle = 'rgba(129, 151, 174, .065)';
    this.context.lineWidth = 1;
    for (const orbit of starRadii) {
      this.context.beginPath();
      this.context.arc(star.x, star.y, this.camera.scale(orbit), 0, Math.PI * 2);
      this.context.stroke();
    }

    if (this.camera.getRelativeZoom() >= 1.35) this.drawChildOrbits(width, height);
    this.context.restore();
  }

  private drawChildOrbits(width: number, height: number): void {
    const drawn = new Set<string>();
    for (const location of this.model.locations) {
      if (!location.parentLocationId || location.orbitRadius == null) continue;
      const parent = this.model.locations.find(
        (candidate) => candidate.id === location.parentLocationId
      );
      if (!parent) continue;
      const key = location.parentLocationId + ':' + location.orbitRadius;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const center = this.camera.worldToScreen(parent.position, width, height);
      this.context.beginPath();
      this.context.arc(center.x, center.y, this.camera.scale(location.orbitRadius), 0, Math.PI * 2);
      this.context.stroke();
    }
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

    const starPoint = this.camera.worldToScreen(this.model.star.position, width, height);
    const light = { x: starPoint.x - point.x, y: starPoint.y - point.y };

    if (location.kind === 'asteroid-field') {
      this.spaceBodies.drawAsteroidField(location.id, point.x, point.y, radius, light);
    } else if (location.kind === 'station') {
      this.stationSymbols.draw(location.stationType ?? 'utility', point, radius);
    } else if (location.kind === 'wreck') this.drawWreck(point, radius);
    else this.drawPlanet(location, point, radius, light);

    if (location.isSelected || location.isCurrent) {
      this.context.strokeStyle = location.isCurrent ? '#91e5ff' : '#e4c77d';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
      this.context.stroke();
    }

    if (this.shouldDrawLabel(location)) {
      this.context.fillStyle = '#dfe8f3';
      this.context.font = location.kind === 'planet' ? '12px system-ui' : '11px system-ui';
      this.context.textAlign = 'center';
      this.context.fillText(location.name, point.x, point.y + radius + 20);
    }

    return { id: location.id, x: point.x, y: point.y, radius: radius + 12 };
  }

  private locationVisualRadius(location: StarMapLocationView): number {
    if (location.kind === 'asteroid-field') return 24;
    if (location.kind === 'station') return Math.min(13, Math.max(7, location.radius * 0.6));
    if (location.kind === 'wreck') return 9;
    if (location.kind === 'moon') return Math.min(12, Math.max(4, location.radius * 0.65));
    return Math.min(30, Math.max(8, location.radius * 0.55));
  }

  private shouldDrawLabel(location: StarMapLocationView): boolean {
    if (location.isSelected || location.isCurrent) return true;
    const zoom = this.camera.getRelativeZoom();
    if (location.kind === 'planet') return true;
    if (location.kind === 'station') return zoom >= 1.25;
    if (location.kind === 'moon') return zoom >= 1.55;
    return zoom >= 1.18;
  }

  private drawPlanet(
    location: StarMapLocationView,
    point: WorldPoint,
    radius: number,
    light: WorldPoint
  ): void {
    if (location.ringStyle) {
      this.planetRings.drawBack(location.ringStyle, location.id, point, radius);
    }
    this.spaceBodies.drawPlanet({
      id: location.id,
      x: point.x,
      y: point.y,
      radius,
      dangerLevel: location.dangerLevel,
      biome: location.planetBiome ?? 'temperate',
      light,
    });
    if (location.ringStyle) this.planetRings.drawFront(location.ringStyle, point, radius);
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

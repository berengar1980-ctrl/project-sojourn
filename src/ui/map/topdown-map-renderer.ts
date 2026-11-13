import type { WorldPoint } from '../../core/world-types';
import type {
  StarMapLocationView,
  StarMapViewModel,
} from '../../features/star-map/star-map-view-model';
import { MapCamera, type ScreenPoint } from './map-camera';
import {
  collectStarMapPickOptions,
  type StarMapHitArea as HitArea,
  type StarMapPick,
  type StarMapPickOption,
} from './star-map-contact-picking';
import { mapLocationVisualRadius, mapSymbolScale, mapBackgroundSeed } from './map-visual-scale';
import { OrbitalMapSceneProjection } from './orbital-map-scene-projection';
import { NavMapRenderer } from './nav-map-renderer';
import { drawStarMapDangerRegions } from './star-map-danger-regions';
import { drawStarMapWreckMarker } from './star-map-wreck-marker';
import { drawCargoMarketMarker } from './cargo-market-marker';
import { drawSectorEventMarker } from './sector-event-marker';
import { NpcShipMapRenderer } from './npc-ship-map-renderer';
import { PlayerShipRenderer } from './player-ship-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { PlanetRingRenderer } from './planet-ring-renderer';
import { ProceduralStationRenderer } from '../space/procedural-station-renderer';

export type StarMapDisplayMode = 'physical' | 'nav';
export class TopdownMapRenderer {
  private readonly context: CanvasRenderingContext2D;
  private camera: MapCamera;
  private readonly shipRenderer: PlayerShipRenderer;
  private readonly navRenderer: NavMapRenderer;
  private readonly backgroundRenderer: SpaceBackgroundRenderer;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly planetRings: PlanetRingRenderer;
  private readonly stations: ProceduralStationRenderer;
  private readonly npcShips: NpcShipMapRenderer;
  private readonly orbitalProjection = new OrbitalMapSceneProjection();
  private model: StarMapViewModel;
  private displayMode: StarMapDisplayMode = 'nav';
  private labelsVisible = true;
  private dangerOverlayVisible = true;
  private dangerBands = { green: true, yellow: true, red: true };
  private cargoOverlay: ReadonlyMap<string, 'best' | 'good' | 'low'> = new Map();
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
    this.navRenderer = new NavMapRenderer(context);
    this.backgroundRenderer = new SpaceBackgroundRenderer(context, mapBackgroundSeed(model.worldId));
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.planetRings = new PlanetRingRenderer(context);
    this.stations = new ProceduralStationRenderer(context);
    this.npcShips = new NpcShipMapRenderer(context, () => this.draw());
    this.resize();
  }

  update(model: StarMapViewModel): void {
    if (model.worldId !== this.model.worldId) {
      this.camera = new MapCamera(model.width, model.height);
      this.orbitalProjection.reset();
      this.npcShips.resetOrbitVisuals();
      this.hasFitted = false;
    }
    this.model = model;
    if (!this.hasFitted) this.resize();
    else this.draw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (rect.width >= 200 && rect.height >= 200) {
      if (!this.hasFitted) {
        this.camera.fit(rect.width, rect.height, this.contentBounds());
        this.hasFitted = true;
      } else {
        this.camera.updateViewport(rect.width, rect.height, this.contentBounds());
      }
    }
    this.draw();
  }

  resetCamera(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.fit(rect.width, rect.height, this.contentBounds());
    this.draw();
  }

  toggleHardpointDebug(): void {
    this.shipRenderer.toggleHardpointDebug();
  }

  setDisplayMode(mode: StarMapDisplayMode): void {
    if (this.displayMode === mode) return;
    this.displayMode = mode;
    this.draw();
  }

  setLabelsVisible(visible: boolean): void {
    if (this.labelsVisible === visible) return;
    this.labelsVisible = visible;
    this.draw();
  }

  setDangerOverlay(visible: boolean): void {
    this.dangerOverlayVisible = visible;
    this.draw();
  }

  setDangerBand(band: 'green' | 'yellow' | 'red', visible: boolean): void {
    this.dangerBands[band] = visible;
    this.draw();
  }

  setCargoOverlay(markers: ReadonlyMap<string, 'best' | 'good' | 'low'>): void {
    this.cargoOverlay = markers;
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

  pickContacts(x: number, y: number): StarMapPickOption[] {
    return collectStarMapPickOptions(this.hitAreas, this.model, x, y);
  }

  pickContact(x: number, y: number): StarMapPick | null {
    const first = this.pickContacts(x, y)[0];
    return first ? { kind: first.kind, id: first.id } : null;
  }

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    this.context.clearRect(0, 0, width, height);

    const timeSeconds = performance.now() / 1000;
    if (this.displayMode === 'nav') {
      const origin = this.camera.worldToScreen(this.model.star.position, width, height);
      this.navRenderer.drawBackground(
        width,
        height,
        timeSeconds,
        origin,
        this.camera.getRelativeZoom()
      );
    } else {
      this.backgroundRenderer.draw({
        width,
        height,
        cameraCenter: this.camera.getCenter(),
        cameraZoom: this.camera.getZoom(),
        timeSeconds,
      });
    }
    drawStarMapDangerRegions(this.context, this.camera, this.model.regions, this.dangerBands, this.dangerOverlayVisible, width, height);
    const orbitalAngles = this.orbitalProjection.angles(this.model, this.camera);
    const playerPoint = this.orbitalProjection.playerPoint(
      this.model,
      this.camera,
      width,
      height,
      orbitalAngles
    );
    this.drawOrbits(width, height);
    this.drawStar(width, height);
    this.drawRoute(width, height, playerPoint);
    this.npcShips.drawPursuitLine(
      this.model,
      this.camera,
      width,
      height,
      playerPoint,
      orbitalAngles
    );
    const locationHits = this.model.locations.map((location) =>
      this.drawLocation(location, width, height)
    );
    const npcHits = this.npcShips
      .draw(
        this.model,
        this.camera,
        width,
        height,
        this.labelsVisible,
        this.displayMode === 'nav',
        orbitalAngles
      )
      .map((hit) => ({ ...hit, kind: 'npc' as const }));
    this.hitAreas = [...npcHits, ...locationHits];
    this.drawPlayerShip(width, height, playerPoint);
  }

  private contentBounds() {
    const points = [
      this.model.star.position,
      ...this.model.locations.map((location) => location.position),
    ];
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const padding = 180;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    };
  }

  private drawPlayerShip(width: number, height: number, point: ScreenPoint): void {
    if (this.displayMode === 'nav') {
      this.navRenderer.drawShip(
        point,
        this.model.playerShip.headingRadians,
        this.camera.getRelativeZoom()
      );
      return;
    }

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
    if (this.displayMode === 'nav') {
      this.navRenderer.drawStar(point, this.camera.getRelativeZoom());
      return;
    }

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

    if (this.labelsVisible) {
      this.context.fillStyle = 'rgba(255,244,215,.86)';
      this.context.font = '600 12px system-ui';
      this.context.textAlign = 'center';
      this.context.fillText(this.model.star.name.toUpperCase(), point.x, point.y + radius + 22);
    }
  }

  private drawOrbits(width: number, height: number): void {
    const star = this.camera.worldToScreen(this.model.star.position, width, height);
    const starOrbits = this.model.locations
      .filter((location) => location.kind === 'planet' && location.showOrbit)
      .map((location) => ({
        radius: location.orbitRadius,
        emphasized: location.isSelected || location.isCurrent,
      }))
      .filter((orbit): orbit is { radius: number; emphasized: boolean } => orbit.radius != null)
      .sort((a, b) => a.radius - b.radius);

    this.context.save();
    for (const orbit of starOrbits) {
      this.context.strokeStyle = orbit.emphasized
        ? 'rgba(129, 151, 174, .12)'
        : 'rgba(129, 151, 174, .026)';
      this.context.lineWidth = orbit.emphasized ? 1.2 : 0.7;
      this.context.beginPath();
      this.context.arc(star.x, star.y, this.camera.scale(orbit.radius), 0, Math.PI * 2);
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

  private drawRoute(width: number, height: number, playerPoint: ScreenPoint): void {
    const route = this.model.route;
    if (!route || route.points.length < 2) return;

    const routePoints = [...route.points];
    if (this.model.navigation.isTravelling) routePoints[0] = this.model.playerShip.position;

    this.context.save();
    this.context.strokeStyle = 'rgba(111, 190, 210, 0.72)';
    this.context.lineWidth = 1.4;
    this.context.setLineDash([6, 7]);
    this.context.beginPath();
    routePoints.forEach((point, index) => {
      const screen = index === 0 ? playerPoint : this.camera.worldToScreen(point, width, height);
      if (index === 0) this.context.moveTo(screen.x, screen.y);
      else this.context.lineTo(screen.x, screen.y);
    });
    this.context.stroke();
    this.context.restore();
  }

  private drawLocation(location: StarMapLocationView, width: number, height: number): HitArea {
    const point = this.camera.worldToScreen(location.position, width, height);
    const radius = mapLocationVisualRadius(location, this.camera.getRelativeZoom());

    const starPoint = this.camera.worldToScreen(this.model.star.position, width, height);
    const light = { x: starPoint.x - point.x, y: starPoint.y - point.y };

    if (this.displayMode === 'nav') this.navRenderer.drawLocation(location, point, radius);
    else if (location.kind === 'asteroid-field') {
      this.spaceBodies.drawAsteroidField(location.id, point.x, point.y, radius, light);
    } else if (location.kind === 'station') {
      this.stations.draw({
        id: location.id,
        type: location.stationType ?? 'utility',
        point,
        radius,
        detailLevel: 'map',
        light,
      });
    } else if (location.kind === 'wreck') drawStarMapWreckMarker(this.context, point, radius);
    else this.drawPlanet(location, point, radius, light);

    drawSectorEventMarker(this.context, location.id, point, radius);
    const cargoRating = this.cargoOverlay.get(location.id);
    if (cargoRating) drawCargoMarketMarker(this.context, point, radius, cargoRating);

    if (location.isSelected || location.isCurrent) {
      this.context.strokeStyle = location.isCurrent ? '#91e5ff' : '#e4c77d';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
      this.context.stroke();
    }

    if (this.labelsVisible && this.shouldDrawLabel(location)) {
      this.drawLocationLabel(location, point.x, point.y + radius + 20);
    }

    return {
      kind: 'location',
      id: location.id,
      x: point.x,
      y: point.y,
      radius: radius + 12,
    };
  }
  private shouldDrawLabel(location: StarMapLocationView): boolean {
    if (location.isSelected || location.isCurrent) return true;
    if (location.id.startsWith('salvage-special-') || location.id.startsWith('salvage-distress-')) {
      return true;
    }
    const zoom = this.camera.getRelativeZoom();
    if (location.kind === 'planet') return true;
    if (location.kind === 'station') return zoom >= 0.98;
    if (location.kind === 'moon') return zoom >= 1.18;
    return zoom >= 1.05;
  }

  private drawLocationLabel(location: StarMapLocationView, x: number, y: number): void {
    const font =
      this.displayMode === 'nav'
        ? '10px ui-monospace, monospace'
        : location.kind === 'planet'
          ? '11px system-ui'
          : '10px system-ui';
    this.context.save();
    this.context.font = font;
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    const width = this.context.measureText(location.name).width;
    const horizontalPadding = 6;
    const height = 17;
    this.context.fillStyle =
      this.displayMode === 'nav' ? 'rgba(3, 16, 12, .78)' : 'rgba(4, 11, 16, .78)';
    this.context.strokeStyle =
      location.isSelected || location.isCurrent
        ? 'rgba(140, 211, 229, .48)'
        : 'rgba(112, 139, 151, .24)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.roundRect(
      x - width / 2 - horizontalPadding,
      y - height / 2,
      width + horizontalPadding * 2,
      height,
      3
    );
    this.context.fill();
    this.context.stroke();
    this.context.fillStyle = this.displayMode === 'nav' ? '#8fd7b1' : '#dfe8f3';
    this.context.fillText(location.name, x, y);
    this.context.restore();
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


}

import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipHardpointDebugRenderer } from '../ships/ship-hardpoint-debug-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
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
  private readonly hardpointDebug = new ShipHardpointDebugRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private readonly shipLighting = new ShipLightingRenderer();
  private readonly shieldImpacts = new ShieldImpactRenderer();
  private readonly backgroundRenderer: SpaceBackgroundRenderer;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly shipImage = new Image();
  private model: LocalSpaceViewModel;
  private hitAreas: readonly AsteroidHitArea[] = [];
  private loadedShipUrl = '';
  private hasFitted = false;
  private debugHardpoints = false;
  private scanLabelsVisible = true;

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
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
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
      this.camera.zoomAt(3, { x: rect.width / 2, y: rect.height / 2 }, rect.width, rect.height);
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

  toggleHardpointDebug(): void {
    this.debugHardpoints = !this.debugHardpoints;
    this.draw();
  }

  setScanLabelsVisible(visible: boolean): void {
    this.scanLabelsVisible = visible;
    this.draw();
  }

  worldPointAt(x: number, y: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.screenToWorld({ x, y }, rect.width, rect.height);
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
      if (hitArea && asteroid.kind === 'resource') hitAreas.push(hitArea);
    }
    this.hitAreas = hitAreas;

    this.drawChunks(width, height);
    this.drawNavigationRoute(width, height);
    this.drawLongRangeScan(width, height, timeSeconds);
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds);
    this.drawShip(geometry, timeSeconds);
    if (this.debugHardpoints) {
      this.hardpointDebug.draw(this.context, this.model.ship.hardpoints, geometry);
    }
  }

  private drawAsteroid(
    asteroid: LocalAsteroidView,
    width: number,
    height: number
  ): AsteroidHitArea | null {
    const point = this.camera.worldToScreen(asteroid.position, width, height);
    const minimumRadius = asteroid.kind === 'debris' ? 2 : 10;
    const radius = Math.max(minimumRadius, this.camera.scale(asteroid.radius));
    const cullPadding = radius + 20;
    if (
      point.x < -cullPadding ||
      point.y < -cullPadding ||
      point.x > width + cullPadding ||
      point.y > height + cullPadding
    ) {
      return null;
    }

    this.spaceBodies.drawAsteroid({
      id: asteroid.id,
      x: point.x,
      y: point.y,
      radius,
      rotation: asteroid.rotation,
      kind: asteroid.kind,
      light: { x: -0.72, y: -0.56 },
    });

    if (asteroid.kind === 'resource') {
      this.drawScanMarker(asteroid, point, radius);
      this.drawScanCallout(asteroid, point, radius);
    }

    if (
      asteroid.kind === 'resource' &&
      (asteroid.isSelected || asteroid.isMiningTarget || asteroid.isScanTarget)
    ) {
      this.context.strokeStyle =
        asteroid.isMiningTarget || asteroid.isScanTarget ? '#67d1e8' : '#dfc173';
      this.context.lineWidth = 1.7;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2);
      this.context.stroke();
    }

    return { id: asteroid.id, point, radius: radius + 10 };
  }

  private drawScanMarker(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
    if (asteroid.scanLevel === 'unscanned') return;

    this.context.save();
    this.context.setLineDash(asteroid.scanLevel === 'surveyed' ? [3, 4] : []);
    this.context.lineWidth = asteroid.scanLevel === 'analyzed' ? 1.8 : 1.2;

    if (asteroid.surveyResult === 'empty') {
      this.context.strokeStyle = 'rgba(126, 137, 145, .72)';
    } else if (asteroid.scanLevel === 'analyzed') {
      this.context.strokeStyle = 'rgba(103, 209, 232, .9)';
    } else {
      this.context.strokeStyle = 'rgba(126, 220, 151, .82)';
    }

    this.context.beginPath();
    this.context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private scanCalloutLines(asteroid: LocalAsteroidView): readonly string[] {
    if (asteroid.scanLevel === 'unscanned') return [];
    if (asteroid.surveyResult === 'empty') return ['LEER'];
    if (asteroid.scanLevel === 'surveyed') {
      return asteroid.deposits.map(() => '???');
    }

    return asteroid.deposits.map((deposit) => {
      const name = deposit.resourceName?.toUpperCase() ?? '???';
      const amount = Math.round(deposit.estimatedAmount ?? 0);
      return name + ' · ~' + amount;
    });
  }

  private drawScanCallout(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
    if (!this.scanLabelsVisible) return;
    const lines = this.scanCalloutLines(asteroid);
    if (lines.length === 0) return;

    const startX = point.x + radius * 0.72;
    const startY = point.y - radius * 0.72;
    const bendX = startX + 10;
    const bendY = startY - 10;
    const endX = bendX + 8;

    this.context.save();
    this.context.strokeStyle =
      asteroid.scanLevel === 'analyzed' ? 'rgba(121, 220, 237, .82)' : 'rgba(139, 192, 153, .72)';
    this.context.fillStyle =
      asteroid.scanLevel === 'analyzed' ? 'rgba(179, 235, 244, .92)' : 'rgba(168, 205, 178, .84)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(bendX, bendY);
    this.context.lineTo(endX, bendY);
    this.context.stroke();
    this.context.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    this.context.textBaseline = 'middle';
    lines.forEach((line, index) => {
      this.context.fillText(line, endX + 4, bendY + index * 12);
    });
    this.context.restore();
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
    const engineIntensity = Math.max(0, Math.min(1, this.model.ship.speed / 240));
    const maneuverDemand = {
      turnRateRadiansPerSecond: this.model.ship.turnRateRadiansPerSecond,
      angularThrust: this.model.ship.angularThrust,
      lateralThrust: this.model.ship.lateralThrust,
    };

    this.engineEffects.drawExhaust(this.context, source, geometry, engineIntensity, timeSeconds);
    this.maneuverEffects.drawExhaust(this.context, source, geometry, maneuverDemand, timeSeconds);

    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(geometry.angle);

    if (this.shipImage.complete && this.shipImage.naturalWidth > 0) {
      const offset = spriteDrawOffset(source, geometry);
      this.shipLighting.draw(this.context, {
        image: this.shipImage,
        width: geometry.width,
        height: geometry.height,
        angle: geometry.angle,
        light: { x: -0.72, y: -0.56 },
        offsetX: offset.x,
        offsetY: offset.y,
      });
    }

    this.context.restore();

    this.engineEffects.drawGlow(this.context, source, geometry, engineIntensity, timeSeconds);
    this.maneuverEffects.drawGlow(this.context, source, geometry, maneuverDemand, timeSeconds);

    this.shieldImpacts.draw(this.context, this.model.shieldImpacts, source, geometry);
  }

  private drawLongRangeScan(width: number, height: number, timeSeconds: number): void {
    const progress = this.model.longRangeScanProgress;
    if (progress == null) return;

    const center = this.camera.worldToScreen(this.model.ship.position, width, height);
    const maximumRadius = Math.max(width, height) * 0.68;
    const radius = Math.max(8, maximumRadius * (0.08 + progress * 0.92));
    const pulse = 0.72 + Math.sin(timeSeconds * 9) * 0.18;

    this.context.save();
    this.context.strokeStyle = `rgba(97, 222, 242, ${0.48 * (1 - progress * 0.42)})`;
    this.context.lineWidth = 1.4;
    this.context.shadowColor = 'rgba(84, 207, 238, .55)';
    this.context.shadowBlur = 5;
    this.context.beginPath();
    this.context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.globalAlpha = pulse * 0.45;
    this.context.beginPath();
    this.context.arc(center.x, center.y, radius * 0.72, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private drawNavigationRoute(width: number, height: number): void {
    const route = this.model.navigationRoute;
    const target = this.model.navigationTarget;
    if (!target || route.length === 0) return;

    this.context.save();
    this.context.strokeStyle = 'rgba(104, 213, 239, .7)';
    this.context.lineWidth = 1.25;
    this.context.setLineDash([6, 6]);
    this.context.beginPath();

    route.forEach((point, index) => {
      const screen = this.camera.worldToScreen(point, width, height);
      if (index === 0) this.context.moveTo(screen.x, screen.y);
      else this.context.lineTo(screen.x, screen.y);
    });
    this.context.stroke();
    this.context.setLineDash([]);

    const point = this.camera.worldToScreen(target, width, height);
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.12;
    const radius = 8 * pulse;
    this.context.strokeStyle = 'rgba(119, 226, 248, .9)';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(point.x - radius - 5, point.y);
    this.context.lineTo(point.x + radius + 5, point.y);
    this.context.moveTo(point.x, point.y - radius - 5);
    this.context.lineTo(point.x, point.y + radius + 5);
    this.context.stroke();
    this.context.restore();
  }

  private drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue;
      const variation = (hashId(chunk.id) % 100) / 100;
      const radius = 1.5 + variation * 2.2;
      this.context.fillStyle = '#a88f73';
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}
